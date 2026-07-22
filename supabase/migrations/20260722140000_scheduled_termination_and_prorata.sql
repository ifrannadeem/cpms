-- Live-use bug (Suite 2.7, Southgate): "End Tenancy" with a FUTURE date terminated
-- the lease immediately (vacated the unit, stopped the meter, removed it from lists)
-- instead of scheduling the end and continuing to bill until then.
--
-- 1) fn_terminate_lease: a future date now records NOTICE and keeps the lease active
--    and billing until the date; today/backdated still ends immediately.
-- 2) fn_apply_due_terminations: applies the end (TERMINATED, vacate unit, stop meter)
--    on/after the scheduled date. Scheduled nightly, before the state refresh.
-- 3) fn_generate_asset_rent_charges: the month containing the end date bills pro-rata
--    (days occupied, inclusive of the leaving day, over days in the month).

-- ---------------------------------------------------------------
-- 1. fn_terminate_lease — future = scheduled, today/past = immediate
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_terminate_lease(
  p_lease_id uuid, p_termination_date date, p_reason text DEFAULT 'SURRENDER'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_old leases%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;
  IF v_old.lease_state = 'TERMINATED' THEN RAISE EXCEPTION 'Lease already terminated'; END IF;

  IF p_termination_date > CURRENT_DATE THEN
    -- Scheduled end: record notice; unit stays occupied, meter keeps running,
    -- billing continues (final month pro-rata). Ended on the date by the nightly job.
    UPDATE leases SET
      termination_date   = p_termination_date,
      termination_reason = p_reason::termination_reason_enum,
      lease_state        = 'APPROACHING_EXPIRY',
      updated_at = now()
    WHERE lease_id = p_lease_id;

    INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
    VALUES (v_old.tenant_id, p_lease_id, 'OTHER',
      'Notice recorded: tenancy ends ' || TO_CHAR(p_termination_date, 'DD Mon YYYY') ||
      ' (' || LOWER(p_reason) || '). Billing continues to the end date; final month pro-rata.');
    RETURN true;
  END IF;

  -- Immediate termination (today or backdated)
  UPDATE leases SET
    lease_state = 'TERMINATED',
    termination_date = p_termination_date,
    termination_reason = p_reason::termination_reason_enum,
    active = false,
    updated_at = now()
  WHERE lease_id = p_lease_id;

  UPDATE units SET unit_state = 'VACANT', vacancy_start_date = p_termination_date, updated_at = now()
  WHERE unit_id IN (SELECT unit_id FROM lease_units WHERE lease_id = p_lease_id);

  UPDATE meters SET active = false, updated_at = now()
  WHERE unit_id IN (SELECT unit_id FROM lease_units WHERE lease_id = p_lease_id);

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_old.tenant_id, p_lease_id, 'OTHER',
    'Tenancy ended ' || TO_CHAR(p_termination_date, 'DD Mon YYYY') || ' (' || LOWER(p_reason) || ')');
  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------
-- 2. fn_apply_due_terminations — end scheduled tenancies once the date passes
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_apply_due_terminations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count integer := 0; v_lease RECORD;
BEGIN
  FOR v_lease IN
    SELECT lease_id, tenant_id, termination_date, termination_reason
    FROM leases
    WHERE active = true
      AND lease_state <> 'TERMINATED'
      AND termination_date IS NOT NULL
      AND termination_date < CURRENT_DATE
  LOOP
    UPDATE leases SET lease_state = 'TERMINATED', active = false, updated_at = now()
    WHERE lease_id = v_lease.lease_id;

    UPDATE units SET unit_state = 'VACANT', vacancy_start_date = v_lease.termination_date, updated_at = now()
    WHERE unit_id IN (SELECT unit_id FROM lease_units WHERE lease_id = v_lease.lease_id);

    UPDATE meters SET active = false, updated_at = now()
    WHERE unit_id IN (SELECT unit_id FROM lease_units WHERE lease_id = v_lease.lease_id);

    INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
    VALUES (v_lease.tenant_id, v_lease.lease_id, 'SYSTEM',
      'Tenancy ended ' || TO_CHAR(v_lease.termination_date, 'DD Mon YYYY') ||
      ' (' || LOWER(COALESCE(v_lease.termination_reason::text, 'expiry')) || ') — scheduled end applied.');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_apply_due_terminations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_apply_due_terminations() TO authenticated;

-- Nightly at 02:20, before the lease-state refresh (02:25) so a scheduled end wins
-- over the periodic-holdover recalculation.
DO $$ BEGIN PERFORM cron.unschedule('cpms-apply-terminations'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('cpms-apply-terminations', '20 2 * * *', $$SELECT public.fn_apply_due_terminations();$$);

-- ---------------------------------------------------------------
-- 3. fn_generate_asset_rent_charges — final-month pro-rata
--    (body identical to 20260704120100 plus the pro-rata block)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_generate_asset_rent_charges(p_billing_month date, p_asset_id uuid)
 RETURNS TABLE(out_lease_id uuid, out_tenant_name text, out_charge_id uuid, out_net_amount numeric, out_label text, out_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period_start  DATE;
  v_period_end    DATE;
  v_lease         RECORD;
  v_profile       RECORD;
  v_incentive     RECORD;
  v_unit_id       UUID;
  v_net_amount    NUMERIC(12,2);
  v_vat_rate      NUMERIC(5,4);
  v_vat_amount    NUMERIC(12,2);
  v_charge_id     UUID;
  v_label         TEXT;
  v_due_date      DATE;
  v_msg           TEXT;
  v_days_occ      INTEGER;
  v_days_month    INTEGER;
BEGIN
  v_period_start := DATE_TRUNC('month', p_billing_month)::DATE;
  v_period_end   := (DATE_TRUNC('month', p_billing_month) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  FOR v_lease IN
    SELECT l.*, COALESCE(t.trading_name, t.legal_name) AS tenant_display_name
    FROM leases l
    JOIN tenants t ON t.tenant_id = l.tenant_id
    WHERE l.asset_id = p_asset_id
      AND l.lease_state IN ('ACTIVE','PERIODIC','APPROACHING_REVIEW','APPROACHING_EXPIRY')
      AND l.active = TRUE
      AND l.commencement_date <= v_period_end
      AND (l.termination_date IS NULL OR l.termination_date >= v_period_start)
  LOOP
    SELECT * INTO v_profile
    FROM charge_profiles cp
    WHERE cp.lease_id = v_lease.lease_id AND cp.charge_type = 'RENT'
      AND cp.applies = TRUE AND cp.active = TRUE
    LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM charge_records cr
      WHERE cr.lease_id = v_lease.lease_id AND cr.charge_type = 'RENT'
        AND cr.period_start = v_period_start
    ) THEN CONTINUE; END IF;

    -- Deterministic primary unit: lowest unit_reference on the lease
    SELECT lu.unit_id INTO v_unit_id
    FROM lease_units lu
    JOIN units u ON u.unit_id = lu.unit_id
    WHERE lu.lease_id = v_lease.lease_id
    ORDER BY u.unit_reference
    LIMIT 1;
    IF v_unit_id IS NULL THEN CONTINUE; END IF;

    -- Rent derives from the lease (profile amount only as a fallback)
    v_net_amount := ROUND(COALESCE(v_lease.annual_rent, v_profile.fixed_amount_annual) / 12.0, 2);
    v_msg := NULL;

    SELECT * INTO v_incentive
    FROM rent_incentives ri
    WHERE ri.lease_id = v_lease.lease_id
      AND ri.active = TRUE
      AND (ri.incentive_start_date IS NULL OR ri.incentive_start_date <= v_period_start)
      AND (ri.incentive_end_date IS NULL OR ri.incentive_end_date >= v_period_start)
    ORDER BY ri.incentive_start_date DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
      IF v_incentive.incentive_type = 'RENT_FREE' THEN
        v_net_amount := 0.00;
        v_msg := 'Rent-free period active';
      ELSIF v_incentive.billed_amount_monthly IS NOT NULL THEN
        v_net_amount := ROUND(v_incentive.billed_amount_monthly, 2);
        v_msg := 'Incentive applied: ' || v_incentive.incentive_type;
      END IF;
    ELSIF v_lease.rent_free_end_date IS NOT NULL AND v_lease.rent_free_end_date >= v_period_start THEN
      v_net_amount := 0.00;
      v_msg := 'Rent-free period active';
    END IF;

    -- Final-month pro-rata: the tenancy ends within this month, so bill only the
    -- days occupied (inclusive of the leaving day) over the days in the month.
    IF v_lease.termination_date IS NOT NULL
       AND v_lease.termination_date >= v_period_start
       AND v_lease.termination_date <= v_period_end
       AND v_net_amount > 0 THEN
      v_days_occ   := (v_lease.termination_date - v_period_start) + 1;
      v_days_month := (v_period_end - v_period_start) + 1;
      v_net_amount := ROUND(v_net_amount * v_days_occ::numeric / v_days_month::numeric, 2);
      v_msg := COALESCE(v_msg || ' | ', '')
               || 'Final month pro-rata: ' || v_days_occ || '/' || v_days_month
               || ' days to ' || TO_CHAR(v_lease.termination_date, 'DD Mon YYYY');
    END IF;

    v_vat_rate   := CASE v_profile.vat_treatment WHEN 'STANDARD' THEN 0.2000 ELSE 0.0000 END;
    v_vat_amount := ROUND(v_net_amount * v_vat_rate, 2);
    v_label      := 'Rent ' || TO_CHAR(v_period_start, 'FMMonth YYYY');
    v_due_date   := (DATE_TRUNC('month', p_billing_month) + (COALESCE(v_lease.billing_day, 1) - 1) * INTERVAL '1 day')::DATE;
    v_charge_id  := gen_random_uuid();

    INSERT INTO charge_records (
      charge_id, lease_id, unit_id, tenant_id, asset_id,
      charge_type, charge_label, period_start, period_end,
      net_amount, vat_amount, vat_rate, due_date, status, generated_by, notes
    ) VALUES (
      v_charge_id, v_lease.lease_id, v_unit_id, v_lease.tenant_id, v_lease.asset_id,
      'RENT', v_label, v_period_start, v_period_end,
      v_net_amount, v_vat_amount, v_vat_rate, v_due_date, 'DRAFT', 'SYSTEM', v_msg
    );

    RETURN QUERY SELECT
      v_lease.lease_id, v_lease.tenant_display_name, v_charge_id, v_net_amount, v_label, COALESCE(v_msg, 'OK');
  END LOOP;
END;
$function$;

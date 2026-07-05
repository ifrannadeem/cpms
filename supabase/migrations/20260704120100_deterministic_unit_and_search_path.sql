-- 1) fn_generate_asset_rent_charges: the charge's unit was picked with LIMIT 1 and no
--    ORDER BY, so multi-unit leases attributed rent to a non-deterministic unit.
--    Now picks the lowest unit_reference, consistently. Body otherwise identical to the
--    live version captured 2026-07-04 (supabase/schema/functions.sql), plus a pinned
--    search_path (Supabase linter: function_search_path_mutable).
--
-- 2) Pins search_path on the remaining CPMS-owned SECURITY DEFINER / trigger functions
--    flagged by the linter. mgmt_* app functions are deliberately left alone.

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

-- Pin search_path on remaining CPMS-owned functions flagged by the Supabase linter.
ALTER FUNCTION public.check_unique_active_lease_per_unit() SET search_path TO 'public';
ALTER FUNCTION public.fn_calculate_lease_state(lease_state_enum, date, numeric) SET search_path TO 'public';
ALTER FUNCTION public.fn_generate_rent_charges(date) SET search_path TO 'public';
ALTER FUNCTION public.fn_refresh_lease_states() SET search_path TO 'public';
ALTER FUNCTION public.fn_update_arrears() SET search_path TO 'public';
ALTER FUNCTION public.update_updated_at_column() SET search_path TO 'public';

-- Part-month pro-rata for BOTH ends of a tenancy, and a matching Preview.
--
-- 1) Commencement pro-rata (owner request 2026-07-26): a tenancy starting mid-month
--    previously billed a full month. It now bills only the days occupied, the same
--    way the final month already does.
-- 2) fn_preview_asset_rent_charges had NO pro-rata at all — not even the final-month
--    rule added in 20260722140000 — so Preview and Generate could disagree (Suite 2.7
--    would preview at GBP 460 but generate at GBP 252.26). Both now share one rule.
--
-- The rule: bill days occupied within the month, both ends inclusive, over days in
-- the month. Rent starts at rent_commencement_date (falling back to commencement_date)
-- and ends at termination_date. A lease not in occupation at all that month is skipped.
-- Rent-free and incentive months are already zero or fixed, so pro-rata leaves them be.

-- ---------------------------------------------------------------
-- 1. Generator
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
  v_rent_start    DATE;
  v_occ_from      DATE;
  v_occ_to        DATE;
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
      AND COALESCE(l.rent_commencement_date, l.commencement_date) <= v_period_end
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

    -- Part-month pro-rata: covers a tenancy starting mid-month, ending mid-month,
    -- or both within the same month.
    v_rent_start := COALESCE(v_lease.rent_commencement_date, v_lease.commencement_date);
    v_occ_from   := GREATEST(v_period_start, v_rent_start);
    v_occ_to     := LEAST(v_period_end, COALESCE(v_lease.termination_date, v_period_end));
    v_days_month := (v_period_end - v_period_start) + 1;
    v_days_occ   := (v_occ_to - v_occ_from) + 1;

    IF v_days_occ <= 0 THEN CONTINUE; END IF;  -- not in occupation this month

    IF v_days_occ < v_days_month AND v_net_amount > 0 THEN
      v_net_amount := ROUND(v_net_amount * v_days_occ::numeric / v_days_month::numeric, 2);
      v_msg := COALESCE(v_msg || ' | ', '')
               || 'Part month pro-rata: ' || v_days_occ || '/' || v_days_month || ' days ('
               || TO_CHAR(v_occ_from, 'DD Mon') || ' to ' || TO_CHAR(v_occ_to, 'DD Mon YYYY') || ')';
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

-- ---------------------------------------------------------------
-- 2. Preview — same rule, so the dry run matches what Generate will create
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_preview_asset_rent_charges(p_billing_month date, p_asset_id uuid)
 RETURNS TABLE(lease_id uuid, tenant_name text, unit_reference text, net_amount numeric, vat_rate numeric, vat_amount numeric, gross_amount numeric, label text, already_exists boolean, note text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH p AS (
    SELECT date_trunc('month', p_billing_month)::date AS ps,
           (date_trunc('month', p_billing_month) + interval '1 month' - interval '1 day')::date AS pe
  )
  SELECT
    l.lease_id,
    COALESCE(t.trading_name, t.legal_name) AS tenant_name,
    u.unit_reference,
    calc.net_amount,
    b.vat_rate,
    round(calc.net_amount * b.vat_rate, 2) AS vat_amount,
    (calc.net_amount + round(calc.net_amount * b.vat_rate, 2)) AS gross_amount,
    'Rent ' || to_char(p.ps, 'FMMonth YYYY') AS label,
    EXISTS (
      SELECT 1 FROM charge_records cr
      WHERE cr.lease_id = l.lease_id AND cr.charge_type = 'RENT' AND cr.period_start = p.ps
    ) AS already_exists,
    calc.note
  FROM p
  JOIN leases l ON l.asset_id = p_asset_id AND l.active = TRUE
    AND l.lease_state IN ('ACTIVE','PERIODIC','APPROACHING_REVIEW','APPROACHING_EXPIRY')
    AND COALESCE(l.rent_commencement_date, l.commencement_date) <= p.pe
    AND (l.termination_date IS NULL OR l.termination_date >= p.ps)
  JOIN tenants t ON t.tenant_id = l.tenant_id
  JOIN charge_profiles cp ON cp.lease_id = l.lease_id AND cp.charge_type = 'RENT'
    AND cp.applies = TRUE AND cp.active = TRUE
  JOIN LATERAL (
    SELECT lu.unit_id FROM lease_units lu
    JOIN units uu ON uu.unit_id = lu.unit_id
    WHERE lu.lease_id = l.lease_id ORDER BY uu.unit_reference LIMIT 1
  ) ul ON TRUE
  JOIN units u ON u.unit_id = ul.unit_id
  LEFT JOIN LATERAL (
    SELECT ri.incentive_type, ri.billed_amount_monthly
    FROM rent_incentives ri
    WHERE ri.lease_id = l.lease_id AND ri.active = TRUE
      AND (ri.incentive_start_date IS NULL OR ri.incentive_start_date <= p.ps)
      AND (ri.incentive_end_date IS NULL OR ri.incentive_end_date >= p.ps)
    ORDER BY ri.incentive_start_date DESC NULLS LAST
    LIMIT 1
  ) inc ON TRUE
  CROSS JOIN LATERAL (
    SELECT
      GREATEST(p.ps, COALESCE(l.rent_commencement_date, l.commencement_date)) AS occ_from,
      LEAST(p.pe, COALESCE(l.termination_date, p.pe))                         AS occ_to,
      ((p.pe - p.ps) + 1)                                                     AS days_month
  ) w
  CROSS JOIN LATERAL (SELECT ((w.occ_to - w.occ_from) + 1) AS days_occ) d
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN inc.incentive_type = 'RENT_FREE' THEN 0.00
        WHEN inc.billed_amount_monthly IS NOT NULL THEN round(inc.billed_amount_monthly, 2)
        WHEN l.rent_free_end_date IS NOT NULL AND l.rent_free_end_date >= p.ps THEN 0.00
        ELSE round(COALESCE(l.annual_rent, cp.fixed_amount_annual) / 12.0, 2)
      END AS base_net,
      CASE cp.vat_treatment WHEN 'STANDARD' THEN 0.2000 ELSE 0.0000 END AS vat_rate,
      CASE
        WHEN inc.incentive_type = 'RENT_FREE' THEN 'Rent-free period active'
        WHEN inc.billed_amount_monthly IS NOT NULL THEN 'Incentive applied: ' || inc.incentive_type
        WHEN l.rent_free_end_date IS NOT NULL AND l.rent_free_end_date >= p.ps THEN 'Rent-free period active'
        ELSE NULL
      END AS base_note
  ) b
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN d.days_occ < w.days_month AND b.base_net > 0
           THEN round(b.base_net * d.days_occ::numeric / w.days_month::numeric, 2)
           ELSE b.base_net END AS net_amount,
      CASE WHEN d.days_occ < w.days_month AND b.base_net > 0
           THEN COALESCE(b.base_note || ' | ', '')
                || 'Part month pro-rata: ' || d.days_occ || '/' || w.days_month || ' days ('
                || to_char(w.occ_from, 'DD Mon') || ' to ' || to_char(w.occ_to, 'DD Mon YYYY') || ')'
           ELSE b.base_note END AS note
  ) calc
  WHERE d.days_occ > 0
  ORDER BY u.unit_reference;
$function$;

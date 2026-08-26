-- Record the period a rent charge actually bills, so a part month says so on the invoice.
--
-- The pro-rata arithmetic has been right since 20260726120000, but the invoice had no
-- way to show it: period_start/period_end are always the whole calendar month, so a
-- part month printed "Period: 1 August 2026 to 31 August 2026" against a pro-rated
-- figure with nothing to explain the difference (owner report 2026-08-26, Southgate
-- Suites 2.5/2.6 and 2.7 for Al-Hurraya, both commencing 15 August).
--
-- Rather than re-derive the window at render time from the lease (which would silently
-- rewrite an invoice already sent if a lease date were later corrected), the generator
-- now stores the window it billed. Charges raised before this migration keep NULL and
-- render exactly as the tenant received them, the same principle used to hold the
-- concession lines back to September.
--
-- period_start / period_end keep their meaning (the calendar month being billed) so
-- every existing query, the collection matrix and the duplicate guard are unaffected.

-- ---------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------
ALTER TABLE public.charge_records
  ADD COLUMN IF NOT EXISTS billed_from date,
  ADD COLUMN IF NOT EXISTS billed_to   date;

COMMENT ON COLUMN public.charge_records.billed_from IS
  'First day actually billed by this charge. Equals period_start on a full month; later on a mid-month commencement. NULL on charges raised before 2026-08-26 — treat as period_start.';
COMMENT ON COLUMN public.charge_records.billed_to IS
  'Last day actually billed by this charge. Equals period_end on a full month; earlier on a mid-month cesser. NULL on charges raised before 2026-08-26 — treat as period_end.';

-- ---------------------------------------------------------------
-- 2. Generator — store the occupied window it already computes
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
      billed_from, billed_to,
      net_amount, vat_amount, vat_rate, due_date, status, generated_by, notes
    ) VALUES (
      v_charge_id, v_lease.lease_id, v_unit_id, v_lease.tenant_id, v_lease.asset_id,
      'RENT', v_label, v_period_start, v_period_end,
      v_occ_from, v_occ_to,
      v_net_amount, v_vat_amount, v_vat_rate, v_due_date, 'DRAFT', 'SYSTEM', v_msg
    );

    RETURN QUERY SELECT
      v_lease.lease_id, v_lease.tenant_display_name, v_charge_id, v_net_amount, v_label, COALESCE(v_msg, 'OK');
  END LOOP;
END;
$function$;

-- ---------------------------------------------------------------
-- 3. Ledger view — append the two columns for the invoice renderer
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_charge_ledger AS
 SELECT cr.charge_id,
    cr.charge_type,
    cr.charge_label,
    cr.period_start,
    cr.period_end,
    cr.net_amount,
    cr.vat_amount,
    cr.gross_amount,
    cr.vat_rate,
    cr.due_date,
    cr.status,
    cr.issued_date,
    cr.payment_date,
    cr.payment_amount,
    cr.generated_by,
    cr.notes,
    l.lease_id,
    l.lease_reference,
    l.annual_rent,
    l.billing_frequency,
    cr.tenant_id,
    COALESCE(t.trading_name, t.legal_name) AS tenant_name,
    t.accounts_contact_email,
    cr.unit_id,
    u.unit_reference,
    cr.asset_id,
    a.asset_name,
        CASE
            WHEN cr.status = ANY (ARRAY['OVERDUE'::charge_status_enum, 'PART_PAID'::charge_status_enum]) THEN CURRENT_DATE - cr.due_date
            ELSE NULL::integer
        END AS days_overdue,
        CASE
            WHEN cr.status = ANY (ARRAY['DRAFT'::charge_status_enum, 'ISSUED'::charge_status_enum, 'OVERDUE'::charge_status_enum]) THEN cr.gross_amount
            WHEN cr.status = 'PART_PAID'::charge_status_enum THEN cr.gross_amount - COALESCE(cr.payment_amount, 0::numeric)
            ELSE 0::numeric
        END AS outstanding_amount,
    cr.sent_date,
    cr.sent_method,
    cr.sent_to,
    t.preferred_delivery_method,
    cr.invoice_reference,
    cr.billed_from,
    cr.billed_to
   FROM charge_records cr
     JOIN leases l ON l.lease_id = cr.lease_id
     JOIN tenants t ON t.tenant_id = cr.tenant_id
     JOIN units u ON u.unit_id = cr.unit_id
     JOIN assets a ON a.asset_id = cr.asset_id;

ALTER VIEW public.v_charge_ledger SET (security_invoker = true);

-- =============================================================
-- STAGE 3: BILLING ENGINE
-- Commercial Portfolio Operating System
-- Run this in the Supabase SQL Editor
-- =============================================================

-- -------------------------------------------------------------
-- 1. CHARGE LEDGER VIEW
-- -------------------------------------------------------------
CREATE OR REPLACE VIEW v_charge_ledger AS
SELECT
  cr.charge_id,
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
  -- Lease
  l.lease_id,
  l.lease_reference,
  l.annual_rent,
  l.billing_frequency,
  -- Tenant
  cr.tenant_id,
  COALESCE(t.trading_name, t.legal_name) AS tenant_name,
  t.accounts_contact_email,
  -- Unit
  cr.unit_id,
  u.unit_reference,
  -- Asset
  cr.asset_id,
  a.asset_name,
  -- Derived
  CASE
    WHEN cr.status IN ('OVERDUE', 'PART_PAID') THEN (CURRENT_DATE - cr.due_date)
    ELSE NULL
  END AS days_overdue,
  CASE
    WHEN cr.status IN ('DRAFT', 'ISSUED', 'OVERDUE') THEN cr.gross_amount
    WHEN cr.status = 'PART_PAID'
      THEN cr.gross_amount - COALESCE(cr.payment_amount, 0)
    ELSE 0
  END AS outstanding_amount
FROM  charge_records cr
JOIN  leases  l ON l.lease_id  = cr.lease_id
JOIN  tenants t ON t.tenant_id = cr.tenant_id
JOIN  units   u ON u.unit_id   = cr.unit_id
JOIN  assets  a ON a.asset_id  = cr.asset_id;

-- -------------------------------------------------------------
-- 2. ARREARS SUMMARY VIEW
-- -------------------------------------------------------------
CREATE OR REPLACE VIEW v_arrears_summary AS
SELECT
  cr.tenant_id,
  COALESCE(t.trading_name, t.legal_name)            AS tenant_name,
  cr.asset_id,
  a.asset_name,
  COUNT(*)                                           AS overdue_charge_count,
  SUM(
    CASE
      WHEN cr.status IN ('ISSUED', 'OVERDUE') THEN cr.gross_amount
      WHEN cr.status = 'PART_PAID'
        THEN cr.gross_amount - COALESCE(cr.payment_amount, 0)
      ELSE 0
    END
  )                                                  AS total_outstanding,
  MAX(CURRENT_DATE - cr.due_date)                   AS max_days_overdue,
  MIN(cr.due_date)                                   AS oldest_due_date
FROM  charge_records cr
JOIN  tenants t ON t.tenant_id = cr.tenant_id
JOIN  assets  a ON a.asset_id  = cr.asset_id
WHERE cr.status IN ('ISSUED', 'OVERDUE', 'PART_PAID')
AND   cr.due_date < CURRENT_DATE
GROUP BY cr.tenant_id, t.trading_name, t.legal_name, cr.asset_id, a.asset_name
ORDER BY total_outstanding DESC;

-- -------------------------------------------------------------
-- 3. BILLING MONTH SUMMARY VIEW
-- -------------------------------------------------------------
CREATE OR REPLACE VIEW v_billing_month_summary AS
SELECT
  DATE_TRUNC('month', cr.period_start)::DATE  AS billing_month,
  cr.asset_id,
  a.asset_name,
  cr.charge_type,
  cr.status,
  COUNT(*)                                    AS charge_count,
  SUM(cr.net_amount)                          AS total_net,
  SUM(cr.gross_amount)                        AS total_gross
FROM  charge_records cr
JOIN  assets a ON a.asset_id = cr.asset_id
GROUP BY DATE_TRUNC('month', cr.period_start), cr.asset_id, a.asset_name,
         cr.charge_type, cr.status
ORDER BY billing_month DESC, a.asset_name, cr.charge_type;

-- -------------------------------------------------------------
-- 4. fn_generate_rent_charges
-- Generates DRAFT rent charge records for all eligible leases
-- for the given calendar month. Idempotent — skips any lease
-- already having a RENT charge for that period.
--
-- Usage: SELECT * FROM fn_generate_rent_charges('2026-06-01');
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_generate_rent_charges(p_billing_month DATE)
RETURNS TABLE (
  out_lease_id    UUID,
  out_tenant_name TEXT,
  out_charge_id   UUID,
  out_net_amount  NUMERIC,
  out_label       TEXT,
  out_message     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_start  DATE;
  v_period_end    DATE;
  v_lease         RECORD;
  v_profile       RECORD;
  v_unit_id       UUID;
  v_net_amount    NUMERIC(12,2);
  v_vat_rate      NUMERIC(5,4);
  v_vat_amount    NUMERIC(12,2);
  v_gross_amount  NUMERIC(12,2);
  v_charge_id     UUID;
  v_label         TEXT;
  v_is_rent_free  BOOLEAN;
  v_due_date      DATE;
  v_msg           TEXT;
BEGIN
  v_period_start := DATE_TRUNC('month', p_billing_month)::DATE;
  v_period_end   := (DATE_TRUNC('month', p_billing_month)
                     + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  FOR v_lease IN
    SELECT  l.*,
            COALESCE(t.trading_name, t.legal_name) AS tenant_display_name
    FROM    leases  l
    JOIN    tenants t ON t.tenant_id = l.tenant_id
    WHERE   l.lease_state IN (
              'ACTIVE', 'PERIODIC',
              'APPROACHING_REVIEW', 'APPROACHING_EXPIRY'
            )
    AND     l.active = TRUE
    -- Lease must have started on or before period end
    AND     l.commencement_date <= v_period_end
    -- Lease must not have been terminated before period start
    AND     (l.termination_date IS NULL OR l.termination_date >= v_period_start)
  LOOP
    -- Get RENT charge profile
    SELECT * INTO v_profile
    FROM   charge_profiles cp
    WHERE  cp.lease_id    = v_lease.lease_id
    AND    cp.charge_type = 'RENT'
    AND    cp.applies     = TRUE
    AND    cp.active      = TRUE
    LIMIT 1;

    IF NOT FOUND THEN CONTINUE; END IF;

    -- Skip if already generated for this period
    IF EXISTS (
      SELECT 1 FROM charge_records cr
      WHERE  cr.lease_id    = v_lease.lease_id
      AND    cr.charge_type = 'RENT'
      AND    cr.period_start = v_period_start
    ) THEN CONTINUE; END IF;

    -- Primary unit for this lease
    SELECT lu.unit_id INTO v_unit_id
    FROM   lease_units lu
    WHERE  lu.lease_id = v_lease.lease_id
    LIMIT 1;

    IF v_unit_id IS NULL THEN CONTINUE; END IF;

    -- Net amount: use profile fixed_amount_annual if set, else lease.annual_rent
    v_net_amount := ROUND(
      COALESCE(v_profile.fixed_amount_annual, v_lease.annual_rent) / 12.0,
      2
    );

    -- Rent-free: generate £0 charge with note
    v_is_rent_free := (
      v_lease.rent_free_end_date IS NOT NULL
      AND v_lease.rent_free_end_date >= v_period_start
    );
    IF v_is_rent_free THEN
      v_net_amount := 0.00;
      v_msg := 'Rent-free period active';
    ELSE
      v_msg := NULL;
    END IF;

    -- VAT
    v_vat_rate := CASE v_profile.vat_treatment
      WHEN 'STANDARD' THEN 0.2000
      ELSE 0.0000          -- VAT_DEFERRED, EXEMPT, ZERO_RATED, OUTSIDE_SCOPE
    END;
    v_vat_amount   := ROUND(v_net_amount * v_vat_rate, 2);
    v_gross_amount := v_net_amount + v_vat_amount;

    -- Label: 'Rent — June 2026'
    v_label := 'Rent ' || TO_CHAR(v_period_start, 'FMMonth YYYY');

    -- Due date = billing_day of the period month (default day 1)
    v_due_date := (
      DATE_TRUNC('month', p_billing_month)
      + (COALESCE(v_lease.billing_day, 1) - 1) * INTERVAL '1 day'
    )::DATE;

    -- Insert charge record
    v_charge_id := gen_random_uuid();

    INSERT INTO charge_records (
      charge_id,   lease_id,     unit_id,    tenant_id,  asset_id,
      charge_type, charge_label,
      period_start, period_end,
      net_amount,  vat_amount,  gross_amount, vat_rate,
      due_date,    status,      generated_by, notes
    ) VALUES (
      v_charge_id,
      v_lease.lease_id,
      v_unit_id,
      v_lease.tenant_id,
      v_lease.asset_id,
      'RENT',
      v_label,
      v_period_start, v_period_end,
      v_net_amount, v_vat_amount, v_gross_amount, v_vat_rate,
      v_due_date,
      'DRAFT',
      'SYSTEM',
      v_msg
    );

    RETURN QUERY SELECT
      v_lease.lease_id,
      v_lease.tenant_display_name,
      v_charge_id,
      v_net_amount,
      v_label,
      COALESCE(v_msg, 'OK');
  END LOOP;
END;
$$;

-- -------------------------------------------------------------
-- 5. fn_issue_charges
-- Moves DRAFT charges to ISSUED and stamps issued_date.
-- Pass an array of charge_ids, or NULL to issue all DRAFT.
--
-- Usage: SELECT fn_issue_charges(NULL);          -- issue all
--        SELECT fn_issue_charges(ARRAY[uuid1]);  -- issue specific
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_issue_charges(p_charge_ids UUID[] DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE charge_records
  SET    status      = 'ISSUED',
         issued_date = CURRENT_DATE
  WHERE  status = 'DRAFT'
  AND    (p_charge_ids IS NULL OR charge_id = ANY(p_charge_ids));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- -------------------------------------------------------------
-- 6. fn_update_arrears
-- Transitions ISSUED charges past their due date to OVERDUE.
-- Run daily (or call from dashboard on load).
--
-- Usage: SELECT fn_update_arrears();
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_update_arrears()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE charge_records
  SET    status = 'OVERDUE'
  WHERE  status = 'ISSUED'
  AND    due_date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- -------------------------------------------------------------
-- 7. fn_record_payment
-- Records a payment against a charge record.
-- Full payment → PAID. Partial → PART_PAID.
--
-- Usage: SELECT fn_record_payment(charge_id, 1000.00, '2026-06-10');
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_record_payment(
  p_charge_id      UUID,
  p_payment_amount NUMERIC(12,2),
  p_payment_date   DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_charge RECORD;
  v_new_status charge_status_enum;
BEGIN
  SELECT * INTO v_charge
  FROM   charge_records
  WHERE  charge_id = p_charge_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Charge % not found', p_charge_id;
  END IF;

  IF v_charge.status IN ('PAID', 'WRITTEN_OFF', 'CREDITED') THEN
    RAISE EXCEPTION 'Charge % is already %', p_charge_id, v_charge.status;
  END IF;

  v_new_status := CASE
    WHEN p_payment_amount >= v_charge.gross_amount THEN 'PAID'
    WHEN p_payment_amount > 0                       THEN 'PART_PAID'
    ELSE v_charge.status
  END;

  UPDATE charge_records
  SET    payment_amount = p_payment_amount,
         payment_date   = p_payment_date,
         status         = v_new_status
  WHERE  charge_id = p_charge_id;

  RETURN v_new_status::TEXT;
END;
$$;

-- -------------------------------------------------------------
-- 8. Grant RPC access to authenticated users
-- -------------------------------------------------------------
GRANT EXECUTE ON FUNCTION fn_generate_rent_charges(DATE)    TO authenticated;
GRANT EXECUTE ON FUNCTION fn_issue_charges(UUID[])           TO authenticated;
GRANT EXECUTE ON FUNCTION fn_update_arrears()                TO authenticated;
GRANT EXECUTE ON FUNCTION fn_record_payment(UUID, NUMERIC, DATE) TO authenticated;

-- Also grant access to the anon key for dev (remove in production)
GRANT EXECUTE ON FUNCTION fn_generate_rent_charges(DATE)    TO anon;
GRANT EXECUTE ON FUNCTION fn_issue_charges(UUID[])           TO anon;
GRANT EXECUTE ON FUNCTION fn_update_arrears()                TO anon;
GRANT EXECUTE ON FUNCTION fn_record_payment(UUID, NUMERIC, DATE) TO anon;

-- Grant view access
GRANT SELECT ON v_charge_ledger         TO authenticated, anon;
GRANT SELECT ON v_arrears_summary       TO authenticated, anon;
GRANT SELECT ON v_billing_month_summary TO authenticated, anon;

-- Fix: remove gross_amount from INSERT (it is a generated column)
-- Run this in Supabase SQL Editor to replace fn_generate_rent_charges

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
    AND     l.commencement_date <= v_period_end
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
      WHERE  cr.lease_id     = v_lease.lease_id
      AND    cr.charge_type  = 'RENT'
      AND    cr.period_start = v_period_start
    ) THEN CONTINUE; END IF;

    -- Primary unit for this lease
    SELECT lu.unit_id INTO v_unit_id
    FROM   lease_units lu
    WHERE  lu.lease_id = v_lease.lease_id
    LIMIT 1;

    IF v_unit_id IS NULL THEN CONTINUE; END IF;

    -- Net amount
    v_net_amount := ROUND(
      COALESCE(v_profile.fixed_amount_annual, v_lease.annual_rent) / 12.0, 2
    );

    -- Rent-free: £0 charge with note
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

    -- VAT (VAT_DEFERRED / EXEMPT / ZERO_RATED = 0%)
    v_vat_rate := CASE v_profile.vat_treatment
      WHEN 'STANDARD' THEN 0.2000
      ELSE 0.0000
    END;
    v_vat_amount := ROUND(v_net_amount * v_vat_rate, 2);
    -- gross_amount is a generated column — do not insert it

    -- Label
    v_label := 'Rent ' || TO_CHAR(v_period_start, 'FMMonth YYYY');

    -- Due date
    v_due_date := (
      DATE_TRUNC('month', p_billing_month)
      + (COALESCE(v_lease.billing_day, 1) - 1) * INTERVAL '1 day'
    )::DATE;

    v_charge_id := gen_random_uuid();

    INSERT INTO charge_records (
      charge_id,    lease_id,     unit_id,      tenant_id,    asset_id,
      charge_type,  charge_label,
      period_start, period_end,
      net_amount,   vat_amount,   vat_rate,
      due_date,     status,       generated_by, notes
    ) VALUES (
      v_charge_id,
      v_lease.lease_id,
      v_unit_id,
      v_lease.tenant_id,
      v_lease.asset_id,
      'RENT',
      v_label,
      v_period_start, v_period_end,
      v_net_amount,   v_vat_amount,  v_vat_rate,
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

GRANT EXECUTE ON FUNCTION fn_generate_rent_charges(DATE) TO authenticated, anon;

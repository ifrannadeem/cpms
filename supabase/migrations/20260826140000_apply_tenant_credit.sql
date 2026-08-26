-- Apply a tenant's unallocated credit to what they owe.
--
-- Allocation happens once, when a payment is recorded: it pays down whatever is
-- outstanding at that instant, oldest first, and the remainder is written to
-- payments.unallocated_amount. Nothing ever revisited it, so an advance or an
-- overpayment sat on the old receipt for ever. Giara Derby Clinic paid GBP 1,000 on
-- 15 August against September's rent; left alone, September's invoice would have shown
-- GBP 1,320 fully outstanding and Giara would have appeared in arrears for rent they had
-- already largely paid, because v_arrears_charges does not net off credit either.
--
-- Owner decision 2026-08-26: a visible button rather than automatic sweeping. Credit is
-- rare (two instances in the system's history), and cash landing somewhere unexpected is
-- worse than one extra click.
--
-- The mechanism deliberately mirrors fn_record_lease_payment: it writes real
-- payment_allocations rows against the original receipt and moves the charge's
-- payment_amount and status the same way. It is therefore not a parallel concept the rest
-- of the system has to learn about — the collection matrix, arrears and the register all
-- see an ordinary allocation, and fn_reverse_payment unwinds applied credit along with
-- everything else that receipt did, because it walks that same allocation table.
--
-- The charge takes the date of the receipt the money came from, not today: the cash was
-- received when it was received.

-- ---------------------------------------------------------------
-- 1. Where the credit is
-- ---------------------------------------------------------------
-- charge_type is NULL on some early receipts. The rent register already treats those as
-- rent (electric filters strictly), so the same rule is applied here.
CREATE OR REPLACE VIEW public.v_tenant_credit AS
 SELECT p.asset_id,
    p.tenant_id,
    COALESCE(p.charge_type::text, 'RENT') AS charge_type,
    SUM(p.unallocated_amount)             AS credit_amount,
    COUNT(*)                              AS receipts,
    MIN(p.payment_date)                   AS oldest_receipt
   FROM payments p
  WHERE COALESCE(p.unallocated_amount, 0) > 0
  GROUP BY p.asset_id, p.tenant_id, COALESCE(p.charge_type::text, 'RENT');

ALTER VIEW public.v_tenant_credit SET (security_invoker = true);
GRANT SELECT ON public.v_tenant_credit TO authenticated;

-- ---------------------------------------------------------------
-- 2. Applying it
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_apply_tenant_credit(p_lease_id uuid, p_charge_type text DEFAULT 'RENT')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset        UUID;
  v_tenant       UUID;
  v_charge       RECORD;
  v_credit       RECORD;
  v_outstanding  NUMERIC(12,2);
  v_draw         NUMERIC(12,2);
  v_this_charge  NUMERIC(12,2);
  v_applied      NUMERIC(12,2) := 0;
  v_charges      INTEGER := 0;
  v_details      JSONB := '[]'::jsonb;
BEGIN
  IF p_charge_type IS NULL OR p_charge_type NOT IN ('RENT', 'ELECTRIC') THEN
    RAISE EXCEPTION 'Charge type must be RENT or ELECTRIC';
  END IF;

  SELECT asset_id, tenant_id INTO v_asset, v_tenant FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;

  -- Oldest debt first, same ordering as a fresh payment.
  FOR v_charge IN
    SELECT charge_id, charge_label, gross_amount, COALESCE(payment_amount, 0) AS paid
    FROM   charge_records
    WHERE  lease_id = p_lease_id
      AND  charge_type = p_charge_type::charge_type_enum
      AND  status IN ('ISSUED', 'OVERDUE', 'PART_PAID')
      AND  gross_amount - COALESCE(payment_amount, 0) > 0
    ORDER BY due_date ASC, period_start ASC, created_at ASC
    FOR UPDATE
  LOOP
    v_outstanding := v_charge.gross_amount - v_charge.paid;
    v_this_charge := 0;

    -- Oldest credit first, so the earliest receipt is consumed before a later one.
    FOR v_credit IN
      SELECT payment_id, payment_date, unallocated_amount
      FROM   payments
      WHERE  tenant_id = v_tenant
        AND  asset_id  = v_asset
        AND  COALESCE(charge_type::text, 'RENT') = p_charge_type
        AND  COALESCE(unallocated_amount, 0) > 0
      ORDER BY payment_date ASC, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_outstanding <= 0;
      v_draw := LEAST(v_outstanding, v_credit.unallocated_amount);
      CONTINUE WHEN v_draw <= 0;

      UPDATE payments
      SET unallocated_amount = unallocated_amount - v_draw
      WHERE payment_id = v_credit.payment_id;

      -- A real allocation against the original receipt, so Reverse can undo it.
      INSERT INTO payment_allocations (payment_id, charge_id, allocated_amount)
      VALUES (v_credit.payment_id, v_charge.charge_id, v_draw);

      UPDATE charge_records
      SET payment_amount = COALESCE(payment_amount, 0) + v_draw,
          payment_date   = v_credit.payment_date,
          status         = CASE WHEN COALESCE(payment_amount, 0) + v_draw >= gross_amount
                                THEN 'PAID'::charge_status_enum
                                ELSE 'PART_PAID'::charge_status_enum END,
          updated_at     = now()
      WHERE charge_id = v_charge.charge_id;

      v_outstanding := v_outstanding - v_draw;
      v_this_charge := v_this_charge + v_draw;
      v_applied     := v_applied + v_draw;
    END LOOP;

    IF v_this_charge > 0 THEN
      v_charges := v_charges + 1;
      v_details := v_details || jsonb_build_object(
        'charge_id',    v_charge.charge_id,
        'charge_label', v_charge.charge_label,
        'applied',      v_this_charge,
        'fully_paid',   v_outstanding <= 0);
    END IF;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM payments
      WHERE tenant_id = v_tenant AND asset_id = v_asset
        AND COALESCE(charge_type::text, 'RENT') = p_charge_type
        AND COALESCE(unallocated_amount, 0) > 0);
  END LOOP;

  IF v_applied > 0 THEN
    INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
    VALUES (v_tenant, p_lease_id, 'PAYMENT',
      'Credit applied: ' || TO_CHAR(v_applied, 'FM999,990.00') || ' of unallocated ' ||
      LOWER(p_charge_type) || ' credit set against ' || v_charges || ' invoice' ||
      CASE WHEN v_charges = 1 THEN '' ELSE 's' END || '.');
  END IF;

  RETURN jsonb_build_object(
    'applied',   v_applied,
    'charges',   v_charges,
    'details',   v_details,
    'remaining', COALESCE((
      SELECT SUM(unallocated_amount) FROM payments
      WHERE tenant_id = v_tenant AND asset_id = v_asset
        AND COALESCE(charge_type::text, 'RENT') = p_charge_type
        AND COALESCE(unallocated_amount, 0) > 0), 0));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_apply_tenant_credit(uuid, text) TO authenticated;

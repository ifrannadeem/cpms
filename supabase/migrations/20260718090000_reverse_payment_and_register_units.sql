-- Live-use finding (RBC, July 2026): a receipt recorded against the wrong tenant
-- could not be corrected, so a compensating entry was keyed and the journal ended
-- up with floating unallocated amounts.
--
-- 1) fn_reverse_payment: deletes a receipt and unwinds its allocations — each
--    affected charge's paid amount is reduced and its status recomputed
--    (PAID -> PART_PAID -> ISSUED/OVERDUE). Mandatory reason, logged to
--    tenant_activity, so the reversal itself stays on the audit trail even
--    though the receipt row is removed. The correct payment is then re-entered.
--
-- 2) v_payment_register gains unit_references (from the allocated charges'
--    units; falls back to the tenant's current units at that asset for fully
--    unallocated receipts) so Receipt History can show the unit.

CREATE OR REPLACE FUNCTION public.fn_reverse_payment(
  p_payment_id uuid,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment  RECORD;
  v_alloc    RECORD;
  v_charge   RECORD;
  v_new_paid NUMERIC(12,2);
  v_undone   INTEGER := 0;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required to reverse a payment';
  END IF;

  SELECT payment_id, tenant_id, amount, payment_date, method
  INTO v_payment FROM payments WHERE payment_id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;

  FOR v_alloc IN
    SELECT pa.charge_id, pa.allocated_amount
    FROM payment_allocations pa
    WHERE pa.payment_id = p_payment_id
  LOOP
    SELECT status, gross_amount, COALESCE(payment_amount, 0) AS paid, due_date
    INTO v_charge FROM charge_records WHERE charge_id = v_alloc.charge_id FOR UPDATE;

    v_new_paid := GREATEST(v_charge.paid - v_alloc.allocated_amount, 0);

    UPDATE charge_records SET
      payment_amount = CASE WHEN v_new_paid = 0 THEN NULL ELSE v_new_paid END,
      payment_date   = CASE WHEN v_new_paid = 0 THEN NULL ELSE payment_date END,
      status = CASE
        -- Cancelled / written-off outcomes are decisions, not payment states
        WHEN v_charge.status IN ('CREDITED', 'WRITTEN_OFF') THEN v_charge.status
        WHEN v_new_paid <= 0 THEN
          CASE WHEN v_charge.due_date < CURRENT_DATE THEN 'OVERDUE' ELSE 'ISSUED' END::charge_status_enum
        WHEN v_new_paid < v_charge.gross_amount THEN 'PART_PAID'::charge_status_enum
        ELSE 'PAID'::charge_status_enum
      END,
      updated_at = now()
    WHERE charge_id = v_alloc.charge_id;

    v_undone := v_undone + 1;
  END LOOP;

  -- Allocations go with the payment (FK is ON DELETE CASCADE)
  DELETE FROM payments WHERE payment_id = p_payment_id;

  INSERT INTO tenant_activity (tenant_id, activity_type, summary)
  VALUES (v_payment.tenant_id, 'SYSTEM',
    'Payment of ' || TO_CHAR(v_payment.amount, 'FM999,990.00') || ' received ' ||
    TO_CHAR(v_payment.payment_date, 'DD Mon YYYY') || ' (' || v_payment.method || ') reversed: ' ||
    trim(p_reason));

  RETURN jsonb_build_object('payment_id', p_payment_id, 'allocations_undone', v_undone);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_reverse_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reverse_payment(uuid, text) TO authenticated;

-- v_payment_register + unit_references (column appended at end; definition
-- otherwise identical to the live version captured 2026-07-04).
CREATE OR REPLACE VIEW public.v_payment_register
WITH (security_invoker = true) AS
 SELECT p.payment_id,
    p.asset_id,
    a.asset_reference,
    p.tenant_id,
    COALESCE(t.trading_name, t.legal_name) AS tenant_name,
    p.payment_date,
    p.amount,
    p.method,
    p.notes,
    p.unallocated_amount,
    p.created_at,
    COALESCE(alloc.allocation_count, 0::bigint) AS allocation_count,
    alloc.allocated_charges,
    p.charge_type,
    COALESCE(alloc.unit_references,
      ( SELECT string_agg(DISTINCT u2.unit_reference, ', '::text)
          FROM leases l2
          JOIN lease_units lu2 ON lu2.lease_id = l2.lease_id
          JOIN units u2 ON u2.unit_id = lu2.unit_id
         WHERE l2.tenant_id = p.tenant_id
           AND l2.asset_id = p.asset_id
           AND l2.lease_state <> 'TERMINATED'::lease_state_enum)
    ) AS unit_references
   FROM payments p
     JOIN assets a ON a.asset_id = p.asset_id
     JOIN tenants t ON t.tenant_id = p.tenant_id
     LEFT JOIN LATERAL ( SELECT count(*) AS allocation_count,
            string_agg(((cr.charge_label || ' ('::text) || pa.allocated_amount::text) || ')'::text, '; '::text ORDER BY cr.due_date) AS allocated_charges,
            string_agg(DISTINCT u.unit_reference, ', '::text) AS unit_references
           FROM payment_allocations pa
             JOIN charge_records cr ON cr.charge_id = pa.charge_id
             JOIN units u ON u.unit_id = cr.unit_id
          WHERE pa.payment_id = p.payment_id) alloc ON true;

REVOKE ALL ON public.v_payment_register FROM PUBLIC, anon;
GRANT SELECT ON public.v_payment_register TO authenticated;

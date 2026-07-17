-- Two gaps found in live use (July 2026 invoicing run):
--
-- 1) No way to cancel an issued invoice. Unit 7 Peartree Plaza surrendered
--    30 June 2026 with a July invoice already issued; it would sit as OVERDUE
--    forever. fn_cancel_charge marks a charge CREDITED (raised in error /
--    no longer due) or WRITTEN_OFF (bad debt), with a mandatory reason and an
--    activity-log entry. The record is never deleted — status is the audit trail,
--    and both statuses already count as zero outstanding in every view.
--
-- 2) Terminated leases disappeared from every screen. fn_terminate_lease sets
--    active = false and v_lease_register filters on it, so a unit's history was
--    unreachable (data intact, no UI path). v_lease_history mirrors the register
--    without the filter; v_unit_history gives one row per unit-per-lease for
--    unit-level audit.

-- ============================================================
-- 1. fn_cancel_charge
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_cancel_charge(
  p_charge_id uuid,
  p_outcome   text,
  p_reason    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_charge RECORD;
BEGIN
  IF p_outcome NOT IN ('CREDITED', 'WRITTEN_OFF') THEN
    RAISE EXCEPTION 'Outcome must be CREDITED (cancelled / not due) or WRITTEN_OFF (bad debt)';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required to cancel an invoice';
  END IF;

  SELECT charge_id, lease_id, tenant_id, charge_label, status,
         COALESCE(payment_amount, 0) AS paid
  INTO v_charge FROM charge_records WHERE charge_id = p_charge_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Charge not found'; END IF;

  IF v_charge.status NOT IN ('ISSUED', 'OVERDUE', 'PART_PAID') THEN
    RAISE EXCEPTION 'Only issued invoices can be cancelled (current status: %). Drafts should be regenerated instead.', v_charge.status;
  END IF;
  IF p_outcome = 'CREDITED' AND v_charge.paid > 0 THEN
    RAISE EXCEPTION 'This invoice has a payment of % recorded against it. Adjust the amount instead, or write off the remainder.', v_charge.paid;
  END IF;

  UPDATE charge_records SET
    status     = p_outcome::charge_status_enum,
    notes      = COALESCE(notes || ' | ', '')
                 || CASE p_outcome WHEN 'CREDITED' THEN 'Cancelled' ELSE 'Written off' END
                 || ' ' || TO_CHAR(CURRENT_DATE, 'DD Mon YYYY') || ': ' || trim(p_reason),
    updated_at = now()
  WHERE charge_id = p_charge_id;

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_charge.tenant_id, v_charge.lease_id, 'SYSTEM',
    'Invoice "' || v_charge.charge_label || '" ' ||
    CASE p_outcome WHEN 'CREDITED' THEN 'cancelled' ELSE 'written off' END ||
    ': ' || trim(p_reason));

  RETURN jsonb_build_object('charge_id', p_charge_id, 'status', p_outcome);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cancel_charge(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cancel_charge(uuid, text, text) TO authenticated;

-- ============================================================
-- 2. v_lease_history — the register without the active/terminated filter.
--    Same columns as v_lease_register (drop-in for the lease detail page),
--    plus termination_date, termination_reason, active at the end.
--    Unit join deliberately includes inactive units (history must survive
--    physical reconfiguration).
-- ============================================================
CREATE OR REPLACE VIEW public.v_lease_history
WITH (security_invoker = true) AS
 SELECT l.lease_id,
    l.lease_reference,
    l.lease_type,
    l.lease_state,
    a.asset_name,
    a.asset_reference,
    t.legal_name AS tenant_name,
    t.trading_name,
    string_agg(u.unit_reference, ', '::text ORDER BY u.unit_reference) AS unit_references,
    l.commencement_date,
    l.expiry_date,
    l.next_rent_review_date,
    l.break_clause_date,
    l.rent_free_end_date,
    l.annual_rent,
    l.billing_frequency,
        CASE
            WHEN l.expiry_date IS NOT NULL AND l.expiry_date >= CURRENT_DATE THEN l.expiry_date - CURRENT_DATE
            ELSE NULL::integer
        END AS days_to_expiry,
    ( SELECT min(
                CASE al.urgency
                    WHEN 'CRITICAL'::text THEN 1
                    WHEN 'HIGH'::text THEN 2
                    WHEN 'MEDIUM'::text THEN 3
                    WHEN 'LOW'::text THEN 4
                    ELSE NULL::integer
                END) AS min
           FROM v_lease_alerts al
          WHERE al.lease_id = l.lease_id) AS alert_priority,
    ( SELECT string_agg(DISTINCT al.alert_type, ', '::text) AS string_agg
           FROM v_lease_alerts al
          WHERE al.lease_id = l.lease_id) AS active_alert_types,
    l.notes,
    string_agg(u.unit_type::text, ', '::text ORDER BY u.unit_reference) AS unit_types,
    l.termination_date,
    l.termination_reason,
    l.active
   FROM leases l
     JOIN tenants t ON t.tenant_id = l.tenant_id
     JOIN assets a ON a.asset_id = l.asset_id
     LEFT JOIN lease_units lu ON lu.lease_id = l.lease_id
     LEFT JOIN units u ON u.unit_id = lu.unit_id
  GROUP BY l.lease_id, l.lease_reference, l.lease_type, l.lease_state, a.asset_name, a.asset_reference,
           t.legal_name, t.trading_name, l.commencement_date, l.expiry_date, l.next_rent_review_date,
           l.break_clause_date, l.rent_free_end_date, l.annual_rent, l.billing_frequency, l.notes,
           l.termination_date, l.termination_reason, l.active;

REVOKE ALL ON public.v_lease_history FROM PUBLIC, anon;
GRANT SELECT ON public.v_lease_history TO authenticated;

-- ============================================================
-- 3. v_unit_history — one row per unit per lease, ever.
--    "Show me everything that has happened in Unit 7."
-- ============================================================
CREATE OR REPLACE VIEW public.v_unit_history
WITH (security_invoker = true) AS
 SELECT u.unit_id,
    u.unit_reference,
    u.asset_id,
    a.asset_reference,
    a.asset_name,
    l.lease_id,
    l.lease_reference,
    l.lease_type,
    l.lease_state,
    COALESCE(t.trading_name, t.legal_name) AS tenant_name,
    t.legal_name,
    l.commencement_date,
    l.expiry_date,
    l.termination_date,
    l.termination_reason,
    l.annual_rent,
    l.active AS lease_active
   FROM units u
     JOIN assets a ON a.asset_id = u.asset_id
     JOIN lease_units lu ON lu.unit_id = u.unit_id
     JOIN leases l ON l.lease_id = lu.lease_id
     JOIN tenants t ON t.tenant_id = l.tenant_id;

REVOKE ALL ON public.v_unit_history FROM PUBLIC, anon;
GRANT SELECT ON public.v_unit_history TO authenticated;

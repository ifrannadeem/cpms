-- Let a departed tenant's final rent payment be recorded.
--
-- v_payment_grid excluded every TERMINATED lease, so once a tenancy ended there was
-- no row on Rent: Payments to enter against and the receipt could not be recorded at
-- all. fn_record_lease_payment itself has no such restriction — the money was simply
-- unreachable from the screen. Reported 2026-08-26: Ambitions Personnel (Southgate
-- Suite 2.7) settled their final part-month invoice of GBP 302.71 after their 17
-- August cesser, and it could not be entered; it also left the August cell empty on
-- Rent: Collection and the sum sitting in arrears.
--
-- An ended tenancy now appears only while it still owes rent, so the grid does not
-- fill up with every past tenant, and it disappears again once settled. The new
-- `ended` column lets the screen badge the row so it is never mistaken for a current
-- tenancy.
--
-- Electric is unaffected: that grid is built from the outstanding charges themselves
-- (app/assets/[reference]/payments-electric), so it already reached ended tenancies.

CREATE OR REPLACE VIEW public.v_payment_grid AS
 SELECT l.lease_id,
    l.lease_reference,
    l.lease_state,
    ua.asset_id,
    a.asset_reference,
    l.tenant_id,
    COALESCE(t.trading_name, t.legal_name) AS tenant_name,
    ua.unit_references,
    COALESCE(bool_or(cp.applies AND cp.active), false) AS billable,
    (l.lease_state = 'TERMINATED'::lease_state_enum) AS ended
   FROM leases l
     JOIN tenants t ON t.tenant_id = l.tenant_id
     JOIN LATERAL ( SELECT u.asset_id,
            string_agg(u.unit_reference, ', '::text ORDER BY u.unit_reference) AS unit_references
           FROM lease_units lu
             JOIN units u ON u.unit_id = lu.unit_id
          WHERE lu.lease_id = l.lease_id
          GROUP BY u.asset_id) ua ON true
     JOIN assets a ON a.asset_id = ua.asset_id
     LEFT JOIN charge_profiles cp ON cp.lease_id = l.lease_id
  WHERE l.lease_state <> 'TERMINATED'::lease_state_enum
     OR EXISTS (
          SELECT 1 FROM charge_records cr
          WHERE cr.lease_id = l.lease_id
            AND cr.charge_type = 'RENT'::charge_type_enum
            AND cr.status IN ('ISSUED'::charge_status_enum,
                              'OVERDUE'::charge_status_enum,
                              'PART_PAID'::charge_status_enum)
            AND cr.gross_amount - COALESCE(cr.payment_amount, 0) > 0
        )
  GROUP BY l.lease_id, l.lease_reference, l.lease_state, ua.asset_id, a.asset_reference,
           l.tenant_id, t.trading_name, t.legal_name, ua.unit_references;

ALTER VIEW public.v_payment_grid SET (security_invoker = true);

-- Security hardening (Supabase advisor ERRORs + dormant grants), CPMS objects only.
--
-- 1) The 13 CPMS views ran as SECURITY DEFINER (advisor ERROR x13): they bypassed RLS
--    for whoever could select them. Flipped to security_invoker: the service-role
--    client (all server pages) is unaffected; authenticated users pass the existing
--    table policies; anon loses implicit access. No client component queries views
--    (verified 2026-07-05), so nothing user-facing changes.
--
-- 2) anon still held full table-level grants (SELECT/INSERT/UPDATE/DELETE/...) on all
--    CPMS tables from the original bootstrap. RLS blocks anon today (no anon policy),
--    but the grants were a landmine: one permissive policy or RLS toggle away from
--    public write access. Revoked. anon EXECUTE on fn_* was already revoked in the
--    June lockdown (verified: none remain).
--
-- mgmt_* views/functions and the mgmt/residential schemas are other apps' — untouched.

ALTER VIEW public.v_arrears_charges       SET (security_invoker = true);
ALTER VIEW public.v_arrears_summary       SET (security_invoker = true);
ALTER VIEW public.v_billing_month_summary SET (security_invoker = true);
ALTER VIEW public.v_charge_ledger         SET (security_invoker = true);
ALTER VIEW public.v_dashboard_critical    SET (security_invoker = true);
ALTER VIEW public.v_dashboard_review      SET (security_invoker = true);
ALTER VIEW public.v_electric_usage        SET (security_invoker = true);
ALTER VIEW public.v_lease_alerts          SET (security_invoker = true);
ALTER VIEW public.v_lease_register        SET (security_invoker = true);
ALTER VIEW public.v_meter_usage           SET (security_invoker = true);
ALTER VIEW public.v_payment_grid          SET (security_invoker = true);
ALTER VIEW public.v_payment_register      SET (security_invoker = true);
ALTER VIEW public.v_portfolio_health      SET (security_invoker = true);

REVOKE ALL ON public.arrears_actions      FROM anon;
REVOKE ALL ON public.assets               FROM anon;
REVOKE ALL ON public.blocks               FROM anon;
REVOKE ALL ON public.charge_profiles      FROM anon;
REVOKE ALL ON public.charge_records       FROM anon;
REVOKE ALL ON public.compliance_records   FROM anon;
REVOKE ALL ON public.contractors          FROM anon;
REVOKE ALL ON public.document_links       FROM anon;
REVOKE ALL ON public.document_templates   FROM anon;
REVOKE ALL ON public.documents            FROM anon;
REVOKE ALL ON public.event_links          FROM anon;
REVOKE ALL ON public.issuing_entities     FROM anon;
REVOKE ALL ON public.lease_units          FROM anon;
REVOKE ALL ON public.leases               FROM anon;
REVOKE ALL ON public.maintenance_events   FROM anon;
REVOKE ALL ON public.meter_reads          FROM anon;
REVOKE ALL ON public.meters               FROM anon;
REVOKE ALL ON public.payment_allocations  FROM anon;
REVOKE ALL ON public.payments             FROM anon;
REVOKE ALL ON public.portfolios           FROM anon;
REVOKE ALL ON public.rent_incentives      FROM anon;
REVOKE ALL ON public.significant_events   FROM anon;
REVOKE ALL ON public.supplier_bills       FROM anon;
REVOKE ALL ON public.tenant_activity      FROM anon;
REVOKE ALL ON public.tenants              FROM anon;
REVOKE ALL ON public.units                FROM anon;
REVOKE ALL ON public.utility_rates        FROM anon;
REVOKE ALL ON public.vat_config           FROM anon;

REVOKE ALL ON public.v_arrears_charges       FROM anon;
REVOKE ALL ON public.v_arrears_summary       FROM anon;
REVOKE ALL ON public.v_billing_month_summary FROM anon;
REVOKE ALL ON public.v_charge_ledger         FROM anon;
REVOKE ALL ON public.v_dashboard_critical    FROM anon;
REVOKE ALL ON public.v_dashboard_review      FROM anon;
REVOKE ALL ON public.v_electric_usage        FROM anon;
REVOKE ALL ON public.v_lease_alerts          FROM anon;
REVOKE ALL ON public.v_lease_register        FROM anon;
REVOKE ALL ON public.v_meter_usage           FROM anon;
REVOKE ALL ON public.v_payment_grid          FROM anon;
REVOKE ALL ON public.v_payment_register      FROM anon;
REVOKE ALL ON public.v_portfolio_health      FROM anon;

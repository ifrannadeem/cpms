-- Live public-schema RLS + POLICIES + GRANTS - Supabase project jkpftidophjivmaqpkuu - captured 2026-07-04 (pre-remediation snapshot)

-- RLS ENABLED

ALTER TABLE public.arrears_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issuing_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_incentives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.significant_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utility_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_config ENABLE ROW LEVEL SECURITY;

-- POLICIES

CREATE POLICY arrears_actions_authenticated ON public.arrears_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY assets_authenticated ON public.assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY blocks_authenticated ON public.blocks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY charge_profiles_authenticated ON public.charge_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY charge_records_authenticated ON public.charge_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY compliance_records_authenticated ON public.compliance_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY contractors_authenticated ON public.contractors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY document_links_authenticated ON public.document_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY document_templates_authenticated ON public.document_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY documents_authenticated ON public.documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY event_links_authenticated ON public.event_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY issuing_entities_authenticated ON public.issuing_entities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY lease_units_authenticated ON public.lease_units FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY leases_authenticated ON public.leases FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY maintenance_events_authenticated ON public.maintenance_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY meter_reads_authenticated ON public.meter_reads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY meters_authenticated ON public.meters FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY payment_allocations_authenticated ON public.payment_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY payments_authenticated ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY portfolios_authenticated ON public.portfolios FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY rent_incentives_authenticated ON public.rent_incentives FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY significant_events_authenticated ON public.significant_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY supplier_bills_authenticated ON public.supplier_bills FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tenant_activity_authenticated ON public.tenant_activity FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tenants_authenticated ON public.tenants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY units_authenticated ON public.units FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY utility_rates_authenticated ON public.utility_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY vat_config_select_auth ON public.vat_config FOR SELECT TO authenticated USING (true);

-- TABLE GRANTS (anon / authenticated)

-- anon ON arrears_actions: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON arrears_actions: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON assets: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON assets: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON blocks: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON blocks: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON charge_profiles: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON charge_profiles: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON charge_records: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON charge_records: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON compliance_records: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON compliance_records: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON contractors: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON contractors: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON document_links: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON document_links: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON document_templates: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON document_templates: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON documents: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON documents: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON event_links: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON event_links: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON issuing_entities: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON issuing_entities: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON lease_units: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON lease_units: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON leases: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON leases: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON maintenance_events: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON maintenance_events: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON meter_reads: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON meter_reads: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON meters: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON meters: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON mgmt_audit_v: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON mgmt_audit_v: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON mgmt_budget_v: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON mgmt_budget_v: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON mgmt_category_v: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON mgmt_category_v: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON mgmt_cost_centre_v: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON mgmt_ledger_v: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON mgmt_ledger_v: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON mgmt_recovery_v: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON mgmt_recovery_v: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON mgmt_recurring_v: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON mgmt_recurring_v: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON mgmt_site_v: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON mgmt_year_lock_v: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON mgmt_year_lock_v: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON payment_allocations: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON payment_allocations: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON payments: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON payments: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON portfolios: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON portfolios: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON rent_incentives: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON rent_incentives: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON significant_events: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON significant_events: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON supplier_bills: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON supplier_bills: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON tenant_activity: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON tenant_activity: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON tenants: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON tenants: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON units: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON units: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON utility_rates: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON utility_rates: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_arrears_charges: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_arrears_charges: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_arrears_summary: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_arrears_summary: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_billing_month_summary: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_billing_month_summary: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_charge_ledger: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_charge_ledger: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_dashboard_critical: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_dashboard_critical: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_dashboard_review: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_dashboard_review: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_electric_usage: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_electric_usage: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_lease_alerts: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_lease_alerts: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_lease_register: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_lease_register: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_meter_usage: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_meter_usage: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_payment_grid: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_payment_grid: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_payment_register: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_payment_register: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- anon ON v_portfolio_health: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON v_portfolio_health: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated ON vat_config: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

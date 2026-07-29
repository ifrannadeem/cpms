-- Live public-schema RLS POLICIES - Supabase project jkpftidophjivmaqpkuu - captured 2026-07-29
-- Source of truth for changes is supabase/migrations; this is the recovery baseline.

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

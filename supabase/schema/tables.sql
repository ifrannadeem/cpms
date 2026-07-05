-- Live public-schema TABLES (column definitions; PK/FK/CHECK in constraints_indexes.sql) - Supabase project jkpftidophjivmaqpkuu - captured 2026-07-04 (pre-remediation snapshot)

CREATE TABLE public.arrears_actions (
  action_id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  action_date date DEFAULT CURRENT_DATE NOT NULL,
  stage text NOT NULL,
  method text,
  amount numeric(12,2),
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.assets (
  asset_id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_reference text NOT NULL,
  portfolio_id uuid NOT NULL,
  asset_name text NOT NULL,
  address_line_1 text NOT NULL,
  address_line_2 text,
  town text NOT NULL,
  postcode text NOT NULL,
  asset_type asset_type_enum NOT NULL,
  letterhead_template_id uuid,
  ownership_entity text NOT NULL,
  management_entity text NOT NULL,
  acquisition_date date,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  income_owned boolean DEFAULT true NOT NULL
);

CREATE TABLE public.blocks (
  block_id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_id uuid NOT NULL,
  block_name text NOT NULL,
  block_reference text NOT NULL,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  utility_rate_id uuid
);

CREATE TABLE public.charge_profiles (
  profile_id uuid DEFAULT gen_random_uuid() NOT NULL,
  lease_id uuid NOT NULL,
  charge_type charge_type_enum NOT NULL,
  charge_label text,
  applies boolean DEFAULT true NOT NULL,
  vat_treatment vat_treatment_enum NOT NULL,
  vat_deferred boolean DEFAULT false NOT NULL,
  billing_frequency billing_frequency_enum,
  calculation_method calculation_method_enum NOT NULL,
  fixed_amount_annual numeric(12,2),
  apportionment_basis apportionment_basis_enum,
  apportionment_percentage numeric(7,4),
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.charge_records (
  charge_id uuid DEFAULT gen_random_uuid() NOT NULL,
  lease_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  charge_type charge_type_enum NOT NULL,
  charge_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  net_amount numeric(12,2) NOT NULL,
  vat_amount numeric(12,2) DEFAULT 0 NOT NULL,
  gross_amount numeric(12,2) GENERATED ALWAYS AS ((net_amount + vat_amount)) STORED,
  vat_rate numeric(6,4) DEFAULT 0 NOT NULL,
  due_date date NOT NULL,
  status charge_status_enum DEFAULT 'DRAFT'::charge_status_enum NOT NULL,
  issued_date date,
  payment_date date,
  payment_amount numeric(12,2),
  generated_by generated_by_enum DEFAULT 'SYSTEM'::generated_by_enum NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  document_id uuid,
  sent_date date,
  sent_method text,
  sent_to text
);

CREATE TABLE public.compliance_records (
  compliance_id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_id uuid NOT NULL,
  unit_id uuid,
  compliance_type compliance_type_enum NOT NULL,
  description text NOT NULL,
  certificate_date date,
  expiry_date date,
  next_due_date date,
  contractor_id uuid,
  status compliance_status_enum DEFAULT 'COMPLIANT'::compliance_status_enum NOT NULL,
  alert_threshold_days integer DEFAULT 90 NOT NULL,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  document_id uuid
);

CREATE TABLE public.contractors (
  contractor_id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_name text NOT NULL,
  trade text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  insurance_expiry date,
  gas_safe_number text,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.document_links (
  document_id uuid NOT NULL,
  entity_type entity_type_enum NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.document_templates (
  template_id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_name text NOT NULL,
  template_reference text NOT NULL,
  file_reference text,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.documents (
  document_id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_name text NOT NULL,
  document_type document_type_enum NOT NULL,
  file_reference text NOT NULL,
  file_format file_format_enum NOT NULL,
  upload_date date DEFAULT CURRENT_DATE NOT NULL,
  uploaded_by text NOT NULL,
  asset_id uuid,
  unit_id uuid,
  lease_id uuid,
  tenant_id uuid,
  charge_id uuid,
  compliance_id uuid,
  maintenance_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.event_links (
  event_id uuid NOT NULL,
  entity_type entity_type_enum NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.issuing_entities (
  entity_id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_id uuid NOT NULL,
  entity_name text NOT NULL,
  address_lines text[],
  company_number text,
  vat_number text,
  phone text,
  email text,
  agent_for text,
  bank_name text,
  bank_account_name text NOT NULL,
  bank_sort_code text NOT NULL,
  bank_account_number text NOT NULL,
  invoice_email_from text,
  dispatch_channel text DEFAULT 'EMAIL'::text NOT NULL,
  logo_path text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lease_units (
  lease_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.leases (
  lease_id uuid DEFAULT gen_random_uuid() NOT NULL,
  lease_reference text NOT NULL,
  lease_type lease_type_enum NOT NULL,
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  commencement_date date NOT NULL,
  expiry_date date,
  rent_commencement_date date NOT NULL,
  rent_free_end_date date,
  annual_rent numeric(12,2) NOT NULL,
  billing_frequency billing_frequency_enum DEFAULT 'MONTHLY'::billing_frequency_enum NOT NULL,
  billing_day smallint DEFAULT 1 NOT NULL,
  next_rent_review_date date,
  rent_review_basis rent_review_basis_enum,
  rent_review_frequency_months smallint,
  periodic_review_prompt_months smallint DEFAULT 18,
  break_clause_date date,
  break_clause_party break_clause_party_enum,
  break_clause_notes text,
  deposit_amount numeric(12,2),
  deposit_type deposit_type_enum DEFAULT 'NONE'::deposit_type_enum NOT NULL,
  repairing_obligation repairing_obligation_enum,
  lease_state lease_state_enum DEFAULT 'ACTIVE'::lease_state_enum NOT NULL,
  termination_date date,
  termination_reason termination_reason_enum,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  document_id uuid,
  original_start_date date,
  permitted_use text,
  insurance_recharge boolean DEFAULT false NOT NULL,
  last_review_date date
);

CREATE TABLE public.maintenance_events (
  maintenance_id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_id uuid NOT NULL,
  unit_id uuid,
  category maintenance_category_enum NOT NULL,
  description text NOT NULL,
  priority maintenance_priority_enum DEFAULT 'ROUTINE'::maintenance_priority_enum NOT NULL,
  reported_date date NOT NULL,
  contractor_id uuid,
  quoted_cost numeric(12,2),
  authorised_cost numeric(12,2),
  target_completion_date date,
  actual_completion_date date,
  rechargeable_to_tenant boolean DEFAULT false NOT NULL,
  tenant_id uuid,
  status maintenance_status_enum DEFAULT 'REPORTED'::maintenance_status_enum NOT NULL,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  document_id uuid
);

CREATE TABLE public.meter_reads (
  read_id uuid DEFAULT gen_random_uuid() NOT NULL,
  meter_id uuid NOT NULL,
  read_date date NOT NULL,
  reading_value numeric(12,2) NOT NULL,
  read_type read_type_enum DEFAULT 'ACTUAL'::read_type_enum NOT NULL,
  entered_by text NOT NULL,
  consumption_kwh numeric(12,4),
  charge_id uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.meters (
  meter_id uuid DEFAULT gen_random_uuid() NOT NULL,
  unit_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  block_id uuid,
  meter_reference text NOT NULL,
  meter_type meter_type_enum NOT NULL,
  installation_date date,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  dial_count smallint DEFAULT 6 NOT NULL
);

CREATE TABLE public.payment_allocations (
  allocation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_id uuid NOT NULL,
  charge_id uuid NOT NULL,
  allocated_amount numeric(12,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payments (
  payment_id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  payment_date date DEFAULT CURRENT_DATE NOT NULL,
  amount numeric(12,2) NOT NULL,
  method text DEFAULT 'BANK_TRANSFER'::text NOT NULL,
  notes text,
  unallocated_amount numeric(12,2) DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  charge_type charge_type_enum
);

CREATE TABLE public.portfolios (
  portfolio_id uuid DEFAULT gen_random_uuid() NOT NULL,
  portfolio_reference text NOT NULL,
  portfolio_name text NOT NULL,
  management_entity text NOT NULL,
  ownership_entity text NOT NULL,
  income_owned boolean DEFAULT true NOT NULL,
  billing_currency text DEFAULT 'GBP'::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.rent_incentives (
  incentive_id uuid DEFAULT gen_random_uuid() NOT NULL,
  lease_id uuid NOT NULL,
  incentive_type incentive_type_enum NOT NULL,
  headline_amount_annual numeric(12,2) NOT NULL,
  discount_amount_monthly numeric(10,2),
  billed_amount_monthly numeric(10,2) NOT NULL,
  effective_amount_annual numeric(12,2) NOT NULL,
  incentive_start_date date,
  incentive_end_date date NOT NULL,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.significant_events (
  event_id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_date date NOT NULL,
  event_category event_category_enum NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  asset_id uuid,
  unit_id uuid,
  lease_id uuid,
  tenant_id uuid,
  contractor_id uuid,
  document_id uuid,
  recorded_by text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.supplier_bills (
  bill_id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_id uuid NOT NULL,
  block_name text NOT NULL,
  supplier_name text,
  bill_month date NOT NULL,
  period_start date,
  period_end date,
  consumption_kwh numeric(12,2),
  net_amount numeric(12,2),
  vat_amount numeric(12,2),
  gross_amount numeric(12,2),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tenant_activity (
  activity_id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  lease_id uuid,
  activity_type text NOT NULL,
  activity_at timestamp with time zone DEFAULT now() NOT NULL,
  summary text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tenants (
  tenant_id uuid DEFAULT gen_random_uuid() NOT NULL,
  legal_name text NOT NULL,
  trading_name text,
  company_number text,
  tenant_type tenant_type_enum NOT NULL,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  accounts_contact_name text,
  accounts_contact_email text,
  correspondence_address text,
  tenant_state tenant_state_enum DEFAULT 'STABLE'::tenant_state_enum NOT NULL,
  tenant_notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  accounts_contact_phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  director_name text,
  preferred_delivery_method text DEFAULT 'EMAIL'::text NOT NULL
);

CREATE TABLE public.units (
  unit_id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_id uuid NOT NULL,
  block_id uuid,
  unit_reference text NOT NULL,
  unit_type unit_type_enum NOT NULL,
  floor_area_sqft numeric(10,2),
  floor_area_sqm numeric(10,2),
  floor_level text,
  unit_state unit_state_enum DEFAULT 'VACANT'::unit_state_enum NOT NULL,
  merged_into_unit_id uuid,
  split_from_unit_id uuid,
  vacancy_start_date date,
  rateable_value numeric(12,2),
  small_business_rate_relief boolean DEFAULT false NOT NULL,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  meter_id uuid
);

CREATE TABLE public.utility_rates (
  rate_id uuid DEFAULT gen_random_uuid() NOT NULL,
  rate_reference text NOT NULL,
  asset_id uuid NOT NULL,
  block_id uuid,
  utility_type utility_type_enum NOT NULL,
  rate_per_kwh numeric(10,4) NOT NULL,
  standing_charge_daily numeric(10,4),
  effective_from date NOT NULL,
  effective_to date,
  supplier_name text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vat_config (
  asset_id uuid NOT NULL,
  registered boolean DEFAULT true NOT NULL,
  quarter_end_month smallint,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

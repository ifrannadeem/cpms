-- Live public-schema VIEWS - Supabase project jkpftidophjivmaqpkuu - captured 2026-07-04 (pre-remediation snapshot)

-- reloptions: (none)
CREATE OR REPLACE VIEW public.mgmt_audit_v AS
 SELECT audit_id,
    changed_at,
    action,
    entity,
    row_id,
    summary,
    site_id
   FROM mgmt.audit
  ORDER BY audit_id DESC
 LIMIT 400;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.mgmt_budget_v AS
 SELECT b.budget_id,
    b.site_id,
    b.fin_year,
    b.cc_id,
    b.code,
    b.category,
    b.annual_net,
    b.vat_rate,
    b.annual_vat,
    b.annual_gross,
    b.basis,
    b.notes,
    b.created_at,
    cc.code AS cc_code,
    cc.name AS cc_name
   FROM mgmt.budget b
     JOIN mgmt.cost_centre cc USING (cc_id);

-- reloptions: (none)
CREATE OR REPLACE VIEW public.mgmt_category_v AS
 SELECT cat_id,
    cc,
    code,
    account_group,
    sort,
    active,
    site_id
   FROM mgmt.category
  ORDER BY cc, sort;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.mgmt_cost_centre_v AS
 SELECT cc_id,
    site_id,
    code,
    name,
    kind,
    vat_offset_months,
    sort
   FROM mgmt.cost_centre
  ORDER BY sort;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.mgmt_ledger_v AS
 SELECT ledger_id,
    site_id,
    cc_id,
    entry_date,
    period_month,
    source_type,
    batch_label,
    code,
    category,
    account_group,
    description,
    supplier,
    payor,
    method,
    invoice_no,
    is_invoice,
    net,
    vat,
    gross,
    vat_rate,
    recoverable,
    markup,
    recharged_net,
    notes,
    cc_code,
    cc_name,
    cc_kind,
    vat_quarter
   FROM mgmt.v_ledger;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.mgmt_recovery_v AS
 SELECT r.recovery_id,
    r.site_id,
    r.fin_year,
    r.cc_id,
    r.code,
    r.category,
    r.monthly_net,
    r.vat_rate,
    r.monthly_vat,
    r.monthly_gross,
    r.basis,
    r.notes,
    r.created_at,
    cc.code AS cc_code,
    cc.name AS cc_name
   FROM mgmt.recovery r
     JOIN mgmt.cost_centre cc USING (cc_id);

-- reloptions: (none)
CREATE OR REPLACE VIEW public.mgmt_recurring_v AS
 SELECT rec_id,
    site_id,
    cc,
    code,
    account_group,
    category,
    supplier,
    payor,
    method,
    net,
    vat,
    invoice_prefix,
    desc_template,
    active,
    sort,
    fin_year
   FROM mgmt.recurring
  ORDER BY fin_year, sort;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.mgmt_site_v AS
 SELECT site_id,
    site_name,
    manager,
    default_payor,
    fin_year_end,
    notes,
    created_at,
    is_lite,
    modules,
    landlord_label,
    sort
   FROM mgmt.site;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.mgmt_year_lock_v AS
 SELECT fin_year,
    locked,
    setup_locked,
    locked_at,
    site_id
   FROM mgmt.year_lock;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_arrears_charges AS
 SELECT cr.charge_id,
    cr.tenant_id,
    COALESCE(t.trading_name, t.legal_name) AS tenant_name,
    cr.asset_id,
    a.asset_name,
    cr.lease_id,
    cr.unit_id,
    u.unit_reference,
    cr.charge_type,
    cr.charge_label,
    cr.period_start,
    cr.due_date,
        CASE
            WHEN cr.status = ANY (ARRAY['ISSUED'::charge_status_enum, 'OVERDUE'::charge_status_enum]) THEN cr.gross_amount
            WHEN cr.status = 'PART_PAID'::charge_status_enum THEN cr.gross_amount - COALESCE(cr.payment_amount, 0::numeric)
            ELSE 0::numeric
        END AS outstanding_amount,
    CURRENT_DATE - cr.due_date AS days_overdue
   FROM charge_records cr
     JOIN tenants t ON t.tenant_id = cr.tenant_id
     JOIN assets a ON a.asset_id = cr.asset_id
     JOIN units u ON u.unit_id = cr.unit_id
  WHERE (cr.status = ANY (ARRAY['ISSUED'::charge_status_enum, 'OVERDUE'::charge_status_enum, 'PART_PAID'::charge_status_enum])) AND
        CASE
            WHEN cr.status = 'PART_PAID'::charge_status_enum THEN cr.gross_amount - COALESCE(cr.payment_amount, 0::numeric)
            ELSE cr.gross_amount
        END > 0::numeric AND cr.due_date IS NOT NULL AND (cr.charge_type::text = 'ELECTRIC'::text AND cr.due_date < (date_trunc('month'::text, CURRENT_DATE::timestamp with time zone) - '1 mon'::interval)::date OR cr.charge_type::text <> 'ELECTRIC'::text AND cr.due_date < date_trunc('month'::text, CURRENT_DATE::timestamp with time zone)::date);

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_arrears_summary AS
 SELECT tenant_id,
    tenant_name,
    asset_id,
    asset_name,
    count(*) AS overdue_charge_count,
    sum(outstanding_amount) AS total_outstanding,
    max(days_overdue) AS max_days_overdue,
    min(due_date) AS oldest_due_date,
    sum(
        CASE
            WHEN charge_type::text = 'RENT'::text THEN outstanding_amount
            ELSE 0::numeric
        END) AS rent_outstanding,
    sum(
        CASE
            WHEN charge_type::text = 'ELECTRIC'::text THEN outstanding_amount
            ELSE 0::numeric
        END) AS electric_outstanding
   FROM v_arrears_charges ac
  GROUP BY tenant_id, tenant_name, asset_id, asset_name
  ORDER BY (sum(outstanding_amount)) DESC;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_billing_month_summary AS
 SELECT date_trunc('month'::text, cr.period_start::timestamp with time zone)::date AS billing_month,
    cr.asset_id,
    a.asset_name,
    cr.charge_type,
    cr.status,
    count(*) AS charge_count,
    sum(cr.net_amount) AS total_net,
    sum(cr.gross_amount) AS total_gross
   FROM charge_records cr
     JOIN assets a ON a.asset_id = cr.asset_id
  GROUP BY (date_trunc('month'::text, cr.period_start::timestamp with time zone)), cr.asset_id, a.asset_name, cr.charge_type, cr.status
  ORDER BY (date_trunc('month'::text, cr.period_start::timestamp with time zone)::date) DESC, a.asset_name, cr.charge_type;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_charge_ledger AS
 SELECT cr.charge_id,
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
    l.lease_id,
    l.lease_reference,
    l.annual_rent,
    l.billing_frequency,
    cr.tenant_id,
    COALESCE(t.trading_name, t.legal_name) AS tenant_name,
    t.accounts_contact_email,
    cr.unit_id,
    u.unit_reference,
    cr.asset_id,
    a.asset_name,
        CASE
            WHEN cr.status = ANY (ARRAY['OVERDUE'::charge_status_enum, 'PART_PAID'::charge_status_enum]) THEN CURRENT_DATE - cr.due_date
            ELSE NULL::integer
        END AS days_overdue,
        CASE
            WHEN cr.status = ANY (ARRAY['DRAFT'::charge_status_enum, 'ISSUED'::charge_status_enum, 'OVERDUE'::charge_status_enum]) THEN cr.gross_amount
            WHEN cr.status = 'PART_PAID'::charge_status_enum THEN cr.gross_amount - COALESCE(cr.payment_amount, 0::numeric)
            ELSE 0::numeric
        END AS outstanding_amount,
    cr.sent_date,
    cr.sent_method,
    cr.sent_to,
    t.preferred_delivery_method
   FROM charge_records cr
     JOIN leases l ON l.lease_id = cr.lease_id
     JOIN tenants t ON t.tenant_id = cr.tenant_id
     JOIN units u ON u.unit_id = cr.unit_id
     JOIN assets a ON a.asset_id = cr.asset_id;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_dashboard_critical AS
 SELECT alert_type,
    urgency,
    lease_reference,
    tenant_name,
    asset_name,
    event_date,
    days_until,
    action_required,
    notes
   FROM v_lease_alerts
  WHERE urgency = 'CRITICAL'::text OR lease_state = 'PERIODIC'::lease_state_enum
  ORDER BY (
        CASE urgency
            WHEN 'CRITICAL'::text THEN 1
            ELSE 2
        END), days_until;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_dashboard_review AS
 SELECT alert_type,
    urgency,
    lease_reference,
    tenant_name,
    asset_name,
    event_date,
    days_until,
    action_required,
    notes
   FROM v_lease_alerts
  WHERE (urgency = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text])) AND (lease_state <> 'PERIODIC'::lease_state_enum OR alert_type <> 'PERIODIC_TENANCY'::text)
  ORDER BY (
        CASE urgency
            WHEN 'HIGH'::text THEN 1
            WHEN 'MEDIUM'::text THEN 2
            ELSE 3
        END), days_until;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_electric_usage AS
 SELECT cr.charge_id,
    to_char(cr.period_end::timestamp with time zone, 'YYYY-MM'::text) AS bill_month,
    TRIM(BOTH FROM to_char(cr.period_end::timestamp with time zone, 'FMMonth YYYY'::text)) AS bill_month_label,
    a.asset_id,
    a.asset_reference,
    a.asset_name,
    b.block_id,
    COALESCE(b.block_name, a.asset_name) AS block_name,
    u.unit_id,
    u.unit_reference,
    t.tenant_id,
    COALESCE(t.trading_name, t.legal_name) AS tenant_name,
    mr.reading_value AS closing_reading,
    mr.reading_value - mr.consumption_kwh AS opening_reading,
    mr.consumption_kwh,
        CASE
            WHEN mr.consumption_kwh > 0::numeric THEN round(cr.net_amount / mr.consumption_kwh, 4)
            ELSE NULL::numeric
        END AS rate_per_kwh,
    cr.period_start,
    cr.period_end,
    cr.net_amount,
    cr.vat_amount,
    cr.gross_amount,
    cr.status,
    cr.payment_amount,
    cr.payment_date,
    cr.gross_amount - COALESCE(cr.payment_amount, 0::numeric) AS outstanding
   FROM charge_records cr
     JOIN meter_reads mr ON mr.charge_id = cr.charge_id
     JOIN units u ON u.unit_id = cr.unit_id
     LEFT JOIN blocks b ON b.block_id = u.block_id
     JOIN assets a ON a.asset_id = cr.asset_id
     JOIN tenants t ON t.tenant_id = cr.tenant_id
  WHERE cr.charge_type = 'ELECTRIC'::charge_type_enum;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_lease_alerts AS
 SELECT l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name AS tenant_name,
    a.asset_name,
    'LEASE_EXPIRY'::text AS alert_type,
    l.expiry_date AS event_date,
    l.expiry_date - CURRENT_DATE AS days_until,
        CASE
            WHEN (l.expiry_date - CURRENT_DATE) <= 90 THEN 'CRITICAL'::text
            WHEN (l.expiry_date - CURRENT_DATE) <= 180 THEN 'HIGH'::text
            WHEN (l.expiry_date - CURRENT_DATE) <= 365 THEN 'MEDIUM'::text
            ELSE 'LOW'::text
        END AS urgency,
    'Engage tenant on renewal or begin void planning.'::text AS action_required,
    l.notes
   FROM leases l
     JOIN tenants t ON t.tenant_id = l.tenant_id
     JOIN assets a ON a.asset_id = l.asset_id
  WHERE l.active AND (l.lease_state <> ALL (ARRAY['TERMINATED'::lease_state_enum, 'PERIODIC'::lease_state_enum])) AND l.expiry_date IS NOT NULL AND l.expiry_date <= (CURRENT_DATE + '1 year 6 mons'::interval)
UNION ALL
 SELECT l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name AS tenant_name,
    a.asset_name,
    'PERIODIC_TENANCY'::text AS alert_type,
    l.expiry_date AS event_date,
    (CURRENT_DATE - COALESCE(l.expiry_date, CURRENT_DATE)) * '-1'::integer AS days_until,
    'LOW'::text AS urgency,
    'Periodic / rolling tenancy. Accepted position - formalise only if commercially desirable.'::text AS action_required,
    l.notes
   FROM leases l
     JOIN tenants t ON t.tenant_id = l.tenant_id
     JOIN assets a ON a.asset_id = l.asset_id
  WHERE l.active AND l.lease_state = 'PERIODIC'::lease_state_enum AND l.annual_rent > 0::numeric
UNION ALL
 SELECT l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name AS tenant_name,
    a.asset_name,
    'RENT_REVIEW'::text AS alert_type,
    l.next_rent_review_date AS event_date,
    l.next_rent_review_date - CURRENT_DATE AS days_until,
        CASE
            WHEN (l.next_rent_review_date - CURRENT_DATE) <= 90 THEN 'CRITICAL'::text
            WHEN (l.next_rent_review_date - CURRENT_DATE) <= 180 THEN 'HIGH'::text
            ELSE 'MEDIUM'::text
        END AS urgency,
    'Initiate rent review. Instruct surveyor if open market review.'::text AS action_required,
    l.notes
   FROM leases l
     JOIN tenants t ON t.tenant_id = l.tenant_id
     JOIN assets a ON a.asset_id = l.asset_id
  WHERE l.active AND l.lease_state <> 'TERMINATED'::lease_state_enum AND l.next_rent_review_date IS NOT NULL AND l.next_rent_review_date <= (CURRENT_DATE + '1 year'::interval) AND l.next_rent_review_date > CURRENT_DATE
UNION ALL
 SELECT l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name AS tenant_name,
    a.asset_name,
    'BREAK_CLAUSE'::text AS alert_type,
    l.break_clause_date AS event_date,
    l.break_clause_date - CURRENT_DATE AS days_until,
        CASE
            WHEN (l.break_clause_date - CURRENT_DATE) <= 90 THEN 'CRITICAL'::text
            WHEN (l.break_clause_date - CURRENT_DATE) <= 180 THEN 'HIGH'::text
            ELSE 'MEDIUM'::text
        END AS urgency,
    COALESCE((('Break clause: '::text || l.break_clause_party::text) || '. '::text) || l.break_clause_notes, 'Break clause approaching. Review strategic options.'::text) AS action_required,
    l.notes
   FROM leases l
     JOIN tenants t ON t.tenant_id = l.tenant_id
     JOIN assets a ON a.asset_id = l.asset_id
  WHERE l.active AND l.lease_state <> 'TERMINATED'::lease_state_enum AND l.break_clause_date IS NOT NULL AND l.break_clause_date <= (CURRENT_DATE + '1 year'::interval) AND l.break_clause_date > CURRENT_DATE
UNION ALL
 SELECT l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name AS tenant_name,
    a.asset_name,
    'RENT_FREE_EXPIRY'::text AS alert_type,
    l.rent_free_end_date AS event_date,
    l.rent_free_end_date - CURRENT_DATE AS days_until,
        CASE
            WHEN (l.rent_free_end_date - CURRENT_DATE) <= 30 THEN 'CRITICAL'::text
            ELSE 'HIGH'::text
        END AS urgency,
    'Confirm billing engine switches to full rent from this date.'::text AS action_required,
    l.notes
   FROM leases l
     JOIN tenants t ON t.tenant_id = l.tenant_id
     JOIN assets a ON a.asset_id = l.asset_id
  WHERE l.active AND l.lease_state <> 'TERMINATED'::lease_state_enum AND l.rent_free_end_date IS NOT NULL AND l.rent_free_end_date <= (CURRENT_DATE + '3 mons'::interval) AND l.rent_free_end_date > CURRENT_DATE
UNION ALL
 SELECT l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name AS tenant_name,
    a.asset_name,
    'INCENTIVE_EXPIRY'::text AS alert_type,
    ri.incentive_end_date AS event_date,
    ri.incentive_end_date - CURRENT_DATE AS days_until,
        CASE
            WHEN (ri.incentive_end_date - CURRENT_DATE) <= 30 THEN 'CRITICAL'::text
            ELSE 'HIGH'::text
        END AS urgency,
    'Billing reverts to headline rent. Confirm charge profile is updated.'::text AS action_required,
    ri.notes
   FROM rent_incentives ri
     JOIN leases l ON l.lease_id = ri.lease_id
     JOIN tenants t ON t.tenant_id = l.tenant_id
     JOIN assets a ON a.asset_id = l.asset_id
  WHERE ri.active AND l.active AND ri.incentive_end_date IS NOT NULL AND ri.incentive_end_date <= (CURRENT_DATE + '3 mons'::interval) AND ri.incentive_end_date >= CURRENT_DATE;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_lease_register AS
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
    string_agg(u.unit_type::text, ', '::text ORDER BY u.unit_reference) AS unit_types
   FROM leases l
     JOIN tenants t ON t.tenant_id = l.tenant_id
     JOIN assets a ON a.asset_id = l.asset_id
     LEFT JOIN lease_units lu ON lu.lease_id = l.lease_id
     LEFT JOIN units u ON u.unit_id = lu.unit_id AND u.active = true
  WHERE l.active = true AND l.lease_state <> 'TERMINATED'::lease_state_enum
  GROUP BY l.lease_id, l.lease_reference, l.lease_type, l.lease_state, a.asset_name, a.asset_reference, t.legal_name, t.trading_name, l.commencement_date, l.expiry_date, l.next_rent_review_date, l.break_clause_date, l.rent_free_end_date, l.annual_rent, l.billing_frequency, l.notes
  ORDER BY a.asset_name, l.lease_reference;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_meter_usage AS
 SELECT mr.read_id,
    m.meter_id,
    m.meter_reference,
    m.active AS billing_on,
    m.asset_id,
    a.asset_reference,
    u.unit_id,
    u.unit_reference,
    COALESCE(b.block_name, a.asset_name) AS block_name,
    ( SELECT COALESCE(t.trading_name, t.legal_name) AS "coalesce"
           FROM lease_units lu
             JOIN leases l ON l.lease_id = lu.lease_id AND l.lease_state <> 'TERMINATED'::lease_state_enum
             JOIN tenants t ON t.tenant_id = l.tenant_id
          WHERE lu.unit_id = u.unit_id
          ORDER BY l.commencement_date DESC
         LIMIT 1) AS tenant_name,
    mr.read_date,
    to_char(mr.read_date::timestamp with time zone, 'YYYY-MM'::text) AS read_month,
    mr.reading_value,
    mr.consumption_kwh,
    mr.charge_id
   FROM meter_reads mr
     JOIN meters m ON m.meter_id = mr.meter_id
     JOIN units u ON u.unit_id = m.unit_id
     LEFT JOIN blocks b ON b.block_id = u.block_id
     JOIN assets a ON a.asset_id = m.asset_id;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_payment_grid AS
 SELECT l.lease_id,
    l.lease_reference,
    l.lease_state,
    ua.asset_id,
    a.asset_reference,
    l.tenant_id,
    COALESCE(t.trading_name, t.legal_name) AS tenant_name,
    ua.unit_references,
    COALESCE(bool_or(cp.applies AND cp.active), false) AS billable
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
  GROUP BY l.lease_id, l.lease_reference, l.lease_state, ua.asset_id, a.asset_reference, l.tenant_id, t.trading_name, t.legal_name, ua.unit_references;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_payment_register AS
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
    p.charge_type
   FROM payments p
     JOIN assets a ON a.asset_id = p.asset_id
     JOIN tenants t ON t.tenant_id = p.tenant_id
     LEFT JOIN LATERAL ( SELECT count(*) AS allocation_count,
            string_agg(((cr.charge_label || ' ('::text) || pa.allocated_amount::text) || ')'::text, '; '::text ORDER BY cr.due_date) AS allocated_charges
           FROM payment_allocations pa
             JOIN charge_records cr ON cr.charge_id = pa.charge_id
          WHERE pa.payment_id = p.payment_id) alloc ON true;

-- reloptions: (none)
CREATE OR REPLACE VIEW public.v_portfolio_health AS
 SELECT a.asset_id,
    a.asset_name,
    a.asset_reference,
    count(DISTINCT u.unit_id) AS total_units,
    count(DISTINCT
        CASE
            WHEN u.unit_state = 'OCCUPIED'::unit_state_enum THEN u.unit_id
            ELSE NULL::uuid
        END) AS occupied_units,
    count(DISTINCT
        CASE
            WHEN u.unit_state = 'VACANT'::unit_state_enum THEN u.unit_id
            ELSE NULL::uuid
        END) AS vacant_units,
    count(DISTINCT
        CASE
            WHEN l.lease_state = 'ACTIVE'::lease_state_enum THEN l.lease_id
            ELSE NULL::uuid
        END) AS active_leases,
    count(DISTINCT
        CASE
            WHEN l.lease_state = 'PERIODIC'::lease_state_enum THEN l.lease_id
            ELSE NULL::uuid
        END) AS periodic_leases,
    count(DISTINCT
        CASE
            WHEN l.lease_state = 'APPROACHING_EXPIRY'::lease_state_enum THEN l.lease_id
            ELSE NULL::uuid
        END) AS approaching_expiry,
    COALESCE(sum(
        CASE
            WHEN l.active = true AND l.lease_state <> 'TERMINATED'::lease_state_enum THEN l.annual_rent
            ELSE NULL::numeric
        END), 0::numeric) AS total_annual_rent,
    count(DISTINCT al.lease_reference) AS critical_alert_count
   FROM assets a
     LEFT JOIN units u ON u.asset_id = a.asset_id AND u.active = true
     LEFT JOIN lease_units lu ON lu.unit_id = u.unit_id
     LEFT JOIN leases l ON l.lease_id = lu.lease_id AND l.active = true
     LEFT JOIN v_dashboard_critical al ON al.lease_reference = l.lease_reference
  WHERE a.active = true
  GROUP BY a.asset_id, a.asset_name, a.asset_reference
  ORDER BY a.asset_name;

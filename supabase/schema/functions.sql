-- Live public-schema FUNCTIONS — Supabase project jkpftidophjivmaqpkuu — captured 2026-07-04 (pre-remediation snapshot)

CREATE OR REPLACE FUNCTION public.check_unique_active_lease_per_unit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM lease_units lu
    JOIN leases l ON l.lease_id = lu.lease_id
    WHERE lu.unit_id = NEW.unit_id
      AND l.lease_state != 'TERMINATED'
      AND l.active = TRUE
      AND lu.lease_id != NEW.lease_id
  ) THEN
    RAISE EXCEPTION
      'Unit % already has an active or periodic lease. Terminate the existing lease before assigning a new one.',
      NEW.unit_id;
  END IF;
  RETURN NEW;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_add_rent_incentive(p_lease_id uuid, p_type text, p_headline_annual numeric, p_billed_monthly numeric, p_start_date date, p_end_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID;
        v_discount NUMERIC;
        v_tenant UUID;
BEGIN
  IF p_type NOT IN ('RENT_FREE','FIXED_DISCOUNT','STEPPED_RENT') THEN
    RAISE EXCEPTION 'Invalid incentive type';
  END IF;
  SELECT tenant_id INTO v_tenant FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;

  v_discount := CASE
    WHEN p_type = 'RENT_FREE' THEN ROUND(COALESCE(p_headline_annual,0)/12.0, 2)
    WHEN p_headline_annual IS NOT NULL AND p_billed_monthly IS NOT NULL
      THEN ROUND(p_headline_annual/12.0 - p_billed_monthly, 2)
    ELSE NULL END;

  INSERT INTO rent_incentives
    (lease_id, incentive_type, headline_amount_annual, discount_amount_monthly,
     billed_amount_monthly, effective_amount_annual, incentive_start_date, incentive_end_date, notes, active)
  VALUES
    (p_lease_id, p_type::incentive_type_enum, p_headline_annual, v_discount,
     CASE WHEN p_type = 'RENT_FREE' THEN 0 ELSE p_billed_monthly END,
     CASE WHEN p_type = 'RENT_FREE' THEN 0 ELSE ROUND(COALESCE(p_billed_monthly,0)*12, 2) END,
     p_start_date, p_end_date, p_notes, true)
  RETURNING incentive_id INTO v_id;

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_tenant, p_lease_id, 'SYSTEM',
          'Rent arrangement added: ' || LOWER(REPLACE(p_type,'_',' ')) ||
          CASE WHEN p_type <> 'RENT_FREE' AND p_billed_monthly IS NOT NULL
               THEN ' at ' || p_billed_monthly || '/mo' ELSE '' END ||
          ' from ' || TO_CHAR(p_start_date, 'DD Mon YYYY') ||
          CASE WHEN p_end_date IS NOT NULL THEN ' until ' || TO_CHAR(p_end_date, 'DD Mon YYYY') ELSE '' END);
  RETURN v_id;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_adjust_issued_charge(p_charge_id uuid, p_new_net numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_charge     RECORD;
  v_treatment  text;
  v_rate       numeric(6,4);
  v_vat        numeric(12,2);
  v_gross      numeric(12,2);
  v_new_status charge_status_enum;
BEGIN
  IF p_new_net IS NULL OR p_new_net < 0 THEN
    RAISE EXCEPTION 'New net amount must be zero or positive';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required for an invoice adjustment';
  END IF;

  SELECT charge_id, lease_id, tenant_id, charge_type, status, charge_label,
         COALESCE(payment_amount, 0) AS paid, net_amount, vat_amount
  INTO v_charge FROM charge_records WHERE charge_id = p_charge_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Charge not found'; END IF;

  IF v_charge.status NOT IN ('ISSUED', 'OVERDUE', 'PART_PAID') THEN
    RAISE EXCEPTION 'Only issued invoices can be adjusted here (current status: %). Use regenerate for drafts.', v_charge.status;
  END IF;

  SELECT vat_treatment::text INTO v_treatment
  FROM charge_profiles WHERE lease_id = v_charge.lease_id AND charge_type = v_charge.charge_type LIMIT 1;

  v_rate := CASE
    WHEN v_treatment = 'STANDARD' THEN 0.2000
    WHEN v_treatment IS NULL AND v_charge.net_amount > 0 THEN round(v_charge.vat_amount / v_charge.net_amount, 4)
    ELSE 0.0000 END;
  v_vat   := round(p_new_net * v_rate, 2);
  v_gross := p_new_net + v_vat;

  v_new_status := CASE
    WHEN v_charge.paid >= v_gross AND v_gross > 0 THEN 'PAID'
    WHEN v_charge.paid > 0 THEN 'PART_PAID'
    WHEN v_charge.status = 'OVERDUE' THEN 'OVERDUE'
    ELSE 'ISSUED' END::charge_status_enum;

  UPDATE charge_records SET
    net_amount = p_new_net,
    vat_amount = v_vat,
    status     = v_new_status,
    notes      = COALESCE(notes || ' | ', '') || 'Adjusted to net ' || p_new_net || ': ' || trim(p_reason),
    updated_at = now()
  WHERE charge_id = p_charge_id;

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_charge.tenant_id, v_charge.lease_id, 'SYSTEM',
    'Invoice "' || v_charge.charge_label || '" adjusted: net ' || v_charge.net_amount || ' -> ' || p_new_net ||
    ' (' || trim(p_reason) || ')');

  RETURN jsonb_build_object('charge_id', p_charge_id, 'net', p_new_net, 'vat', v_vat, 'gross', v_gross, 'status', v_new_status);
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_apply_rent_review(p_lease_id uuid, p_new_annual_rent numeric, p_effective_date date, p_next_review_date date DEFAULT NULL::date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old leases%ROWTYPE;
  v_next DATE;
BEGIN
  SELECT * INTO v_old FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;
  IF v_old.lease_state = 'TERMINATED' THEN RAISE EXCEPTION 'Lease is terminated'; END IF;
  IF p_new_annual_rent IS NULL OR p_new_annual_rent < 0 THEN
    RAISE EXCEPTION 'Invalid rent amount';
  END IF;

  v_next := COALESCE(
    p_next_review_date,
    CASE WHEN v_old.rent_review_frequency_months IS NOT NULL
         THEN p_effective_date + (v_old.rent_review_frequency_months || ' months')::interval
    END::date
  );

  UPDATE leases SET
    annual_rent = p_new_annual_rent,
    last_review_date = p_effective_date,
    next_rent_review_date = v_next,
    updated_at = now()
  WHERE lease_id = p_lease_id;

  UPDATE charge_profiles SET
    fixed_amount_annual = p_new_annual_rent,
    updated_at = now()
  WHERE lease_id = p_lease_id AND charge_type = 'RENT';

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_old.tenant_id, p_lease_id, 'RENT_REVIEW',
          'Rent review applied: ' || COALESCE(v_old.annual_rent::text, '?') || ' pa -> ' ||
          p_new_annual_rent || ' pa, effective ' || TO_CHAR(p_effective_date, 'DD Mon YYYY') ||
          CASE WHEN v_next IS NOT NULL THEN '. Next review ' || TO_CHAR(v_next, 'DD Mon YYYY') ELSE '' END);

  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_approve_asset_charges(p_asset_id uuid, p_charge_type text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count INTEGER;
BEGIN
  UPDATE charge_records
  SET status = 'APPROVED', updated_at = now()
  WHERE status = 'DRAFT' AND asset_id = p_asset_id AND charge_type::text = p_charge_type;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_approve_asset_drafts(p_asset_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count INTEGER;
BEGIN
  UPDATE charge_records
  SET status = 'APPROVED', updated_at = now()
  WHERE status = 'DRAFT' AND asset_id = p_asset_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_attach_lease_document(p_lease_id uuid, p_document_name text, p_file_reference text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lease leases%ROWTYPE;
  v_doc_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_lease FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;
  IF p_file_reference IS NULL OR TRIM(p_file_reference) = '' THEN
    RAISE EXCEPTION 'Document link is required';
  END IF;

  INSERT INTO documents (document_id, document_name, document_type, file_reference, file_format,
                         upload_date, uploaded_by, asset_id, lease_id, tenant_id)
  VALUES (v_doc_id,
          COALESCE(NULLIF(TRIM(COALESCE(p_document_name,'')),''), 'Lease - ' || v_lease.lease_reference),
          'LEASE', TRIM(p_file_reference), 'PDF',
          CURRENT_DATE, 'CPMS', v_lease.asset_id, p_lease_id, v_lease.tenant_id);

  UPDATE leases SET document_id = v_doc_id, updated_at = now() WHERE lease_id = p_lease_id;

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_lease.tenant_id, p_lease_id, 'SYSTEM',
          'Lease document attached: ' || COALESCE(NULLIF(TRIM(COALESCE(p_document_name,'')),''), v_lease.lease_reference));

  RETURN v_doc_id;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_calculate_lease_state(p_current_state lease_state_enum, p_expiry_date date, p_annual_rent numeric)
 RETURNS lease_state_enum
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    -- TERMINATED is manual-only — never overwritten by engine
    IF p_current_state = 'TERMINATED' THEN
        RETURN 'TERMINATED';
    END IF;

    -- £0 rent / no expiry (internal use, licences) — stay ACTIVE
    IF p_expiry_date IS NULL THEN
        RETURN 'ACTIVE';
    END IF;

    -- Past expiry → held over as PERIODIC
    IF p_expiry_date < CURRENT_DATE THEN
        RETURN 'PERIODIC';
    END IF;

    -- Within 12 months of expiry → approaching
    IF p_expiry_date <= CURRENT_DATE + INTERVAL '12 months' THEN
        RETURN 'APPROACHING_EXPIRY';
    END IF;

    RETURN 'ACTIVE';
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_delete_meter_reading(p_read_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_read   RECORD;
  v_charge RECORD;
BEGIN
  SELECT read_id, meter_id, read_date, charge_id
  INTO v_read FROM meter_reads WHERE read_id = p_read_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reading not found'; END IF;

  IF EXISTS (SELECT 1 FROM meter_reads WHERE meter_id = v_read.meter_id AND read_date > v_read.read_date) THEN
    RAISE EXCEPTION 'Only the most recent reading on a meter can be cleared';
  END IF;

  IF v_read.charge_id IS NOT NULL THEN
    SELECT charge_id, status INTO v_charge FROM charge_records WHERE charge_id = v_read.charge_id;
    IF FOUND AND v_charge.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'This reading''s electric charge has already been approved/issued and cannot be cleared. Credit or void it first.';
    END IF;
    DELETE FROM charge_records WHERE charge_id = v_read.charge_id;
  END IF;

  DELETE FROM meter_reads WHERE read_id = p_read_id;
  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_delete_rent_incentive(p_incentive_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lease uuid; v_tenant uuid;
BEGIN
  SELECT lease_id INTO v_lease FROM rent_incentives WHERE incentive_id = p_incentive_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Arrangement not found'; END IF;
  SELECT tenant_id INTO v_tenant FROM leases WHERE lease_id = v_lease;
  DELETE FROM rent_incentives WHERE incentive_id = p_incentive_id;
  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_tenant, v_lease, 'SYSTEM', 'Rent arrangement deleted');
  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_end_rent_incentive(p_incentive_id uuid, p_end_date date DEFAULT CURRENT_DATE)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lease UUID; v_tenant UUID;
BEGIN
  UPDATE rent_incentives
  SET incentive_end_date = p_end_date,
      active = (p_end_date >= CURRENT_DATE),
      updated_at = now()
  WHERE incentive_id = p_incentive_id
  RETURNING lease_id INTO v_lease;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incentive not found'; END IF;

  SELECT tenant_id INTO v_tenant FROM leases WHERE lease_id = v_lease;
  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_tenant, v_lease, 'SYSTEM',
          'Rent arrangement ended ' || TO_CHAR(p_end_date, 'DD Mon YYYY'));
  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_generate_asset_rent_charges(p_billing_month date, p_asset_id uuid)
 RETURNS TABLE(out_lease_id uuid, out_tenant_name text, out_charge_id uuid, out_net_amount numeric, out_label text, out_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_period_start  DATE;
  v_period_end    DATE;
  v_lease         RECORD;
  v_profile       RECORD;
  v_incentive     RECORD;
  v_unit_id       UUID;
  v_net_amount    NUMERIC(12,2);
  v_vat_rate      NUMERIC(5,4);
  v_vat_amount    NUMERIC(12,2);
  v_charge_id     UUID;
  v_label         TEXT;
  v_due_date      DATE;
  v_msg           TEXT;
BEGIN
  v_period_start := DATE_TRUNC('month', p_billing_month)::DATE;
  v_period_end   := (DATE_TRUNC('month', p_billing_month) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  FOR v_lease IN
    SELECT l.*, COALESCE(t.trading_name, t.legal_name) AS tenant_display_name
    FROM leases l
    JOIN tenants t ON t.tenant_id = l.tenant_id
    WHERE l.asset_id = p_asset_id
      AND l.lease_state IN ('ACTIVE','PERIODIC','APPROACHING_REVIEW','APPROACHING_EXPIRY')
      AND l.active = TRUE
      AND l.commencement_date <= v_period_end
      AND (l.termination_date IS NULL OR l.termination_date >= v_period_start)
  LOOP
    SELECT * INTO v_profile
    FROM charge_profiles cp
    WHERE cp.lease_id = v_lease.lease_id AND cp.charge_type = 'RENT'
      AND cp.applies = TRUE AND cp.active = TRUE
    LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM charge_records cr
      WHERE cr.lease_id = v_lease.lease_id AND cr.charge_type = 'RENT'
        AND cr.period_start = v_period_start
    ) THEN CONTINUE; END IF;

    SELECT lu.unit_id INTO v_unit_id FROM lease_units lu WHERE lu.lease_id = v_lease.lease_id LIMIT 1;
    IF v_unit_id IS NULL THEN CONTINUE; END IF;

    -- Rent derives from the lease (profile amount only as a fallback)
    v_net_amount := ROUND(COALESCE(v_lease.annual_rent, v_profile.fixed_amount_annual) / 12.0, 2);
    v_msg := NULL;

    SELECT * INTO v_incentive
    FROM rent_incentives ri
    WHERE ri.lease_id = v_lease.lease_id
      AND ri.active = TRUE
      AND (ri.incentive_start_date IS NULL OR ri.incentive_start_date <= v_period_start)
      AND (ri.incentive_end_date IS NULL OR ri.incentive_end_date >= v_period_start)
    ORDER BY ri.incentive_start_date DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
      IF v_incentive.incentive_type = 'RENT_FREE' THEN
        v_net_amount := 0.00;
        v_msg := 'Rent-free period active';
      ELSIF v_incentive.billed_amount_monthly IS NOT NULL THEN
        v_net_amount := ROUND(v_incentive.billed_amount_monthly, 2);
        v_msg := 'Incentive applied: ' || v_incentive.incentive_type;
      END IF;
    ELSIF v_lease.rent_free_end_date IS NOT NULL AND v_lease.rent_free_end_date >= v_period_start THEN
      v_net_amount := 0.00;
      v_msg := 'Rent-free period active';
    END IF;

    v_vat_rate   := CASE v_profile.vat_treatment WHEN 'STANDARD' THEN 0.2000 ELSE 0.0000 END;
    v_vat_amount := ROUND(v_net_amount * v_vat_rate, 2);
    v_label      := 'Rent ' || TO_CHAR(v_period_start, 'FMMonth YYYY');
    v_due_date   := (DATE_TRUNC('month', p_billing_month) + (COALESCE(v_lease.billing_day, 1) - 1) * INTERVAL '1 day')::DATE;
    v_charge_id  := gen_random_uuid();

    INSERT INTO charge_records (
      charge_id, lease_id, unit_id, tenant_id, asset_id,
      charge_type, charge_label, period_start, period_end,
      net_amount, vat_amount, vat_rate, due_date, status, generated_by, notes
    ) VALUES (
      v_charge_id, v_lease.lease_id, v_unit_id, v_lease.tenant_id, v_lease.asset_id,
      'RENT', v_label, v_period_start, v_period_end,
      v_net_amount, v_vat_amount, v_vat_rate, v_due_date, 'DRAFT', 'SYSTEM', v_msg
    );

    RETURN QUERY SELECT
      v_lease.lease_id, v_lease.tenant_display_name, v_charge_id, v_net_amount, v_label, COALESCE(v_msg, 'OK');
  END LOOP;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_generate_rent_charges(p_billing_month date)
 RETURNS TABLE(out_lease_id uuid, out_tenant_name text, out_charge_id uuid, out_net_amount numeric, out_label text, out_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  v_period_end   := (DATE_TRUNC('month', p_billing_month) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  FOR v_lease IN
    SELECT  l.*, COALESCE(t.trading_name, t.legal_name) AS tenant_display_name
    FROM    leases  l
    JOIN    tenants t ON t.tenant_id = l.tenant_id
    WHERE   l.lease_state IN ('ACTIVE','PERIODIC','APPROACHING_REVIEW','APPROACHING_EXPIRY')
    AND     l.active = TRUE
    AND     l.commencement_date <= v_period_end
    AND     (l.termination_date IS NULL OR l.termination_date >= v_period_start)
  LOOP
    SELECT * INTO v_profile
    FROM   charge_profiles cp
    WHERE  cp.lease_id = v_lease.lease_id AND cp.charge_type = 'RENT'
    AND    cp.applies = TRUE AND cp.active = TRUE
    LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM charge_records cr
      WHERE  cr.lease_id = v_lease.lease_id AND cr.charge_type = 'RENT'
      AND    cr.period_start = v_period_start
    ) THEN CONTINUE; END IF;

    SELECT lu.unit_id INTO v_unit_id FROM lease_units lu WHERE lu.lease_id = v_lease.lease_id LIMIT 1;
    IF v_unit_id IS NULL THEN CONTINUE; END IF;

    v_net_amount := ROUND(COALESCE(v_lease.annual_rent, v_profile.fixed_amount_annual) / 12.0, 2);

    v_is_rent_free := (v_lease.rent_free_end_date IS NOT NULL AND v_lease.rent_free_end_date >= v_period_start);
    IF v_is_rent_free THEN
      v_net_amount := 0.00;
      v_msg := 'Rent-free period active';
    ELSE
      v_msg := NULL;
    END IF;

    v_vat_rate := CASE v_profile.vat_treatment WHEN 'STANDARD' THEN 0.2000 ELSE 0.0000 END;
    v_vat_amount := ROUND(v_net_amount * v_vat_rate, 2);
    v_label := 'Rent ' || TO_CHAR(v_period_start, 'FMMonth YYYY');
    v_due_date := (DATE_TRUNC('month', p_billing_month) + (COALESCE(v_lease.billing_day, 1) - 1) * INTERVAL '1 day')::DATE;
    v_charge_id := gen_random_uuid();

    INSERT INTO charge_records (
      charge_id, lease_id, unit_id, tenant_id, asset_id,
      charge_type, charge_label, period_start, period_end,
      net_amount, vat_amount, vat_rate, due_date, status, generated_by, notes
    ) VALUES (
      v_charge_id, v_lease.lease_id, v_unit_id, v_lease.tenant_id, v_lease.asset_id,
      'RENT', v_label, v_period_start, v_period_end,
      v_net_amount, v_vat_amount, v_vat_rate, v_due_date, 'DRAFT', 'SYSTEM', v_msg
    );

    RETURN QUERY SELECT
      v_lease.lease_id, v_lease.tenant_display_name, v_charge_id, v_net_amount, v_label, COALESCE(v_msg, 'OK');
  END LOOP;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_issue_asset_charges(p_asset_id uuid, p_charge_type text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count INTEGER;
BEGIN
  UPDATE charge_records
  SET status = 'ISSUED', issued_date = CURRENT_DATE, updated_at = now()
  WHERE status = 'APPROVED' AND asset_id = p_asset_id AND charge_type::text = p_charge_type;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_issue_asset_drafts(p_asset_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count INTEGER;
BEGIN
  UPDATE charge_records
  SET status = 'ISSUED', issued_date = CURRENT_DATE, updated_at = now()
  WHERE status = 'APPROVED' AND asset_id = p_asset_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_let_unit(p_unit_ids uuid[], p_legal_name text, p_commencement date, p_annual_rent numeric, p_trading_name text DEFAULT NULL::text, p_tenant_type text DEFAULT 'COMPANY'::text, p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_lease_type text DEFAULT 'FIXED_TERM'::text, p_expiry date DEFAULT NULL::date, p_billing_frequency text DEFAULT 'MONTHLY'::text, p_vat_treatment text DEFAULT 'EXEMPT'::text, p_deposit numeric DEFAULT NULL::numeric, p_electric_recharge boolean DEFAULT false, p_lease_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset_id UUID;
  v_tenant_id UUID := gen_random_uuid();
  v_lease_id UUID := gen_random_uuid();
  v_ref TEXT;
  v_base TEXT;
  v_n INT := 0;
  v_unit RECORD;
  v_first_unit_ref TEXT;
BEGIN
  IF p_unit_ids IS NULL OR array_length(p_unit_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one unit';
  END IF;
  IF p_legal_name IS NULL OR TRIM(p_legal_name) = '' THEN
    RAISE EXCEPTION 'Tenant legal name is required';
  END IF;
  IF p_annual_rent IS NULL OR p_annual_rent < 0 THEN
    RAISE EXCEPTION 'Annual rent is required';
  END IF;
  IF p_lease_type = 'FIXED_TERM' AND p_expiry IS NULL THEN
    RAISE EXCEPTION 'Fixed term lease requires an expiry date';
  END IF;

  SELECT u.asset_id, u.unit_reference INTO v_asset_id, v_first_unit_ref
  FROM units u WHERE u.unit_id = p_unit_ids[1];
  IF NOT FOUND THEN RAISE EXCEPTION 'Unit not found'; END IF;

  FOR v_unit IN SELECT u.* FROM units u WHERE u.unit_id = ANY(p_unit_ids) LOOP
    IF v_unit.asset_id <> v_asset_id THEN
      RAISE EXCEPTION 'All units must belong to the same asset';
    END IF;
    IF EXISTS (
      SELECT 1 FROM lease_units lu
      JOIN leases l ON l.lease_id = lu.lease_id AND l.lease_state <> 'TERMINATED'
      WHERE lu.unit_id = v_unit.unit_id
    ) THEN
      RAISE EXCEPTION 'Unit % already has an active tenancy', v_unit.unit_reference;
    END IF;
  END LOOP;
  IF (SELECT COUNT(*) FROM units WHERE unit_id = ANY(p_unit_ids)) <> array_length(p_unit_ids, 1) THEN
    RAISE EXCEPTION 'One or more units not found';
  END IF;

  INSERT INTO tenants (tenant_id, legal_name, trading_name, tenant_type,
                       primary_contact_name, primary_contact_email, primary_contact_phone,
                       tenant_state, active)
  VALUES (v_tenant_id, TRIM(p_legal_name), NULLIF(TRIM(COALESCE(p_trading_name,'')),''),
          p_tenant_type::tenant_type_enum,
          COALESCE(NULLIF(TRIM(COALESCE(p_contact_name,'')),''), TRIM(p_legal_name)),
          p_contact_email, p_contact_phone, 'STABLE', true);

  v_base := COALESCE(NULLIF(TRIM(COALESCE(p_lease_reference,'')),''), REPLACE(v_first_unit_ref, '.', '-'));
  v_ref := v_base;
  WHILE EXISTS (SELECT 1 FROM leases WHERE lease_reference = v_ref) LOOP
    v_n := v_n + 1;
    v_ref := v_base || '/L' || TO_CHAR(p_commencement, 'YYYY') || CASE WHEN v_n > 1 THEN '-' || v_n ELSE '' END;
  END LOOP;

  INSERT INTO leases (
    lease_id, lease_reference, lease_type, tenant_id, asset_id,
    commencement_date, rent_commencement_date, expiry_date, annual_rent,
    billing_frequency, billing_day, deposit_amount,
    deposit_type, lease_state, original_start_date, active, notes
  ) VALUES (
    v_lease_id, v_ref, p_lease_type::lease_type_enum, v_tenant_id, v_asset_id,
    p_commencement, p_commencement, p_expiry, p_annual_rent,
    p_billing_frequency::billing_frequency_enum, 1, p_deposit,
    CASE WHEN p_deposit IS NOT NULL AND p_deposit > 0 THEN 'CASH'::deposit_type_enum ELSE 'NONE'::deposit_type_enum END,
    CASE WHEN p_lease_type = 'PERIODIC' THEN 'PERIODIC'::lease_state_enum ELSE 'ACTIVE'::lease_state_enum END,
    p_commencement, true,
    'New letting created in CPMS'
  );

  INSERT INTO lease_units (lease_id, unit_id)
  SELECT v_lease_id, uid FROM unnest(p_unit_ids) AS uid;

  INSERT INTO charge_profiles
    (lease_id, charge_type, charge_label, applies, vat_treatment, vat_deferred,
     billing_frequency, calculation_method, fixed_amount_annual, active)
  VALUES
    (v_lease_id, 'RENT', 'Rent', true, p_vat_treatment::vat_treatment_enum, false,
     p_billing_frequency::billing_frequency_enum, 'FIXED', p_annual_rent, true);

  UPDATE units SET unit_state = 'OCCUPIED', vacancy_start_date = NULL, updated_at = now()
  WHERE unit_id = ANY(p_unit_ids);

  UPDATE meters SET active = p_electric_recharge, updated_at = now()
  WHERE unit_id = ANY(p_unit_ids);

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_tenant_id, v_lease_id, 'SYSTEM',
          'New tenancy: ' || TRIM(p_legal_name) || ' from ' || TO_CHAR(p_commencement, 'DD Mon YYYY') ||
          ' at ' || p_annual_rent || ' pa (' || LOWER(p_billing_frequency) || ')');

  RETURN v_lease_id;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_log_arrears_action(p_asset_id uuid, p_tenant_id uuid, p_stage text, p_method text DEFAULT NULL::text, p_amount numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO arrears_actions (asset_id, tenant_id, action_date, stage, method, amount, notes)
  VALUES (p_asset_id, p_tenant_id, COALESCE(p_date, CURRENT_DATE), p_stage, p_method, p_amount, p_notes)
  RETURNING action_id INTO v_id;
  RETURN v_id;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_log_tenant_activity(p_tenant_id uuid, p_activity_type text, p_summary text, p_activity_at timestamp with time zone DEFAULT now(), p_lease_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID;
BEGIN
  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, activity_at, summary)
  VALUES (p_tenant_id, p_lease_id, p_activity_type, COALESCE(p_activity_at, now()), p_summary)
  RETURNING activity_id INTO v_id;
  RETURN v_id;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_mark_charges_sent(p_charge_ids uuid[], p_method text, p_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count INTEGER;
BEGIN
  UPDATE charge_records
  SET sent_date = p_date, sent_method = p_method, updated_at = now()
  WHERE charge_id = ANY(p_charge_ids)
    AND status NOT IN ('DRAFT'::charge_status_enum, 'APPROVED'::charge_status_enum);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_mark_charges_sent_preferred(p_charge_ids uuid[], p_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count INTEGER;
BEGIN
  UPDATE charge_records cr
  SET sent_date = p_date, sent_method = t.preferred_delivery_method, updated_at = now()
  FROM tenants t
  WHERE cr.tenant_id = t.tenant_id
    AND cr.charge_id = ANY(p_charge_ids)
    AND cr.status NOT IN ('DRAFT'::charge_status_enum, 'APPROVED'::charge_status_enum);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_preview_asset_rent_charges(p_billing_month date, p_asset_id uuid)
 RETURNS TABLE(lease_id uuid, tenant_name text, unit_reference text, net_amount numeric, vat_rate numeric, vat_amount numeric, gross_amount numeric, label text, already_exists boolean, note text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH p AS (
    SELECT date_trunc('month', p_billing_month)::date AS ps,
           (date_trunc('month', p_billing_month) + interval '1 month' - interval '1 day')::date AS pe
  )
  SELECT
    l.lease_id,
    COALESCE(t.trading_name, t.legal_name) AS tenant_name,
    u.unit_reference,
    calc.net_amount,
    calc.vat_rate,
    calc.vat_amount,
    (calc.net_amount + calc.vat_amount) AS gross_amount,
    'Rent ' || to_char(p.ps, 'FMMonth YYYY') AS label,
    EXISTS (
      SELECT 1 FROM charge_records cr
      WHERE cr.lease_id = l.lease_id AND cr.charge_type = 'RENT' AND cr.period_start = p.ps
    ) AS already_exists,
    calc.note
  FROM p
  JOIN leases l ON l.asset_id = p_asset_id AND l.active = TRUE
    AND l.lease_state IN ('ACTIVE','PERIODIC','APPROACHING_REVIEW','APPROACHING_EXPIRY')
    AND l.commencement_date <= p.pe
    AND (l.termination_date IS NULL OR l.termination_date >= p.ps)
  JOIN tenants t ON t.tenant_id = l.tenant_id
  JOIN charge_profiles cp ON cp.lease_id = l.lease_id AND cp.charge_type = 'RENT'
    AND cp.applies = TRUE AND cp.active = TRUE
  JOIN LATERAL (SELECT lu.unit_id FROM lease_units lu WHERE lu.lease_id = l.lease_id LIMIT 1) ul ON TRUE
  JOIN units u ON u.unit_id = ul.unit_id
  LEFT JOIN LATERAL (
    SELECT ri.incentive_type, ri.billed_amount_monthly
    FROM rent_incentives ri
    WHERE ri.lease_id = l.lease_id AND ri.active = TRUE
      AND (ri.incentive_start_date IS NULL OR ri.incentive_start_date <= p.ps)
      AND (ri.incentive_end_date IS NULL OR ri.incentive_end_date >= p.ps)
    ORDER BY ri.incentive_start_date DESC NULLS LAST
    LIMIT 1
  ) inc ON TRUE
  CROSS JOIN LATERAL (
    SELECT net_amount, vat_rate, round(net_amount * vat_rate, 2) AS vat_amount, note
    FROM (
      SELECT
        CASE
          WHEN inc.incentive_type = 'RENT_FREE' THEN 0.00
          WHEN inc.billed_amount_monthly IS NOT NULL THEN round(inc.billed_amount_monthly, 2)
          WHEN l.rent_free_end_date IS NOT NULL AND l.rent_free_end_date >= p.ps THEN 0.00
          ELSE round(COALESCE(l.annual_rent, cp.fixed_amount_annual) / 12.0, 2)
        END AS net_amount,
        CASE cp.vat_treatment WHEN 'STANDARD' THEN 0.2000 ELSE 0.0000 END AS vat_rate,
        CASE
          WHEN inc.incentive_type = 'RENT_FREE' THEN 'Rent-free period active'
          WHEN inc.billed_amount_monthly IS NOT NULL THEN 'Incentive applied: ' || inc.incentive_type
          WHEN l.rent_free_end_date IS NOT NULL AND l.rent_free_end_date >= p.ps THEN 'Rent-free period active'
          ELSE NULL
        END AS note
    ) z
  ) calc
  ORDER BY u.unit_reference;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_reassign_lease_tenant(p_lease_id uuid, p_new_legal_name text, p_new_trading_name text DEFAULT NULL::text, p_new_company_number text DEFAULT NULL::text, p_copy_contacts boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lease leases%ROWTYPE;
  v_old tenants%ROWTYPE;
  v_new_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_lease FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;
  IF v_lease.lease_state = 'TERMINATED' THEN RAISE EXCEPTION 'Lease is terminated'; END IF;
  IF p_new_legal_name IS NULL OR TRIM(p_new_legal_name) = '' THEN
    RAISE EXCEPTION 'New legal name is required';
  END IF;

  SELECT * INTO v_old FROM tenants WHERE tenant_id = v_lease.tenant_id;

  INSERT INTO tenants (tenant_id, legal_name, trading_name, company_number, tenant_type,
                       primary_contact_name, primary_contact_email, primary_contact_phone,
                       accounts_contact_name, accounts_contact_email, accounts_contact_phone,
                       emergency_contact_name, emergency_contact_phone, director_name,
                       correspondence_address, tenant_state, active)
  VALUES (v_new_id, TRIM(p_new_legal_name), NULLIF(TRIM(COALESCE(p_new_trading_name,'')),''),
          p_new_company_number, COALESCE(v_old.tenant_type, 'COMPANY'),
          COALESCE(CASE WHEN p_copy_contacts THEN v_old.primary_contact_name END, TRIM(p_new_legal_name)),
          CASE WHEN p_copy_contacts THEN v_old.primary_contact_email END,
          CASE WHEN p_copy_contacts THEN v_old.primary_contact_phone END,
          CASE WHEN p_copy_contacts THEN v_old.accounts_contact_name END,
          CASE WHEN p_copy_contacts THEN v_old.accounts_contact_email END,
          CASE WHEN p_copy_contacts THEN v_old.accounts_contact_phone END,
          CASE WHEN p_copy_contacts THEN v_old.emergency_contact_name END,
          CASE WHEN p_copy_contacts THEN v_old.emergency_contact_phone END,
          CASE WHEN p_copy_contacts THEN v_old.director_name END,
          CASE WHEN p_copy_contacts THEN v_old.correspondence_address END,
          'STABLE', true);

  UPDATE leases SET tenant_id = v_new_id, updated_at = now() WHERE lease_id = p_lease_id;

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary) VALUES
    (v_old.tenant_id, p_lease_id, 'SYSTEM',
     'Lease ' || v_lease.lease_reference || ' transferred to new entity: ' || TRIM(p_new_legal_name)),
    (v_new_id, p_lease_id, 'SYSTEM',
     'Lease ' || v_lease.lease_reference || ' transferred from ' || v_old.legal_name ||
     '. Charges and payments before this date belong to the previous entity.');

  RETURN v_new_id;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_record_asset_payment(p_asset_id uuid, p_tenant_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_method text DEFAULT 'BANK_TRANSFER'::text, p_notes text DEFAULT NULL::text, p_charge_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_id  UUID;
  v_remaining   NUMERIC(12,2);
  v_outstanding NUMERIC(12,2);
  v_alloc       NUMERIC(12,2);
  v_charge      RECORD;
  v_allocations JSONB := '[]'::jsonb;
  v_lease_id    UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM assets WHERE asset_id = p_asset_id) THEN
    RAISE EXCEPTION 'Asset not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  INSERT INTO payments (asset_id, tenant_id, payment_date, amount, method, notes, charge_type)
  VALUES (p_asset_id, p_tenant_id, p_payment_date, p_amount, COALESCE(p_method, 'BANK_TRANSFER'),
          p_notes, p_charge_type::charge_type_enum)
  RETURNING payment_id INTO v_payment_id;

  v_remaining := p_amount;

  FOR v_charge IN
    SELECT charge_id, lease_id, charge_label, gross_amount,
           COALESCE(payment_amount, 0) AS paid_so_far
    FROM   charge_records
    WHERE  asset_id  = p_asset_id
      AND  tenant_id = p_tenant_id
      AND  status IN ('ISSUED', 'OVERDUE', 'PART_PAID')
      AND  gross_amount - COALESCE(payment_amount, 0) > 0
      AND  (p_charge_type IS NULL OR charge_type = p_charge_type::charge_type_enum)
    ORDER BY due_date ASC, period_start ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_outstanding := v_charge.gross_amount - v_charge.paid_so_far;
    v_alloc       := LEAST(v_remaining, v_outstanding);
    v_lease_id    := v_charge.lease_id;

    UPDATE charge_records
    SET payment_amount = v_charge.paid_so_far + v_alloc,
        payment_date   = p_payment_date,
        status         = CASE WHEN v_charge.paid_so_far + v_alloc >= v_charge.gross_amount
                              THEN 'PAID'::charge_status_enum
                              ELSE 'PART_PAID'::charge_status_enum END,
        updated_at     = now()
    WHERE charge_id = v_charge.charge_id;

    INSERT INTO payment_allocations (payment_id, charge_id, allocated_amount)
    VALUES (v_payment_id, v_charge.charge_id, v_alloc);

    v_allocations := v_allocations || jsonb_build_object(
      'charge_id', v_charge.charge_id,
      'charge_label', v_charge.charge_label,
      'allocated', v_alloc,
      'fully_paid', (v_charge.paid_so_far + v_alloc >= v_charge.gross_amount)
    );
    v_remaining := v_remaining - v_alloc;
  END LOOP;

  UPDATE payments SET unallocated_amount = v_remaining WHERE payment_id = v_payment_id;

  -- Timeline entry
  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, activity_at, summary)
  VALUES (p_tenant_id, v_lease_id, 'PAYMENT', p_payment_date::timestamptz,
          COALESCE(INITCAP(REPLACE(p_charge_type, '_', ' ')) || ' payment', 'Payment') ||
          ' received: ' || p_amount || ' (' || LOWER(REPLACE(COALESCE(p_method,'BANK_TRANSFER'), '_', ' ')) || ')' ||
          CASE WHEN v_remaining > 0 THEN '. Unallocated: ' || v_remaining ELSE '' END);

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'amount', p_amount,
    'allocated', p_amount - v_remaining,
    'unallocated', v_remaining,
    'allocations', v_allocations
  );
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_record_lease_payment(p_lease_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_method text DEFAULT 'BANK_TRANSFER'::text, p_notes text DEFAULT NULL::text, p_charge_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset       UUID;
  v_tenant      UUID;
  v_payment_id  UUID;
  v_remaining   NUMERIC(12,2);
  v_outstanding NUMERIC(12,2);
  v_alloc       NUMERIC(12,2);
  v_charge      RECORD;
  v_allocations JSONB := '[]'::jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  SELECT asset_id, tenant_id INTO v_asset, v_tenant FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;

  INSERT INTO payments (asset_id, tenant_id, payment_date, amount, method, notes, charge_type)
  VALUES (v_asset, v_tenant, p_payment_date, p_amount, COALESCE(p_method, 'BANK_TRANSFER'),
          p_notes, p_charge_type::charge_type_enum)
  RETURNING payment_id INTO v_payment_id;

  v_remaining := p_amount;

  FOR v_charge IN
    SELECT charge_id, charge_label, gross_amount, COALESCE(payment_amount, 0) AS paid_so_far
    FROM   charge_records
    WHERE  lease_id = p_lease_id
      AND  status IN ('ISSUED', 'OVERDUE', 'PART_PAID')
      AND  gross_amount - COALESCE(payment_amount, 0) > 0
      AND  (p_charge_type IS NULL OR charge_type = p_charge_type::charge_type_enum)
    ORDER BY due_date ASC, period_start ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_outstanding := v_charge.gross_amount - v_charge.paid_so_far;
    v_alloc       := LEAST(v_remaining, v_outstanding);

    UPDATE charge_records
    SET payment_amount = v_charge.paid_so_far + v_alloc,
        payment_date   = p_payment_date,
        status         = CASE WHEN v_charge.paid_so_far + v_alloc >= v_charge.gross_amount
                              THEN 'PAID'::charge_status_enum ELSE 'PART_PAID'::charge_status_enum END,
        updated_at     = now()
    WHERE charge_id = v_charge.charge_id;

    INSERT INTO payment_allocations (payment_id, charge_id, allocated_amount)
    VALUES (v_payment_id, v_charge.charge_id, v_alloc);

    v_allocations := v_allocations || jsonb_build_object(
      'charge_id', v_charge.charge_id, 'charge_label', v_charge.charge_label,
      'allocated', v_alloc, 'fully_paid', (v_charge.paid_so_far + v_alloc >= v_charge.gross_amount));
    v_remaining := v_remaining - v_alloc;
  END LOOP;

  UPDATE payments SET unallocated_amount = v_remaining WHERE payment_id = v_payment_id;

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, activity_at, summary)
  VALUES (v_tenant, p_lease_id, 'PAYMENT', p_payment_date::timestamptz,
          COALESCE(INITCAP(REPLACE(p_charge_type, '_', ' ')) || ' payment', 'Payment') ||
          ' received: ' || p_amount || ' (' || LOWER(REPLACE(COALESCE(p_method,'BANK_TRANSFER'), '_', ' ')) || ')' ||
          CASE WHEN v_remaining > 0 THEN '. Unallocated: ' || v_remaining ELSE '' END);

  RETURN jsonb_build_object(
    'payment_id', v_payment_id, 'amount', p_amount,
    'allocated', p_amount - v_remaining, 'unallocated', v_remaining, 'allocations', v_allocations);
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_record_meter_reading(p_meter_id uuid, p_read_date date, p_reading numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meter       RECORD;
  v_prev        RECORD;
  v_rate        RECORD;
  v_lease       RECORD;
  v_consumption NUMERIC;
  v_net         NUMERIC(12,2);
  v_vat         NUMERIC(12,2);
  v_charge_id   UUID;
  v_read_id     UUID;
BEGIN
  SELECT m.meter_id, m.unit_id, m.asset_id, m.meter_reference, m.active, u.block_id, u.unit_reference,
         COALESCE(m.dial_count, 6) AS dial_count
  INTO v_meter
  FROM meters m JOIN units u ON u.unit_id = m.unit_id
  WHERE m.meter_id = p_meter_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meter not found'; END IF;

  IF p_reading < 0 OR p_reading >= power(10, v_meter.dial_count)::numeric THEN
    RAISE EXCEPTION 'Reading % is outside this meter''s range (0 to %). Enter the actual meter reading.',
      p_reading, (power(10, v_meter.dial_count)::numeric - 1);
  END IF;

  IF EXISTS (SELECT 1 FROM meter_reads WHERE meter_id = p_meter_id AND read_date = p_read_date) THEN
    RAISE EXCEPTION 'A reading already exists for this meter on %', p_read_date;
  END IF;

  SELECT read_date, reading_value INTO v_prev
  FROM meter_reads
  WHERE meter_id = p_meter_id AND read_date < p_read_date
  ORDER BY read_date DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No opening read exists before % for this meter. Enter an opening read first.', p_read_date;
  END IF;

  -- Rollover: if the reading is lower than the previous, the meter wrapped past its maximum
  IF p_reading < v_prev.reading_value THEN
    v_consumption := (power(10, v_meter.dial_count)::numeric - v_prev.reading_value) + p_reading;
  ELSE
    v_consumption := p_reading - v_prev.reading_value;
  END IF;

  IF NOT v_meter.active THEN
    INSERT INTO meter_reads (meter_id, read_date, reading_value, read_type, entered_by, consumption_kwh, notes)
    VALUES (p_meter_id, p_read_date, p_reading, 'ACTUAL', 'UI', v_consumption, 'Billing off - usage tracked, no charge raised')
    RETURNING read_id INTO v_read_id;
    RETURN jsonb_build_object('read_id', v_read_id, 'billed', false, 'consumption', v_consumption);
  END IF;

  SELECT rate_per_kwh INTO v_rate
  FROM utility_rates
  WHERE asset_id = v_meter.asset_id
    AND utility_type = 'ELECTRICITY'
    AND effective_from <= p_read_date
    AND (effective_to IS NULL OR effective_to >= p_read_date)
    AND (block_id = v_meter.block_id OR block_id IS NULL)
  ORDER BY (block_id IS NOT NULL) DESC, effective_from DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No electricity rate configured for this asset/block as at %', p_read_date;
  END IF;

  SELECT l.lease_id, l.tenant_id INTO v_lease
  FROM lease_units lu
  JOIN leases l ON l.lease_id = lu.lease_id
  WHERE lu.unit_id = v_meter.unit_id AND l.lease_state <> 'TERMINATED'
  ORDER BY l.commencement_date DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active lease found for unit % — turn billing off for this meter to track usage without invoicing', v_meter.unit_reference;
  END IF;

  v_net := ROUND(v_consumption * v_rate.rate_per_kwh, 2);
  v_vat := ROUND(v_net * 0.20, 2);

  INSERT INTO charge_records
    (lease_id, unit_id, tenant_id, asset_id, charge_type, charge_label,
     period_start, period_end, net_amount, vat_amount, vat_rate, due_date,
     status, generated_by, notes)
  VALUES
    (v_lease.lease_id, v_meter.unit_id, v_lease.tenant_id, v_meter.asset_id, 'ELECTRIC',
     'Electric - ' || TRIM(TO_CHAR(p_read_date, 'FMMonth YYYY')),
     v_prev.read_date, p_read_date, v_net, v_vat, 20, p_read_date,
     'DRAFT', 'MANUAL',
     'Meter ' || v_meter.meter_reference || ': ' || v_prev.reading_value || ' -> ' || p_reading ||
     ' (' || v_consumption || ' kWh @ ' || v_rate.rate_per_kwh || ')')
  RETURNING charge_id INTO v_charge_id;

  INSERT INTO meter_reads (meter_id, read_date, reading_value, read_type, entered_by, consumption_kwh, charge_id)
  VALUES (p_meter_id, p_read_date, p_reading, 'ACTUAL', 'UI', v_consumption, v_charge_id)
  RETURNING read_id INTO v_read_id;

  RETURN jsonb_build_object(
    'read_id', v_read_id, 'billed', true, 'charge_id', v_charge_id,
    'consumption', v_consumption, 'rate', v_rate.rate_per_kwh,
    'net', v_net, 'vat', v_vat, 'gross', v_net + v_vat
  );
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_refresh_lease_states()
 RETURNS TABLE(lease_reference text, old_state lease_state_enum, new_state lease_state_enum)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH updates AS (
        UPDATE leases l
        SET    lease_state = fn_calculate_lease_state(
                                 l.lease_state,
                                 l.expiry_date,
                                 l.annual_rent
                             )
        WHERE  l.active = TRUE
          AND  l.lease_state <> 'TERMINATED'
          AND  l.lease_state <> fn_calculate_lease_state(
                                     l.lease_state,
                                     l.expiry_date,
                                     l.annual_rent
                                 )
        RETURNING l.lease_reference,
                  l.lease_state AS new_state
    )
    -- Note: RETURNING gives new value; join to get old would need CTE before update.
    -- Simplified: return all changed records with their new state.
    SELECT u.lease_reference, NULL::lease_state_enum, u.new_state
    FROM   updates u;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_regenerate_asset_draft_charges(p_billing_month date, p_asset_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ps DATE := date_trunc('month', p_billing_month)::date;
  v_count INTEGER := 0;
  r RECORD;
  v_net NUMERIC(12,2);
  v_rate NUMERIC(5,4);
  v_inc RECORD;
BEGIN
  FOR r IN
    SELECT cr.charge_id, cr.lease_id, l.annual_rent, l.rent_free_end_date,
           cp.fixed_amount_annual, cp.vat_treatment
    FROM charge_records cr
    JOIN leases l ON l.lease_id = cr.lease_id
    JOIN charge_profiles cp ON cp.lease_id = cr.lease_id AND cp.charge_type = 'RENT'
    WHERE cr.asset_id = p_asset_id AND cr.charge_type = 'RENT'
      AND cr.status = 'DRAFT' AND cr.period_start = v_ps
  LOOP
    SELECT ri.incentive_type, ri.billed_amount_monthly INTO v_inc
    FROM rent_incentives ri
    WHERE ri.lease_id = r.lease_id AND ri.active = TRUE
      AND (ri.incentive_start_date IS NULL OR ri.incentive_start_date <= v_ps)
      AND (ri.incentive_end_date IS NULL OR ri.incentive_end_date >= v_ps)
    ORDER BY ri.incentive_start_date DESC NULLS LAST
    LIMIT 1;

    v_net := CASE
      WHEN v_inc.incentive_type = 'RENT_FREE' THEN 0.00
      WHEN v_inc.billed_amount_monthly IS NOT NULL THEN round(v_inc.billed_amount_monthly, 2)
      WHEN r.rent_free_end_date IS NOT NULL AND r.rent_free_end_date >= v_ps THEN 0.00
      ELSE round(COALESCE(r.annual_rent, r.fixed_amount_annual) / 12.0, 2)
    END;
    v_rate := CASE r.vat_treatment WHEN 'STANDARD' THEN 0.2000 ELSE 0.0000 END;

    UPDATE charge_records
    SET net_amount = v_net, vat_rate = v_rate, vat_amount = round(v_net * v_rate, 2), updated_at = now()
    WHERE charge_id = r.charge_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_renew_lease(p_lease_id uuid, p_new_commencement date, p_new_expiry date, p_new_annual_rent numeric, p_new_review_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old leases%ROWTYPE;
  v_new_id UUID := gen_random_uuid();
  v_base_ref TEXT;
  v_new_ref TEXT;
  v_n INT := 0;
BEGIN
  SELECT * INTO v_old FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;
  IF v_old.lease_state = 'TERMINATED' THEN RAISE EXCEPTION 'Lease already terminated'; END IF;

  -- Renewal reference: BASE/R2026 (suffix increments if needed)
  v_base_ref := regexp_replace(v_old.lease_reference, '/R\d{4}(-\d+)?$', '');
  v_new_ref  := v_base_ref || '/R' || TO_CHAR(p_new_commencement, 'YYYY');
  WHILE EXISTS (SELECT 1 FROM leases WHERE lease_reference = v_new_ref) LOOP
    v_n := v_n + 1;
    v_new_ref := v_base_ref || '/R' || TO_CHAR(p_new_commencement, 'YYYY') || '-' || v_n;
  END LOOP;

  UPDATE leases SET
    lease_state = 'TERMINATED',
    termination_date = p_new_commencement - 1,
    termination_reason = 'EXPIRY',
    active = false,
    notes = COALESCE(notes || ' | ', '') || 'Renewed ' || TO_CHAR(p_new_commencement, 'DD Mon YYYY'),
    updated_at = now()
  WHERE lease_id = p_lease_id;

  INSERT INTO leases (
    lease_id, lease_reference, lease_type, tenant_id, asset_id,
    commencement_date, rent_commencement_date, expiry_date, annual_rent, billing_frequency, billing_day,
    next_rent_review_date, rent_review_basis, last_review_date,
    permitted_use, insurance_recharge, deposit_amount, deposit_type,
    repairing_obligation, lease_state, original_start_date, active, notes
  ) VALUES (
    v_new_id, v_new_ref, 'FIXED_TERM', v_old.tenant_id, v_old.asset_id,
    p_new_commencement, p_new_commencement, p_new_expiry, p_new_annual_rent, v_old.billing_frequency, v_old.billing_day,
    p_new_review_date, v_old.rent_review_basis, NULL,
    v_old.permitted_use, v_old.insurance_recharge, v_old.deposit_amount, v_old.deposit_type,
    v_old.repairing_obligation, 'ACTIVE', COALESCE(v_old.original_start_date, v_old.commencement_date), true,
    'Renewal of lease commencing ' || TO_CHAR(v_old.commencement_date, 'DD Mon YYYY')
  );

  INSERT INTO lease_units (lease_id, unit_id)
  SELECT v_new_id, unit_id FROM lease_units WHERE lease_id = p_lease_id;

  INSERT INTO charge_profiles
    (lease_id, charge_type, charge_label, applies, vat_treatment, vat_deferred,
     billing_frequency, calculation_method, fixed_amount_annual, active)
  SELECT v_new_id, charge_type, charge_label, applies, vat_treatment, vat_deferred,
         billing_frequency, calculation_method,
         CASE WHEN charge_type = 'RENT' THEN p_new_annual_rent ELSE fixed_amount_annual END,
         active
  FROM charge_profiles WHERE lease_id = p_lease_id;

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_old.tenant_id, v_new_id, 'OTHER',
          'Lease renewed: ' || TO_CHAR(p_new_commencement, 'DD Mon YYYY') || ' to ' ||
          TO_CHAR(p_new_expiry, 'DD Mon YYYY') || ' at ' || p_new_annual_rent || ' pa');

  RETURN v_new_id;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_reset_meter(p_meter_id uuid, p_effective_date date, p_start_reading numeric DEFAULT 0, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_dial smallint; v_read_id uuid;
BEGIN
  SELECT dial_count INTO v_dial FROM meters WHERE meter_id = p_meter_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meter not found'; END IF;
  IF p_start_reading < 0 OR p_start_reading >= power(10, COALESCE(v_dial,6))::numeric THEN
    RAISE EXCEPTION 'Start reading is outside the meter''s range';
  END IF;
  IF EXISTS (SELECT 1 FROM meter_reads WHERE meter_id = p_meter_id AND read_date = p_effective_date) THEN
    RAISE EXCEPTION 'A reading already exists for this meter on %', p_effective_date;
  END IF;
  INSERT INTO meter_reads (meter_id, read_date, reading_value, read_type, entered_by, consumption_kwh, notes)
  VALUES (p_meter_id, p_effective_date, p_start_reading, 'ACTUAL', 'UI', NULL,
          'Meter reset/replacement baseline' || COALESCE(' - ' || p_note, ''))
  RETURNING read_id INTO v_read_id;
  RETURN v_read_id;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_set_meter_active(p_meter_id uuid, p_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE meters SET active = p_active, updated_at = now() WHERE meter_id = p_meter_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meter not found'; END IF;
  RETURN p_active;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_set_meter_digits(p_meter_id uuid, p_dial_count smallint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_dial_count < 4 OR p_dial_count > 8 THEN
    RAISE EXCEPTION 'Dial count must be between 4 and 8 digits';
  END IF;
  UPDATE meters SET dial_count = p_dial_count, updated_at = now() WHERE meter_id = p_meter_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meter not found'; END IF;
  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_set_vat_config(p_asset_id uuid, p_registered boolean, p_quarter_end_month smallint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_quarter_end_month IS NOT NULL AND (p_quarter_end_month < 1 OR p_quarter_end_month > 12) THEN
    RAISE EXCEPTION 'quarter_end_month must be 1-12';
  END IF;
  INSERT INTO vat_config (asset_id, registered, quarter_end_month, updated_at)
  VALUES (p_asset_id, p_registered, p_quarter_end_month, now())
  ON CONFLICT (asset_id) DO UPDATE
    SET registered = EXCLUDED.registered,
        quarter_end_month = EXCLUDED.quarter_end_month,
        updated_at = now();
  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_terminate_lease(p_lease_id uuid, p_termination_date date, p_reason text DEFAULT 'SURRENDER'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old leases%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;
  IF v_old.lease_state = 'TERMINATED' THEN RAISE EXCEPTION 'Lease already terminated'; END IF;

  UPDATE leases SET
    lease_state = 'TERMINATED',
    termination_date = p_termination_date,
    termination_reason = p_reason::termination_reason_enum,
    active = false,
    updated_at = now()
  WHERE lease_id = p_lease_id;

  -- Units become vacant; their meters stop billing (usage still tracked)
  UPDATE units SET unit_state = 'VACANT', vacancy_start_date = p_termination_date, updated_at = now()
  WHERE unit_id IN (SELECT unit_id FROM lease_units WHERE lease_id = p_lease_id);

  UPDATE meters SET active = false, updated_at = now()
  WHERE unit_id IN (SELECT unit_id FROM lease_units WHERE lease_id = p_lease_id);

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_old.tenant_id, p_lease_id, 'OTHER',
          'Tenancy ended ' || TO_CHAR(p_termination_date, 'DD Mon YYYY') || ' (' || LOWER(p_reason) || ')');

  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_update_arrears()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE charge_records
  SET    status = 'OVERDUE'
  WHERE  status = 'ISSUED'
  AND    due_date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_update_lease_property(p_lease_id uuid, p_lease_type text, p_permitted_use text, p_commencement_date date, p_expiry_date date, p_original_start_date date, p_billing_frequency text, p_billing_day smallint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;

  UPDATE leases SET
    lease_type          = COALESCE(p_lease_type::lease_type_enum, lease_type),
    permitted_use       = p_permitted_use,
    commencement_date   = COALESCE(p_commencement_date, commencement_date),
    expiry_date         = p_expiry_date,
    original_start_date = p_original_start_date,
    billing_frequency   = COALESCE(p_billing_frequency::billing_frequency_enum, billing_frequency),
    billing_day         = COALESCE(p_billing_day, billing_day),
    updated_at = now()
  WHERE lease_id = p_lease_id;

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_tenant, p_lease_id, 'SYSTEM', 'Property & tenancy details updated');
  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_update_lease_review(p_lease_id uuid, p_next_rent_review_date date, p_rent_review_basis text, p_rent_review_frequency_months smallint, p_last_review_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;

  UPDATE leases SET
    next_rent_review_date        = p_next_rent_review_date,
    rent_review_basis            = COALESCE(p_rent_review_basis::rent_review_basis_enum, rent_review_basis),
    rent_review_frequency_months = p_rent_review_frequency_months,
    last_review_date             = p_last_review_date,
    updated_at = now()
  WHERE lease_id = p_lease_id;

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_tenant, p_lease_id, 'SYSTEM', 'Rent review & renewal details updated');
  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_update_lease_terms(p_lease_id uuid, p_permitted_use text DEFAULT NULL::text, p_vat_treatment text DEFAULT NULL::text, p_insurance_recharge boolean DEFAULT NULL::boolean, p_deposit_amount numeric DEFAULT NULL::numeric, p_annual_rent numeric DEFAULT NULL::numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM leases WHERE lease_id = p_lease_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease not found'; END IF;

  UPDATE leases SET
    permitted_use      = COALESCE(p_permitted_use, permitted_use),
    insurance_recharge = COALESCE(p_insurance_recharge, insurance_recharge),
    deposit_amount     = COALESCE(p_deposit_amount, deposit_amount),
    annual_rent        = COALESCE(p_annual_rent, annual_rent),
    updated_at = now()
  WHERE lease_id = p_lease_id;

  IF p_vat_treatment IS NOT NULL THEN
    UPDATE charge_profiles
    SET vat_treatment = p_vat_treatment::vat_treatment_enum,
        vat_deferred = (p_vat_treatment = 'VAT_DEFERRED'),
        updated_at = now()
    WHERE lease_id = p_lease_id AND charge_type = 'RENT';
  END IF;

  -- Keep unbilled (DRAFT) rent invoices in sync with the lease: rent always derives
  -- from annual_rent (or an active incentive's billed amount), VAT from the treatment.
  -- Only DRAFT charges are touched — issued/approved/paid invoices are never altered here.
  IF p_annual_rent IS NOT NULL OR p_vat_treatment IS NOT NULL THEN
    UPDATE charge_records cr
    SET net_amount = sub.net,
        vat_amount = sub.vat,
        updated_at = now()
    FROM (
      SELECT c.charge_id,
        COALESCE(inc.billed_amount_monthly, ROUND(l.annual_rent/12.0, 2)) AS net,
        CASE WHEN cp.vat_treatment = 'STANDARD'
             THEN ROUND(COALESCE(inc.billed_amount_monthly, ROUND(l.annual_rent/12.0, 2)) * 0.20, 2)
             ELSE 0 END AS vat
      FROM charge_records c
      JOIN leases l ON l.lease_id = c.lease_id
      LEFT JOIN charge_profiles cp ON cp.lease_id = l.lease_id AND cp.charge_type = 'RENT'
      LEFT JOIN rent_incentives inc ON inc.lease_id = l.lease_id AND inc.active IS TRUE
         AND (inc.incentive_start_date IS NULL OR inc.incentive_start_date <= c.period_start)
         AND (inc.incentive_end_date   IS NULL OR inc.incentive_end_date   >= c.period_start)
      WHERE c.lease_id = p_lease_id AND c.charge_type = 'RENT' AND c.status = 'DRAFT'
    ) sub
    WHERE cr.charge_id = sub.charge_id;
  END IF;

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_tenant, p_lease_id, 'SYSTEM', 'Lease terms updated' ||
          CASE WHEN p_annual_rent IS NOT NULL THEN ' (headline rent set; draft rent invoices refreshed)' ELSE '' END ||
          CASE WHEN p_vat_treatment IS NOT NULL THEN ' (VAT: ' || p_vat_treatment || ')' ELSE '' END ||
          CASE WHEN p_insurance_recharge IS NOT NULL THEN ' (insurance recharge: ' ||
            CASE WHEN p_insurance_recharge THEN 'yes' ELSE 'no' END || ')' ELSE '' END);
  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_update_meter_reading(p_read_id uuid, p_read_date date, p_reading numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_read    RECORD;
  v_meter   RECORD;
  v_prev    RECORD;
  v_charge  RECORD;
  v_rate    RECORD;
  v_consumption NUMERIC;
  v_net     NUMERIC(12,2);
  v_vat     NUMERIC(12,2);
BEGIN
  SELECT read_id, meter_id, read_date, reading_value, charge_id, consumption_kwh
  INTO v_read FROM meter_reads WHERE read_id = p_read_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reading not found'; END IF;

  IF EXISTS (SELECT 1 FROM meter_reads WHERE meter_id = v_read.meter_id AND read_date > v_read.read_date) THEN
    RAISE EXCEPTION 'Only the most recent reading on a meter can be edited';
  END IF;

  IF v_read.charge_id IS NOT NULL THEN
    SELECT charge_id, status INTO v_charge FROM charge_records WHERE charge_id = v_read.charge_id;
    IF FOUND AND v_charge.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'This reading''s electric charge has already been approved/issued and cannot be edited. Credit or void it first.';
    END IF;
  END IF;

  SELECT m.meter_id, m.unit_id, m.asset_id, m.meter_reference, m.active, u.block_id, u.unit_reference,
         COALESCE(m.dial_count, 6) AS dial_count
  INTO v_meter
  FROM meters m JOIN units u ON u.unit_id = m.unit_id
  WHERE m.meter_id = v_read.meter_id;

  IF p_reading < 0 OR p_reading >= power(10, v_meter.dial_count)::numeric THEN
    RAISE EXCEPTION 'Reading % is outside this meter''s range (0 to %). Enter the actual meter reading.',
      p_reading, (power(10, v_meter.dial_count)::numeric - 1);
  END IF;

  SELECT read_date, reading_value INTO v_prev
  FROM meter_reads
  WHERE meter_id = v_read.meter_id AND read_id <> p_read_id AND read_date < p_read_date
  ORDER BY read_date DESC LIMIT 1;

  IF EXISTS (SELECT 1 FROM meter_reads WHERE meter_id = v_read.meter_id AND read_id <> p_read_id AND read_date = p_read_date) THEN
    RAISE EXCEPTION 'Another reading already exists for this meter on %', p_read_date;
  END IF;

  IF v_prev.reading_value IS NULL THEN
    UPDATE meter_reads
    SET read_date = p_read_date, reading_value = p_reading, consumption_kwh = NULL
    WHERE read_id = p_read_id;
    RETURN jsonb_build_object('read_id', p_read_id, 'billed', false, 'consumption', NULL, 'opening', true);
  END IF;

  IF p_reading < v_prev.reading_value THEN
    v_consumption := (power(10, v_meter.dial_count)::numeric - v_prev.reading_value) + p_reading;
  ELSE
    v_consumption := p_reading - v_prev.reading_value;
  END IF;

  UPDATE meter_reads
  SET read_date = p_read_date, reading_value = p_reading, consumption_kwh = v_consumption
  WHERE read_id = p_read_id;

  IF v_read.charge_id IS NULL THEN
    RETURN jsonb_build_object('read_id', p_read_id, 'billed', false, 'consumption', v_consumption);
  END IF;

  SELECT rate_per_kwh INTO v_rate
  FROM utility_rates
  WHERE asset_id = v_meter.asset_id
    AND utility_type = 'ELECTRICITY'
    AND effective_from <= p_read_date
    AND (effective_to IS NULL OR effective_to >= p_read_date)
    AND (block_id = v_meter.block_id OR block_id IS NULL)
  ORDER BY (block_id IS NOT NULL) DESC, effective_from DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No electricity rate configured for this asset/block as at %', p_read_date;
  END IF;

  v_net := ROUND(v_consumption * v_rate.rate_per_kwh, 2);
  v_vat := ROUND(v_net * 0.20, 2);

  UPDATE charge_records SET
    period_start = v_prev.read_date,
    period_end   = p_read_date,
    due_date     = p_read_date,
    net_amount   = v_net,
    vat_amount   = v_vat,
    charge_label = 'Electric - ' || TRIM(TO_CHAR(p_read_date, 'FMMonth YYYY')),
    notes        = 'Meter ' || v_meter.meter_reference || ': ' || v_prev.reading_value || ' -> ' || p_reading ||
                   ' (' || v_consumption || ' kWh @ ' || v_rate.rate_per_kwh || ') [corrected]',
    updated_at   = now()
  WHERE charge_id = v_read.charge_id;

  RETURN jsonb_build_object(
    'read_id', p_read_id, 'billed', true, 'charge_id', v_read.charge_id,
    'consumption', v_consumption, 'rate', v_rate.rate_per_kwh,
    'net', v_net, 'vat', v_vat, 'gross', v_net + v_vat
  );
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_update_rent_incentive(p_incentive_id uuid, p_type text, p_headline_annual numeric, p_billed_monthly numeric, p_start_date date, p_end_date date DEFAULT NULL::date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_discount numeric; v_lease uuid; v_tenant uuid;
BEGIN
  IF p_type NOT IN ('RENT_FREE','FIXED_DISCOUNT','STEPPED_RENT') THEN
    RAISE EXCEPTION 'Invalid incentive type'; END IF;
  SELECT lease_id INTO v_lease FROM rent_incentives WHERE incentive_id = p_incentive_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Arrangement not found'; END IF;
  SELECT tenant_id INTO v_tenant FROM leases WHERE lease_id = v_lease;

  v_discount := CASE
    WHEN p_type = 'RENT_FREE' THEN ROUND(COALESCE(p_headline_annual,0)/12.0, 2)
    WHEN p_headline_annual IS NOT NULL AND p_billed_monthly IS NOT NULL
      THEN ROUND(p_headline_annual/12.0 - p_billed_monthly, 2)
    ELSE NULL END;

  UPDATE rent_incentives SET
    incentive_type          = p_type::incentive_type_enum,
    headline_amount_annual  = p_headline_annual,
    discount_amount_monthly = v_discount,
    billed_amount_monthly   = CASE WHEN p_type = 'RENT_FREE' THEN 0 ELSE p_billed_monthly END,
    effective_amount_annual = CASE WHEN p_type = 'RENT_FREE' THEN 0 ELSE ROUND(COALESCE(p_billed_monthly,0)*12, 2) END,
    incentive_start_date    = p_start_date,
    incentive_end_date      = p_end_date
  WHERE incentive_id = p_incentive_id;

  INSERT INTO tenant_activity (tenant_id, lease_id, activity_type, summary)
  VALUES (v_tenant, v_lease, 'SYSTEM', 'Rent arrangement edited');
  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_update_tenant_details(p_tenant_id uuid, p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_accounts_name text DEFAULT NULL::text, p_accounts_email text DEFAULT NULL::text, p_accounts_phone text DEFAULT NULL::text, p_emergency_name text DEFAULT NULL::text, p_emergency_phone text DEFAULT NULL::text, p_director_name text DEFAULT NULL::text, p_company_number text DEFAULT NULL::text, p_correspondence_address text DEFAULT NULL::text, p_preferred_delivery_method text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE tenants SET
    primary_contact_name   = COALESCE(p_contact_name, primary_contact_name),
    primary_contact_email  = COALESCE(p_contact_email, primary_contact_email),
    primary_contact_phone  = COALESCE(p_contact_phone, primary_contact_phone),
    accounts_contact_name  = COALESCE(p_accounts_name, accounts_contact_name),
    accounts_contact_email = COALESCE(p_accounts_email, accounts_contact_email),
    accounts_contact_phone = COALESCE(p_accounts_phone, accounts_contact_phone),
    emergency_contact_name = COALESCE(p_emergency_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(p_emergency_phone, emergency_contact_phone),
    director_name          = COALESCE(p_director_name, director_name),
    company_number         = COALESCE(p_company_number, company_number),
    correspondence_address = COALESCE(p_correspondence_address, correspondence_address),
    preferred_delivery_method = COALESCE(p_preferred_delivery_method, preferred_delivery_method),
    updated_at = now()
  WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;
  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_update_tenant_details(p_tenant_id uuid, p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_accounts_name text DEFAULT NULL::text, p_accounts_email text DEFAULT NULL::text, p_accounts_phone text DEFAULT NULL::text, p_emergency_name text DEFAULT NULL::text, p_emergency_phone text DEFAULT NULL::text, p_director_name text DEFAULT NULL::text, p_company_number text DEFAULT NULL::text, p_correspondence_address text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE tenants SET
    primary_contact_name   = COALESCE(p_contact_name, primary_contact_name),
    primary_contact_email  = COALESCE(p_contact_email, primary_contact_email),
    primary_contact_phone  = COALESCE(p_contact_phone, primary_contact_phone),
    accounts_contact_name  = COALESCE(p_accounts_name, accounts_contact_name),
    accounts_contact_email = COALESCE(p_accounts_email, accounts_contact_email),
    accounts_contact_phone = COALESCE(p_accounts_phone, accounts_contact_phone),
    emergency_contact_name = COALESCE(p_emergency_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(p_emergency_phone, emergency_contact_phone),
    director_name          = COALESCE(p_director_name, director_name),
    company_number         = COALESCE(p_company_number, company_number),
    correspondence_address = COALESCE(p_correspondence_address, correspondence_address),
    updated_at = now()
  WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;
  RETURN true;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_upsert_supplier_bill(p_asset_id uuid, p_block_name text, p_bill_month date, p_supplier_name text DEFAULT NULL::text, p_period_start date DEFAULT NULL::date, p_period_end date DEFAULT NULL::date, p_kwh numeric DEFAULT NULL::numeric, p_net numeric DEFAULT NULL::numeric, p_vat numeric DEFAULT NULL::numeric, p_gross numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO supplier_bills (asset_id, block_name, bill_month, supplier_name, period_start, period_end,
                              consumption_kwh, net_amount, vat_amount, gross_amount, notes)
  VALUES (p_asset_id, p_block_name, date_trunc('month', p_bill_month)::date, p_supplier_name, p_period_start, p_period_end,
          p_kwh, p_net, p_vat, p_gross, p_notes)
  ON CONFLICT (asset_id, block_name, bill_month) DO UPDATE SET
    supplier_name = COALESCE(EXCLUDED.supplier_name, supplier_bills.supplier_name),
    period_start = COALESCE(EXCLUDED.period_start, supplier_bills.period_start),
    period_end = COALESCE(EXCLUDED.period_end, supplier_bills.period_end),
    consumption_kwh = COALESCE(EXCLUDED.consumption_kwh, supplier_bills.consumption_kwh),
    net_amount = COALESCE(EXCLUDED.net_amount, supplier_bills.net_amount),
    vat_amount = COALESCE(EXCLUDED.vat_amount, supplier_bills.vat_amount),
    gross_amount = COALESCE(EXCLUDED.gross_amount, supplier_bills.gross_amount),
    notes = COALESCE(EXCLUDED.notes, supplier_bills.notes),
    updated_at = now()
  RETURNING bill_id INTO v_id;
  RETURN v_id;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_add_budget(p_site uuid, p_year integer, p_cc text, p_code text, p_category text, p_annual_net numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
declare v_cc uuid; v_id uuid;
begin
  select cc_id into v_cc from mgmt.cost_centre where site_id=p_site and code=p_cc;
  insert into mgmt.budget(site_id,fin_year,cc_id,code,category,annual_net,vat_rate,basis)
  values(p_site,p_year,v_cc,nullif(p_code,''),p_category,coalesce(p_annual_net,0),0.20,'VARIABLE')
  on conflict (site_id,fin_year,cc_id,code,category) do update set annual_net=excluded.annual_net
  returning budget_id into v_id; return v_id;
end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_add_budget(p_year integer, p_cc text, p_code text, p_category text, p_annual_net numeric)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
  select public.mgmt_add_budget((select site_id from mgmt.site where site_name='Southgate Retail Park'),p_year,p_cc,p_code,p_category,p_annual_net);
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_add_category(p_site uuid, p_cc text, p_code text, p_account_group text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
declare v_id uuid; v_sort int;
begin
  select coalesce(max(sort),0)+1 into v_sort from mgmt.category where site_id=p_site and cc=p_cc;
  insert into mgmt.category(site_id,cc,code,account_group,sort) values(p_site,p_cc,nullif(p_code,''),p_account_group,v_sort) returning cat_id into v_id;
  return v_id;
end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_add_category(p_cc text, p_code text, p_account_group text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
  select public.mgmt_add_category((select site_id from mgmt.site where site_name='Southgate Retail Park'),p_cc,p_code,p_account_group);
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_add_entry(p_site uuid, p_cc text, p_date date, p_code text, p_category text, p_account_group text, p_description text, p_supplier text, p_payor text, p_method text, p_invoice_no text, p_is_invoice boolean, p_net numeric, p_vat numeric, p_source text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
declare v_cc uuid; v_id uuid;
begin
  select cc_id into v_cc from mgmt.cost_centre where site_id=p_site and code=p_cc;
  if v_cc is null then raise exception 'Unknown cost centre % for this property', p_cc; end if;
  insert into mgmt.ledger(site_id,cc_id,entry_date,source_type,code,category,account_group,description,supplier,payor,method,invoice_no,is_invoice,net,vat,vat_rate,recoverable)
  values (p_site,v_cc,p_date,coalesce(nullif(p_source,''),'CASH_REPORT'),nullif(p_code,''),p_category,p_account_group,p_description,p_supplier,
          coalesce(nullif(p_payor,''),'Noblestone Partners'),coalesce(nullif(p_method,''),'CASH'),nullif(p_invoice_no,''),coalesce(p_is_invoice,false),
          coalesce(p_net,0),coalesce(p_vat,0),case when coalesce(p_vat,0)>0 then 0.20 else 0 end, p_cc<>'INTERNAL')
  returning ledger_id into v_id;
  return v_id;
end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_add_entry(p_cc text, p_date date, p_code text, p_category text, p_account_group text, p_description text, p_supplier text, p_payor text, p_method text, p_invoice_no text, p_is_invoice boolean, p_net numeric, p_vat numeric, p_source text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
  select public.mgmt_add_entry((select site_id from mgmt.site where site_name='Southgate Retail Park'),
    p_cc,p_date,p_code,p_category,p_account_group,p_description,p_supplier,p_payor,p_method,p_invoice_no,p_is_invoice,p_net,p_vat,p_source);
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_add_recurring(p_year integer, p_cc text, p_code text, p_account_group text, p_category text, p_supplier text, p_net numeric, p_vat numeric, p_invoice_prefix text, p_desc_template text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
  select public.mgmt_add_recurring((select site_id from mgmt.site where site_name='Southgate Retail Park'),p_year,p_cc,p_code,p_account_group,p_category,p_supplier,p_net,p_vat,p_invoice_prefix,p_desc_template);
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_add_recurring(p_site uuid, p_year integer, p_cc text, p_code text, p_account_group text, p_category text, p_supplier text, p_net numeric, p_vat numeric, p_invoice_prefix text, p_desc_template text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
declare v_id uuid; v_sort int;
begin
  select coalesce(max(sort),0)+1 into v_sort from mgmt.recurring where site_id=p_site and fin_year=p_year;
  insert into mgmt.recurring(site_id,fin_year,cc,code,account_group,category,supplier,payor,method,net,vat,invoice_prefix,desc_template,active,sort)
  values(p_site,p_year,p_cc,nullif(p_code,''),p_account_group,p_category,p_supplier,'Noblestone Partners','TRANSFER',coalesce(p_net,0),coalesce(p_vat,0),p_invoice_prefix,p_desc_template,true,v_sort)
  returning rec_id into v_id; return v_id;
end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_book_recurring(p_year integer DEFAULT NULL::integer, p_month integer DEFAULT NULL::integer, p_site uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
declare v_cc uuid; t record; v_y int; v_m int; v_date date; v_pm date; v_inv text; v_desc text; v_n int:=0;
begin
  v_y:=coalesce(p_year, extract(year from now())::int); v_m:=coalesce(p_month, extract(month from now())::int);
  v_pm:=make_date(v_y,v_m,1); v_date:=(v_pm + interval '1 month - 1 day')::date;
  for t in select * from mgmt.recurring where active and fin_year=v_y and (p_site is null or site_id=p_site) loop
    if exists(select 1 from mgmt.ledger l join mgmt.cost_centre cc on cc.cc_id=l.cc_id
              where cc.site_id=t.site_id and cc.code=t.cc and date_trunc('month',l.entry_date)=v_pm and l.account_group=t.account_group and abs(l.net-t.net)<0.01) then continue; end if;
    select cc_id into v_cc from mgmt.cost_centre where site_id=t.site_id and code=t.cc;
    if v_cc is null then continue; end if;
    v_inv:=coalesce(t.invoice_prefix,'')||to_char(v_date,'YY')||to_char(v_date,'MM');
    v_desc:=trim(replace(coalesce(t.desc_template,''),'{month}',trim(to_char(v_date,'Month'))));
    insert into mgmt.ledger(site_id,cc_id,entry_date,source_type,code,category,account_group,description,supplier,payor,method,invoice_no,is_invoice,net,vat,vat_rate,recoverable)
      values(t.site_id,v_cc,v_date,'INVOICE',nullif(t.code,''),t.category,t.account_group,v_desc,t.supplier,coalesce(t.payor,'Noblestone Partners'),coalesce(t.method,'TRANSFER'),v_inv,true,t.net,t.vat,case when t.vat>0 then 0.20 else 0 end,(t.cc<>'INTERNAL'));
    v_n:=v_n+1;
  end loop; return v_n;
end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_delete_entry(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
begin delete from mgmt.ledger where ledger_id=p_id; end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_set_lock(p_site uuid, p_year integer, p_full boolean, p_setup boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
begin
  insert into mgmt.year_lock(site_id,fin_year,locked,setup_locked,locked_at) values(p_site,p_year,coalesce(p_full,false),coalesce(p_setup,false),now())
  on conflict(site_id,fin_year) do update set locked=coalesce(p_full,false), setup_locked=coalesce(p_setup,false), locked_at=now();
end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_set_lock(p_year integer, p_full boolean, p_setup boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
  select public.mgmt_set_lock((select site_id from mgmt.site where site_name='Southgate Retail Park'),p_year,p_full,p_setup);
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_set_year_lock(p_site uuid, p_year integer, p_locked boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
begin
  insert into mgmt.year_lock(site_id,fin_year,locked,locked_at) values(p_site,p_year,p_locked,now())
  on conflict(site_id,fin_year) do update set locked=excluded.locked, locked_at=now();
end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_setup_year(p_site uuid, p_from integer, p_to integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
declare v_b int; v_r int; v_t int;
begin
  insert into mgmt.budget(site_id,fin_year,cc_id,code,category,annual_net,vat_rate,basis,notes)
    select site_id,p_to,cc_id,code,category,annual_net,vat_rate,basis,notes from mgmt.budget b where b.fin_year=p_from and b.site_id=p_site
      and not exists(select 1 from mgmt.budget x where x.site_id=p_site and x.fin_year=p_to and x.cc_id=b.cc_id and coalesce(x.code,'')=coalesce(b.code,'') and x.category=b.category);
  get diagnostics v_b=row_count;
  insert into mgmt.recovery(site_id,fin_year,cc_id,code,category,monthly_net,vat_rate,basis,notes)
    select site_id,p_to,cc_id,code,category,monthly_net,vat_rate,basis,notes from mgmt.recovery r where r.fin_year=p_from and r.site_id=p_site
      and not exists(select 1 from mgmt.recovery x where x.site_id=p_site and x.fin_year=p_to and x.cc_id=r.cc_id and x.category=r.category);
  get diagnostics v_r=row_count;
  insert into mgmt.recurring(site_id,fin_year,cc,code,account_group,category,supplier,payor,method,net,vat,invoice_prefix,desc_template,active,sort)
    select site_id,p_to,cc,code,account_group,category,supplier,payor,method,net,vat,invoice_prefix,desc_template,active,sort from mgmt.recurring r where r.fin_year=p_from and r.site_id=p_site
      and not exists(select 1 from mgmt.recurring x where x.site_id=p_site and x.fin_year=p_to and x.cc=r.cc and x.account_group=r.account_group);
  get diagnostics v_t=row_count;
  return 'Year '||p_to||' set up: '||v_b||' budget, '||v_r||' income, '||v_t||' recurring lines copied from '||p_from||'. Now review &amp; adjust the agreed figures.';
end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_setup_year(p_from integer, p_to integer)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
  select public.mgmt_setup_year((select site_id from mgmt.site where site_name='Southgate Retail Park'),p_from,p_to);
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_update_budget(p_id uuid, p_annual_net numeric, p_vat_rate numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
begin update mgmt.budget set annual_net=coalesce(p_annual_net,annual_net), vat_rate=coalesce(p_vat_rate,vat_rate) where budget_id=p_id; end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_update_category(p_id uuid, p_account_group text, p_code text, p_active boolean, p_sort integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
begin update mgmt.category set account_group=coalesce(p_account_group,account_group),code=p_code,active=coalesce(p_active,active),sort=coalesce(p_sort,sort) where cat_id=p_id; end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_update_entry(p_id uuid, p_cc text, p_date date, p_code text, p_category text, p_account_group text, p_description text, p_supplier text, p_payor text, p_method text, p_invoice_no text, p_net numeric, p_vat numeric, p_markup numeric DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
declare v_site uuid; v_cc uuid;
begin
  select site_id into v_site from mgmt.ledger where ledger_id=p_id;
  if v_site is null then raise exception 'Ledger row not found'; end if;
  select cc_id into v_cc from mgmt.cost_centre where site_id=v_site and code=p_cc;
  if v_cc is null then raise exception 'Unknown cost centre % for this property', p_cc; end if;
  update mgmt.ledger set cc_id=v_cc, entry_date=p_date, code=nullif(p_code,''), category=p_category, account_group=p_account_group,
    description=p_description, supplier=p_supplier, payor=coalesce(nullif(p_payor,''),'Noblestone Partners'),
    method=coalesce(nullif(p_method,''),'CASH'), invoice_no=nullif(p_invoice_no,''),
    net=coalesce(p_net,0), vat=coalesce(p_vat,0), vat_rate=case when coalesce(p_vat,0)>0 then 0.20 else 0 end,
    markup=case when p_cc='SITE' then coalesce(p_markup,0) else 0 end, recoverable=(p_cc<>'INTERNAL')
  where ledger_id=p_id;
end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_update_recovery(p_id uuid, p_monthly_net numeric, p_vat_rate numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
begin update mgmt.recovery set monthly_net=coalesce(p_monthly_net,monthly_net), vat_rate=coalesce(p_vat_rate,vat_rate) where recovery_id=p_id; end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.mgmt_update_recurring(p_id uuid, p_net numeric, p_vat numeric, p_supplier text, p_desc_template text, p_invoice_prefix text, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mgmt', 'public'
AS $function$
begin update mgmt.recurring set net=p_net,vat=p_vat,supplier=p_supplier,desc_template=coalesce(p_desc_template,desc_template),invoice_prefix=coalesce(p_invoice_prefix,invoice_prefix),active=coalesce(p_active,true) where rec_id=p_id; end$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$


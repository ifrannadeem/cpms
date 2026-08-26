-- Capture the tenant's correspondence address when a unit is let.
--
-- fn_let_unit had no address parameter, so a tenancy created through Let Unit(s) always
-- produced a tenant with a NULL correspondence_address. The invoice renderer falls back
-- to the premises address in that case (lib/invoice-data.ts), so the invoice still looks
-- complete and nothing flags the gap — it was only noticed when Al-Hurraya's new
-- Southgate tenancies turned out to have no address at all (2026-08-26).
--
-- The address is enforced as a required field on the form rather than here, so applying
-- this migration cannot break tenancy creation in the currently deployed build (which
-- calls without the parameter). The old 16-argument signature is dropped so the two do
-- not become ambiguous; calls that omit the new argument still resolve, because it
-- carries a default.
--
-- Note this function still creates a NEW tenant every time. Letting a further unit to an
-- existing tenant therefore produces a duplicate tenant record, which is how Al-Hurraya
-- came to have three. Attaching to an existing tenant is a separate change.

DROP FUNCTION IF EXISTS public.fn_let_unit(
  uuid[], text, date, numeric, text, text, text, text, text, text, date, text, text, numeric, boolean, text
);

CREATE OR REPLACE FUNCTION public.fn_let_unit(
  p_unit_ids uuid[],
  p_legal_name text,
  p_commencement date,
  p_annual_rent numeric,
  p_trading_name text DEFAULT NULL::text,
  p_tenant_type text DEFAULT 'COMPANY'::text,
  p_contact_name text DEFAULT NULL::text,
  p_contact_email text DEFAULT NULL::text,
  p_contact_phone text DEFAULT NULL::text,
  p_lease_type text DEFAULT 'FIXED_TERM'::text,
  p_expiry date DEFAULT NULL::date,
  p_billing_frequency text DEFAULT 'MONTHLY'::text,
  p_vat_treatment text DEFAULT 'EXEMPT'::text,
  p_deposit numeric DEFAULT NULL::numeric,
  p_electric_recharge boolean DEFAULT false,
  p_lease_reference text DEFAULT NULL::text,
  p_correspondence_address text DEFAULT NULL::text
)
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
                       correspondence_address, tenant_state, active)
  VALUES (v_tenant_id, TRIM(p_legal_name), NULLIF(TRIM(COALESCE(p_trading_name,'')),''),
          p_tenant_type::tenant_type_enum,
          COALESCE(NULLIF(TRIM(COALESCE(p_contact_name,'')),''), TRIM(p_legal_name)),
          p_contact_email, p_contact_phone,
          NULLIF(TRIM(COALESCE(p_correspondence_address,'')),''),
          'STABLE', true);

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
$function$;

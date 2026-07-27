-- Tenant names were not editable anywhere in the app: legal_name was read-only on the
-- tenancy page and trading_name was not shown at all. Since invoices now address the
-- LEGAL entity (owner decision 2026-07-26 - a brand name must never appear on a demand
-- for payment) while screens keep the recognisable trading name, both need to be
-- maintainable by the operator.
--
-- fn_update_tenant_details gains p_legal_name and p_trading_name (appended, so existing
-- callers are unaffected):
--   - legal_name is NOT NULL, so a blank is ignored rather than wiping it.
--   - trading_name is optional: pass an empty string to clear it (the screen then falls
--     back to the legal name), or NULL to leave it unchanged.

DROP FUNCTION IF EXISTS public.fn_update_tenant_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.fn_update_tenant_details(
  p_tenant_id uuid,
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_accounts_name text DEFAULT NULL,
  p_accounts_email text DEFAULT NULL,
  p_accounts_phone text DEFAULT NULL,
  p_emergency_name text DEFAULT NULL,
  p_emergency_phone text DEFAULT NULL,
  p_director_name text DEFAULT NULL,
  p_company_number text DEFAULT NULL,
  p_correspondence_address text DEFAULT NULL,
  p_preferred_delivery_method text DEFAULT NULL,
  p_invoice_email_to text DEFAULT NULL,
  p_legal_name text DEFAULT NULL,
  p_trading_name text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE tenants SET
    -- Never blank the legal name: it is the party liable and appears on every invoice.
    legal_name                = COALESCE(NULLIF(TRIM(COALESCE(p_legal_name, '')), ''), legal_name),
    trading_name              = CASE WHEN p_trading_name IS NULL THEN trading_name
                                     ELSE NULLIF(TRIM(p_trading_name), '') END,
    primary_contact_name      = COALESCE(p_contact_name, primary_contact_name),
    primary_contact_email     = COALESCE(p_contact_email, primary_contact_email),
    primary_contact_phone     = COALESCE(p_contact_phone, primary_contact_phone),
    accounts_contact_name     = COALESCE(p_accounts_name, accounts_contact_name),
    accounts_contact_email    = COALESCE(p_accounts_email, accounts_contact_email),
    accounts_contact_phone    = COALESCE(p_accounts_phone, accounts_contact_phone),
    emergency_contact_name    = COALESCE(p_emergency_name, emergency_contact_name),
    emergency_contact_phone   = COALESCE(p_emergency_phone, emergency_contact_phone),
    director_name             = COALESCE(p_director_name, director_name),
    company_number            = COALESCE(p_company_number, company_number),
    correspondence_address    = COALESCE(p_correspondence_address, correspondence_address),
    preferred_delivery_method = COALESCE(p_preferred_delivery_method, preferred_delivery_method),
    invoice_email_to          = COALESCE(p_invoice_email_to, invoice_email_to),
    updated_at = now()
  WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_update_tenant_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_tenant_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;

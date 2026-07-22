-- Tenants can have more than one invoice recipient (owner adds several people so
-- anyone can pick it up). tenants.invoice_email_to holds a comma/semicolon-separated
-- list, used for dispatch in preference to the accounts/primary contact email.
-- fn_update_tenant_details gains a trailing p_invoice_email_to param (defaulted, so
-- nothing else needs to change).

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS invoice_email_to text;

COMMENT ON COLUMN public.tenants.invoice_email_to IS
  'One or more invoice-recipient emails, comma/semicolon separated. Used for email dispatch in preference to accounts/primary contact.';

DROP FUNCTION IF EXISTS public.fn_update_tenant_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text);

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
  p_invoice_email_to text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE tenants SET
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
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_tenant_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;

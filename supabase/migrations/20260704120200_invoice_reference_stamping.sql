-- Invoice references were computed at PDF-render time from current unit references,
-- so re-downloading an old invoice after a unit renumbering could produce a different
-- reference on the same legal document (council review item 4.2).
--
-- This adds a nullable charge_records.invoice_reference. The app stamps it the first
-- time an invoice PDF is rendered for an ISSUED/OVERDUE/PART_PAID/PAID charge and
-- renders from the stored value from then on. Additive and backward compatible:
-- the currently deployed app simply ignores the column.
--
-- v_charge_ledger is recreated with the new column appended (CREATE OR REPLACE VIEW
-- permits appending columns at the end only). Definition otherwise identical to the
-- live version captured 2026-07-04 in supabase/schema/views.sql.

ALTER TABLE public.charge_records ADD COLUMN IF NOT EXISTS invoice_reference text;

COMMENT ON COLUMN public.charge_records.invoice_reference IS
  'Stamped on first render of an issued invoice; immutable thereafter. NULL for drafts.';

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
    t.preferred_delivery_method,
    cr.invoice_reference
   FROM charge_records cr
     JOIN leases l ON l.lease_id = cr.lease_id
     JOIN tenants t ON t.tenant_id = cr.tenant_id
     JOIN units u ON u.unit_id = cr.unit_id
     JOIN assets a ON a.asset_id = cr.asset_id;

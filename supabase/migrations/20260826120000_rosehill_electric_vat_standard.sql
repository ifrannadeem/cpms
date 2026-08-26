-- Rosehill electric: correct the VAT treatment on the tenant profiles to STANDARD.
--
-- Policy confirmed by the owner 2026-08-26: electricity is recharged at cost with the VAT
-- the landlord was itself charged, the utility gives no concession, so every tenant pays
-- 20% on electric — Rosehill included. That is what the system actually does: all 78
-- electric charges ever raised carry 20%.
--
-- The ELECTRIC charge profiles disagreed with that on 22 Rosehill tenancies — 18
-- VAT_DEFERRED, 3 EXEMPT, 1 OUTSIDE_SCOPE. Inert, because nothing reads vat_treatment on
-- an ELECTRIC row (see 20260826110000 for the trail), so no invoice, figure or VAT return
-- was ever wrong. Corrected so the record stops contradicting the money, and so the field
-- is safe if it is ever wired into the electric path — at which point 22 leases would
-- otherwise have started billing incorrectly.
--
-- DELIBERATELY EXCLUDED: RBC-A-21, 2i Investments Limited. That is the owner's own
-- occupation of its own unit, not a tenant paying a recharge. It has no active meter and
-- has never been charged for electricity, and OUTSIDE_SCOPE describes that correctly.
-- Marking it STANDARD would trade an old inaccuracy for a new one. Left as it is.
--
-- 21 rows expected.

UPDATE charge_profiles cp
SET vat_treatment = 'STANDARD'::vat_treatment_enum,
    updated_at    = now()
FROM leases l
JOIN assets a  ON a.asset_id  = l.asset_id
JOIN tenants t ON t.tenant_id = l.tenant_id
WHERE l.lease_id = cp.lease_id
  AND a.asset_reference = 'ASSET-001'
  AND cp.charge_type = 'ELECTRIC'
  AND cp.vat_treatment <> 'STANDARD'::vat_treatment_enum
  AND t.legal_name <> '2i Investments Limited';

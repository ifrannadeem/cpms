-- Suite 2.4 electric: EXEMPT -> STANDARD.
--
-- Electricity is recharged at cost with the VAT the landlord was itself charged; there
-- is no concession to pass on, so every electric recharge is standard-rated (owner
-- confirmation 2026-08-26). Suite 2.4's electric charge profile said EXEMPT, which was
-- simply wrong.
--
-- Nothing visible changes. The electric charge is raised at a hardcoded 20% by
-- fn_record_meter_reading, the electric page of the invoice prints "VAT 20%" from its own
-- layout, the lease screen reads the RENT profile, and the VAT report sums
-- charge_records.vat_amount. So charge_profiles.vat_treatment on an ELECTRIC row is not
-- read by anything: every electric invoice, figure and report was already correct. This
-- corrects the record so it stops contradicting the money, and so the field is safe if it
-- is ever wired into the electric path.
--
-- 22 further ELECTRIC profiles at Rosehill are wrong in the same inert way (18
-- VAT_DEFERRED, 3 EXEMPT, 1 OUTSIDE_SCOPE). Left alone pending a separate decision.

UPDATE charge_profiles cp
SET vat_treatment = 'STANDARD'::vat_treatment_enum,
    updated_at    = now()
FROM leases l
WHERE l.lease_id = cp.lease_id
  AND l.lease_reference = 'SGP-I-2-4'
  AND cp.charge_type = 'ELECTRIC'
  AND cp.vat_treatment <> 'STANDARD'::vat_treatment_enum;

-- Rosehill invoices carry a contact address.
--
-- 2i Investments Limited, the issuing entity for Rosehill, had no email and no phone on
-- record, so its letterhead printed no way of contacting the landlord at all (the fields
-- are conditional — see lib/invoice-pdf.tsx). Southgate's letterhead has shown
-- noblestoneltd@gmail.com and a phone number throughout.
--
-- That gap mattered from the moment Rosehill's invoices started arriving by email: a
-- tenant would receive a demand for payment from 2iinvestmentsltd@gmail.com with nothing
-- printed on the invoice to reply to. Owner instruction 2026-08-26: put the same address
-- on the letterhead, matching the mailbox Rosehill now sends from.
--
-- No phone number was given, so that line stays absent rather than guessed at.
--
-- This changes how every Rosehill invoice renders, including those already issued: the
-- letterhead is drawn live from issuing_entities rather than stamped onto the charge.
-- Adding a contact address to a reprint is a gain, not a discrepancy — no figure,
-- reference or party changes.

UPDATE issuing_entities e
SET email      = '2iinvestmentsltd@gmail.com',
    updated_at = now()
FROM assets a
WHERE a.asset_id = e.asset_id
  AND a.asset_reference = 'ASSET-001'
  AND e.email IS DISTINCT FROM '2iinvestmentsltd@gmail.com';

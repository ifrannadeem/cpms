-- One-off data fix: Al-Hurraya is one tenant, not three.
--
-- Al-Hurraya holds four Southgate suites: 2.4 (since February 2026) and 2.5, 2.6 and
-- 2.7 (from 15 August 2026). Because fn_let_unit creates a fresh tenant record for every
-- letting, the two new tenancies produced two further tenant records, so the same charity
-- existed three times over:
--
--   9a306c9c…  "Al Hurraya"  Suite 2.4        4 charges, 3 payments, correspondence address
--   255812aa…  "Al-Hurraya"  Suites 2.5/2.6   1 draft, no address
--   a30d6340…  "Al-Hurraya"  Suite 2.7        1 draft, no address
--
-- Consequences that made this worth fixing rather than living with: rent and electric
-- would go out as three separate emails instead of one, the four suites' electric could
-- never combine into a single total the way Giara's does (dispatch groups by tenant),
-- arrears and payment history were split three ways, and two of the three records had no
-- correspondence address, so their invoices addressed the tenant at the premises.
--
-- Owner instruction 2026-08-26: one tenant, spelled "Al-Hurraya", same correspondence
-- address on all four suites, correction to apply from this point forward. The record
-- carrying the Suite 2.4 history survives so nothing is lost; the other two are merged
-- into it and removed. The name correction means a reprint of a Suite 2.4 invoice now
-- reads "Al-Hurraya" rather than "Al Hurraya" — agreed as a typo correction, no figure
-- and no invoice reference changes.
--
-- Written to be safe if run twice: the survivor is identified from the Suite 2.4 lease,
-- and once the others are gone the merge simply finds nothing to do.

DO $$
DECLARE
  v_keep   UUID;
  v_merged INT := 0;
  v_addr   TEXT := 'St James Place House, 7 Castle Quay, 1st Floor Suite, Nottingham, NG7 1FW';
BEGIN
  -- Survivor: the tenant on the Suite 2.4 lease, which holds the payment history.
  SELECT l.tenant_id INTO v_keep
  FROM leases l
  WHERE l.lease_reference = 'SGP-I-2-4';

  IF v_keep IS NULL THEN
    RAISE EXCEPTION 'Suite 2.4 lease SGP-I-2-4 not found — cannot identify the Al-Hurraya record to keep';
  END IF;

  -- Everything else answering to the same name, restricted to Southgate so an
  -- unrelated tenant of a similar name elsewhere could never be swept in.
  CREATE TEMP TABLE _al_hurraya_dupes ON COMMIT DROP AS
  SELECT DISTINCT t.tenant_id
  FROM tenants t
  JOIN leases l ON l.tenant_id = t.tenant_id
  JOIN assets a ON a.asset_id = l.asset_id
  WHERE t.tenant_id <> v_keep
    AND a.asset_reference = 'ASSET-003'
    AND REPLACE(LOWER(TRIM(t.legal_name)), ' ', '-') = 'al-hurraya';

  SELECT COUNT(*) INTO v_merged FROM _al_hurraya_dupes;

  IF v_merged > 0 THEN
    UPDATE arrears_actions    SET tenant_id = v_keep WHERE tenant_id IN (SELECT tenant_id FROM _al_hurraya_dupes);
    UPDATE charge_records     SET tenant_id = v_keep WHERE tenant_id IN (SELECT tenant_id FROM _al_hurraya_dupes);
    UPDATE documents          SET tenant_id = v_keep WHERE tenant_id IN (SELECT tenant_id FROM _al_hurraya_dupes);
    UPDATE maintenance_events SET tenant_id = v_keep WHERE tenant_id IN (SELECT tenant_id FROM _al_hurraya_dupes);
    UPDATE payments           SET tenant_id = v_keep WHERE tenant_id IN (SELECT tenant_id FROM _al_hurraya_dupes);
    UPDATE significant_events SET tenant_id = v_keep WHERE tenant_id IN (SELECT tenant_id FROM _al_hurraya_dupes);
    UPDATE tenant_activity    SET tenant_id = v_keep WHERE tenant_id IN (SELECT tenant_id FROM _al_hurraya_dupes);
    UPDATE leases             SET tenant_id = v_keep WHERE tenant_id IN (SELECT tenant_id FROM _al_hurraya_dupes);

    DELETE FROM tenants WHERE tenant_id IN (SELECT tenant_id FROM _al_hurraya_dupes);
  END IF;

  -- Correct the spelling and make sure the surviving record is complete.
  UPDATE tenants
  SET legal_name             = 'Al-Hurraya',
      trading_name           = NULL,           -- no separate brand; screens fall back to the legal name
      correspondence_address = COALESCE(NULLIF(TRIM(COALESCE(correspondence_address, '')), ''), v_addr),
      invoice_email_to       = COALESCE(NULLIF(TRIM(COALESCE(invoice_email_to, '')), ''), 'finance@al-hurraya.org'),
      updated_at             = now()
  WHERE tenant_id = v_keep;

  INSERT INTO tenant_activity (tenant_id, activity_type, summary)
  VALUES (v_keep, 'SYSTEM',
          'Tenant records merged: ' || v_merged || ' duplicate record(s) for Al-Hurraya combined into this one '
          || '(Suites 2.4, 2.5, 2.6 and 2.7). Legal name corrected to Al-Hurraya.');

  RAISE NOTICE 'Al-Hurraya merge: kept %, merged % duplicate record(s)', v_keep, v_merged;
END $$;

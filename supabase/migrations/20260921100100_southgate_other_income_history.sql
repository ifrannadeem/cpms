-- One-off data load: Southgate's other income from the owner's spreadsheet
-- ("Southgate - Other Income.xlsx", supplied 2026-09-21), receipts only.
--
-- Sources:
--   EV chargers          Swarco Smart Charging Ltd         recurring, 20% VAT
--   Unit 7 parking bays  Maximus UK Services Ltd           recurring, 20% VAT
--   Car park             Vehicle Control Services Limited  recurring, no VAT
--   Other (one-off)                                         not recurring, no VAT
-- Suite 2.9 parking is to be added by the owner once its records are to hand.
--
-- Loaded through fn_record_other_income so history is split exactly as new entries will be.
-- Points confirmed with the owner:
--   - Swarco pay each quarter in advance; each GBP 1,590 is one payment spread across its
--     three months. Recorded as one payment each, so the quarter's VAT is exactly 265.00.
--     The spreadsheet shows 441.67 net in all three months (1,325.01 a quarter); here the
--     odd penny falls on the third month (441.66) so the quarter nets to 1,325.00.
--   - Maximus have NOT paid for March 2026. The spreadsheet counts it as received (its
--     total of 1,536 includes it) but the line is marked "Still to pay"; it is not loaded.
--     Nothing received from May onwards either.
--   - Vehicle Control Services' GBP 160 for August arrived on 25 August with July's
--     payment, which was overpaid by mistake and carried to August. The balance for August
--     is expected shortly and will be recorded when it arrives.
--   - December 2025 car park income (paid January 2026) is included; everything the owner
--     supplied is loaded, although rent in Opera starts in July 2026.
--
-- Totals loaded: Swarco 4,770.00; Maximus 1,152.00; Vehicle Control Services 6,932.00.
-- Idempotent: does nothing if Southgate already has other income recorded.

DO $$
DECLARE
  v_asset uuid;
  v_ev    uuid;
  v_max   uuid;
  v_vcs   uuid;
BEGIN
  SELECT asset_id INTO v_asset FROM assets WHERE asset_reference = 'ASSET-003';
  IF v_asset IS NULL THEN RAISE EXCEPTION 'Southgate (ASSET-003) not found'; END IF;

  IF EXISTS (SELECT 1 FROM other_income_sources WHERE asset_id = v_asset) THEN
    RAISE NOTICE 'Southgate other income already set up; nothing loaded.';
    RETURN;
  END IF;

  v_ev  := fn_add_other_income_source(v_asset, 'EV chargers', 'Swarco Smart Charging Ltd', true, 'STANDARD',
             'Quarterly in advance, GBP 1,590 inc. VAT, spread across the three months.');
  v_max := fn_add_other_income_source(v_asset, 'Unit 7 parking bays', 'Maximus UK Services Ltd', true, 'STANDARD',
             'Monthly, GBP 384 inc. VAT.');
  v_vcs := fn_add_other_income_source(v_asset, 'Car park', 'Vehicle Control Services Limited', true, 'NONE',
             'Monthly, variable. Paid in the following month for the month before.');
  PERFORM fn_add_other_income_source(v_asset, 'Other (one-off)', NULL, false, 'NONE',
             'Anything received once or occasionally. Describe it on each entry.');

  -- Swarco: one payment per quarter, spread over three months.
  PERFORM fn_record_other_income(v_ev, '2026-02-05', 1590, 'STANDARD', NULL, '2026-01-01', 3, 'Q1 2026 (R26Q1-EV Charges)', 'Quarter 25 Dec 2025 to 24 Mar 2026');
  PERFORM fn_record_other_income(v_ev, '2026-05-06', 1590, 'STANDARD', NULL, '2026-04-01', 3, 'Q2 2026 (R25Q2-EV Charges)', 'Quarter 25 Mar to 23 Jun 2026');
  PERFORM fn_record_other_income(v_ev, '2026-08-05', 1590, 'STANDARD', NULL, '2026-07-01', 3, 'Q3 2026 (R25Q3-EV Charges)', 'Quarter 24 Jun to 28 Sep 2026');

  -- Maximus: monthly. March 2026 not paid; nothing received from May.
  PERFORM fn_record_other_income(v_max, '2026-01-23', 384, 'STANDARD', NULL, '2026-01-01', 1, 'January 2026 (R2601-Parking)', NULL);
  PERFORM fn_record_other_income(v_max, '2026-03-27', 384, 'STANDARD', NULL, '2026-02-01', 1, 'February 2026 (R2602-Parking)', NULL);
  PERFORM fn_record_other_income(v_max, '2026-05-01', 384, 'STANDARD', NULL, '2026-04-01', 1, 'April 2026 (R2604-Parking)', NULL);

  -- Vehicle Control Services: monthly, no VAT, paid the following month.
  PERFORM fn_record_other_income(v_vcs, '2026-01-31',  844, 'NONE', NULL, '2025-12-01', 1, 'December 2025 (R2601-PCN)', NULL);
  PERFORM fn_record_other_income(v_vcs, '2026-02-20',  880, 'NONE', NULL, '2026-01-01', 1, 'January 2026 (R2602-PCN)', NULL);
  PERFORM fn_record_other_income(v_vcs, '2026-03-20',  896, 'NONE', NULL, '2026-02-01', 1, 'February 2026 (R2603-PCN)', NULL);
  PERFORM fn_record_other_income(v_vcs, '2026-04-23', 1080, 'NONE', NULL, '2026-03-01', 1, 'March 2026 (R2604-PCN)', NULL);
  PERFORM fn_record_other_income(v_vcs, '2026-05-28', 1016, 'NONE', NULL, '2026-04-01', 1, 'April 2026 (R2605-PCN)', NULL);
  PERFORM fn_record_other_income(v_vcs, '2026-07-01',  680, 'NONE', NULL, '2026-05-01', 1, 'May 2026 (R2606-PCN)', NULL);
  PERFORM fn_record_other_income(v_vcs, '2026-07-22',  768, 'NONE', NULL, '2026-06-01', 1, 'June 2026', NULL);
  PERFORM fn_record_other_income(v_vcs, '2026-08-25',  608, 'NONE', NULL, '2026-07-01', 1, 'July 2026', NULL);
  PERFORM fn_record_other_income(v_vcs, '2026-08-25',  160, 'NONE', NULL, '2026-08-01', 1, 'August 2026 (part)',
    'Overpaid by mistake with July''s payment on 25 Aug; carried to August. Balance of GBP 784 for August expected.');
END $$;

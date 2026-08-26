-- Clear on a meter reading always failed where the reading had raised a charge.
--
-- fn_delete_meter_reading deleted the charge_record first and the meter_reads row second.
-- meter_reads.charge_id still pointed at the charge at that moment, so Postgres refused:
--
--   update or delete on table "charge_records" violates foreign key constraint
--   "meter_reads_charge_id_fkey" on table "meter_reads"
--
-- So Clear worked only on a reading that had raised no charge (a billing-off meter), and
-- was impossible on exactly the readings an operator most needs to undo — a billed one
-- entered against the wrong date. Reported 2026-08-26 after a bulk upload landed on
-- today's date instead of the intended cycle date, with no way to reverse it.
--
-- The fix is the order: remove the reading first, which releases the reference, then the
-- charge. Both still happen in one statement's transaction, so a failure leaves neither
-- deleted. Every guard is unchanged — still only the most recent reading on a meter, and
-- still refused outright once the charge has been approved or issued.

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
  END IF;

  -- Reading first: it holds the foreign key to the charge, so deleting the charge while
  -- this row still references it is what the constraint was rejecting.
  DELETE FROM meter_reads WHERE read_id = p_read_id;

  IF v_read.charge_id IS NOT NULL THEN
    DELETE FROM charge_records WHERE charge_id = v_read.charge_id;
  END IF;

  RETURN true;
END;
$function$;

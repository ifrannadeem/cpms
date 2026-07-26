-- Meter administration (backlog: "Add a meter to a unit"), needed for the Southgate
-- Suite 2.5 / 2.6 sub-meter split and for Rosehill units 6, 8 and 9 later.
--
-- Until now meters could only be switched on/off, reset, or have their dial count
-- changed. Registering a NEW meter, or renaming/reassigning one, required SQL.
--
-- 1) meters.serial_number — the code printed on the physical meter (optional).
--    Proves which unit a reading came from when a meter is queried or replaced.
-- 2) fn_add_meter — registers a meter and its BASELINE reading in one step. The
--    baseline records the starting value and raises no charge; charges begin from
--    the next reading (fn_record_meter_reading requires a prior read, which is why
--    a meter could not previously be introduced from the UI).
-- 3) fn_update_meter — rename, set/clear the serial, and reassign to another unit
--    (keeping the meter's reading history intact).

ALTER TABLE public.meters ADD COLUMN IF NOT EXISTS serial_number text;

COMMENT ON COLUMN public.meters.serial_number IS
  'Serial/MPAN-style code printed on the physical meter. Optional; identifies the device across replacements.';

-- ---------------------------------------------------------------
-- fn_add_meter
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_add_meter(
  p_unit_id          uuid,
  p_meter_reference  text,
  p_baseline_reading numeric,
  p_baseline_date    date DEFAULT CURRENT_DATE,
  p_dial_count       smallint DEFAULT 6,
  p_serial_number    text DEFAULT NULL,
  p_meter_type       text DEFAULT 'ELECTRICITY'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_unit     RECORD;
  v_meter_id uuid := gen_random_uuid();
  v_read_id  uuid;
  v_ref      text := TRIM(COALESCE(p_meter_reference, ''));
BEGIN
  IF v_ref = '' THEN
    RAISE EXCEPTION 'A meter reference is required';
  END IF;
  IF p_dial_count IS NULL OR p_dial_count < 4 OR p_dial_count > 8 THEN
    RAISE EXCEPTION 'Dial count must be between 4 and 8';
  END IF;
  IF p_baseline_reading IS NULL OR p_baseline_reading < 0
     OR p_baseline_reading >= power(10, p_dial_count)::numeric THEN
    RAISE EXCEPTION 'Baseline reading must be between 0 and %', (power(10, p_dial_count)::numeric - 1);
  END IF;
  IF p_baseline_date IS NULL THEN
    RAISE EXCEPTION 'A baseline reading date is required';
  END IF;

  SELECT u.unit_id, u.asset_id, u.block_id, u.unit_reference
  INTO v_unit FROM units u WHERE u.unit_id = p_unit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unit not found'; END IF;

  IF EXISTS (SELECT 1 FROM meters m WHERE m.unit_id = p_unit_id AND m.active = TRUE) THEN
    RAISE EXCEPTION 'Unit % already has an active meter. Switch it off or reassign it first.', v_unit.unit_reference;
  END IF;
  IF EXISTS (SELECT 1 FROM meters m WHERE m.meter_reference = v_ref) THEN
    RAISE EXCEPTION 'Meter reference % is already in use', v_ref;
  END IF;

  INSERT INTO meters (meter_id, unit_id, asset_id, block_id, meter_reference, meter_type,
                      serial_number, dial_count, installation_date, active)
  VALUES (v_meter_id, p_unit_id, v_unit.asset_id, v_unit.block_id, v_ref,
          p_meter_type::meter_type_enum, NULLIF(TRIM(COALESCE(p_serial_number, '')), ''),
          p_dial_count, p_baseline_date, TRUE);

  -- Baseline: start value only. consumption_kwh and charge_id stay NULL so no
  -- charge is raised; billing starts from the next reading.
  INSERT INTO meter_reads (meter_id, read_date, reading_value, read_type, entered_by,
                           consumption_kwh, charge_id, notes)
  VALUES (v_meter_id, p_baseline_date, p_baseline_reading, 'ACTUAL', 'UI',
          NULL, NULL, 'Baseline reading on registration - no charge raised')
  RETURNING read_id INTO v_read_id;

  RETURN jsonb_build_object(
    'meter_id', v_meter_id, 'read_id', v_read_id,
    'meter_reference', v_ref, 'unit_reference', v_unit.unit_reference);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_add_meter(uuid, text, numeric, date, smallint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_add_meter(uuid, text, numeric, date, smallint, text, text) TO authenticated;

-- ---------------------------------------------------------------
-- fn_update_meter — rename / serial / reassign to another unit
-- NULL parameter = leave unchanged. Empty-string serial clears it.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_update_meter(
  p_meter_id        uuid,
  p_meter_reference text DEFAULT NULL,
  p_serial_number   text DEFAULT NULL,
  p_unit_id         uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meter RECORD;
  v_unit  RECORD;
  v_ref   text := NULLIF(TRIM(COALESCE(p_meter_reference, '')), '');
BEGIN
  SELECT * INTO v_meter FROM meters WHERE meter_id = p_meter_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meter not found'; END IF;

  IF v_ref IS NOT NULL AND v_ref <> v_meter.meter_reference THEN
    IF EXISTS (SELECT 1 FROM meters m WHERE m.meter_reference = v_ref AND m.meter_id <> p_meter_id) THEN
      RAISE EXCEPTION 'Meter reference % is already in use', v_ref;
    END IF;
    UPDATE meters SET meter_reference = v_ref, updated_at = now() WHERE meter_id = p_meter_id;
  END IF;

  IF p_serial_number IS NOT NULL THEN
    UPDATE meters SET serial_number = NULLIF(TRIM(p_serial_number), ''), updated_at = now()
    WHERE meter_id = p_meter_id;
  END IF;

  IF p_unit_id IS NOT NULL AND p_unit_id <> v_meter.unit_id THEN
    SELECT u.unit_id, u.asset_id, u.block_id, u.unit_reference
    INTO v_unit FROM units u WHERE u.unit_id = p_unit_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target unit not found'; END IF;
    IF v_unit.asset_id <> v_meter.asset_id THEN
      RAISE EXCEPTION 'A meter can only be reassigned within the same asset';
    END IF;
    IF v_meter.active AND EXISTS (
      SELECT 1 FROM meters m WHERE m.unit_id = p_unit_id AND m.active = TRUE AND m.meter_id <> p_meter_id
    ) THEN
      RAISE EXCEPTION 'Unit % already has an active meter', v_unit.unit_reference;
    END IF;
    -- Reading history follows the meter, so the unit inherits it.
    UPDATE meters SET unit_id = p_unit_id, block_id = v_unit.block_id, updated_at = now()
    WHERE meter_id = p_meter_id;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_update_meter(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_meter(uuid, text, text, uuid) TO authenticated;

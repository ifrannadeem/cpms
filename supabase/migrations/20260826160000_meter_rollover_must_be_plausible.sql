-- A reading that goes down is refused unless the meter has genuinely rolled over.
--
-- Both fn_record_meter_reading and fn_update_meter_reading treated ANY reading lower than
-- the previous one as the meter having wrapped past its maximum, and silently computed
-- (10^dials - previous) + new. There was no test of whether a wrap was remotely possible.
--
-- Unit 12A at Rosehill, August 2026: July read 1026.54, August read 1026.00 — the decimal
-- was missed. The rule produced (1,000,000 - 1026.54) + 1026.00 = 999,999.46 kWh and a
-- draft invoice for GBP 305,999.83 against Verta Care. That meter uses 1 to 9 kWh a month;
-- at that rate it would take tens of thousands of years to roll over. Nothing on screen
-- distinguished it from a normal entry except the figure itself, and one Approve-then-Issue
-- would have sent it.
--
-- A real rollover means the meter passed its maximum and restarted near zero: the previous
-- reading must sit near the top of the dial range and the new one near the bottom. That is
-- now required before a wrap is inferred. Anything else raises, naming both readings and
-- both dates, so the operator sees a missed decimal for what it is.
--
-- Owner instruction 2026-08-26. It also settles the backlog item "warn when a new reading
-- is lower than the previous (possible meter reset)", and fits the standing preference
-- that rollover is handled deliberately rather than guessed at.
--
-- Equal readings are unaffected: they are not a decrease, and still bill zero consumption.

CREATE OR REPLACE FUNCTION public.fn_record_meter_reading(p_meter_id uuid, p_read_date date, p_reading numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meter       RECORD;
  v_prev        RECORD;
  v_rate        RECORD;
  v_lease       RECORD;
  v_consumption NUMERIC;
  v_max         NUMERIC;
  v_net         NUMERIC(12,2);
  v_vat         NUMERIC(12,2);
  v_charge_id   UUID;
  v_read_id     UUID;
BEGIN
  SELECT m.meter_id, m.unit_id, m.asset_id, m.meter_reference, m.active, u.block_id, u.unit_reference,
         COALESCE(m.dial_count, 6) AS dial_count
  INTO v_meter
  FROM meters m JOIN units u ON u.unit_id = m.unit_id
  WHERE m.meter_id = p_meter_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meter not found'; END IF;

  v_max := power(10, v_meter.dial_count)::numeric;

  IF p_reading < 0 OR p_reading >= v_max THEN
    RAISE EXCEPTION 'Reading % is outside this meter''s range (0 to %). Enter the actual meter reading.',
      p_reading, (v_max - 1);
  END IF;

  IF EXISTS (SELECT 1 FROM meter_reads WHERE meter_id = p_meter_id AND read_date = p_read_date) THEN
    RAISE EXCEPTION 'A reading already exists for this meter on %', p_read_date;
  END IF;

  SELECT read_date, reading_value INTO v_prev
  FROM meter_reads
  WHERE meter_id = p_meter_id AND read_date < p_read_date
  ORDER BY read_date DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No opening read exists before % for this meter. Enter an opening read first.', p_read_date;
  END IF;

  IF p_reading < v_prev.reading_value THEN
    -- Only infer a rollover where one is actually possible.
    IF v_prev.reading_value >= v_max * 0.9 AND p_reading <= v_max * 0.1 THEN
      v_consumption := (v_max - v_prev.reading_value) + p_reading;
    ELSE
      RAISE EXCEPTION
        'Reading % on % is lower than the previous reading of % on %. A meter reading cannot go down. Check the reading — a missed decimal is the usual cause. If the meter has genuinely been reset or replaced, register it under Manage Meters instead.',
        p_reading, TO_CHAR(p_read_date, 'DD Mon YYYY'),
        v_prev.reading_value, TO_CHAR(v_prev.read_date, 'DD Mon YYYY');
    END IF;
  ELSE
    v_consumption := p_reading - v_prev.reading_value;
  END IF;

  IF NOT v_meter.active THEN
    INSERT INTO meter_reads (meter_id, read_date, reading_value, read_type, entered_by, consumption_kwh, notes)
    VALUES (p_meter_id, p_read_date, p_reading, 'ACTUAL', 'UI', v_consumption, 'Billing off - usage tracked, no charge raised')
    RETURNING read_id INTO v_read_id;
    RETURN jsonb_build_object('read_id', v_read_id, 'billed', false, 'consumption', v_consumption);
  END IF;

  SELECT rate_per_kwh INTO v_rate
  FROM utility_rates
  WHERE asset_id = v_meter.asset_id
    AND utility_type = 'ELECTRICITY'
    AND effective_from <= p_read_date
    AND (effective_to IS NULL OR effective_to >= p_read_date)
    AND (block_id = v_meter.block_id OR block_id IS NULL)
  ORDER BY (block_id IS NOT NULL) DESC, effective_from DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No electricity rate configured for this asset/block as at %', p_read_date;
  END IF;

  SELECT l.lease_id, l.tenant_id INTO v_lease
  FROM lease_units lu
  JOIN leases l ON l.lease_id = lu.lease_id
  WHERE lu.unit_id = v_meter.unit_id AND l.lease_state <> 'TERMINATED'
  ORDER BY l.commencement_date DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active lease found for unit % — turn billing off for this meter to track usage without invoicing', v_meter.unit_reference;
  END IF;

  v_net := ROUND(v_consumption * v_rate.rate_per_kwh, 2);
  v_vat := ROUND(v_net * 0.20, 2);

  INSERT INTO charge_records
    (lease_id, unit_id, tenant_id, asset_id, charge_type, charge_label,
     period_start, period_end, net_amount, vat_amount, vat_rate, due_date,
     status, generated_by, notes)
  VALUES
    (v_lease.lease_id, v_meter.unit_id, v_lease.tenant_id, v_meter.asset_id, 'ELECTRIC',
     'Electric - ' || TRIM(TO_CHAR(p_read_date, 'FMMonth YYYY')),
     v_prev.read_date, p_read_date, v_net, v_vat, 20, p_read_date,
     'DRAFT', 'MANUAL',
     'Meter ' || v_meter.meter_reference || ': ' || v_prev.reading_value || ' -> ' || p_reading ||
     ' (' || v_consumption || ' kWh @ ' || v_rate.rate_per_kwh || ')')
  RETURNING charge_id INTO v_charge_id;

  INSERT INTO meter_reads (meter_id, read_date, reading_value, read_type, entered_by, consumption_kwh, charge_id)
  VALUES (p_meter_id, p_read_date, p_reading, 'ACTUAL', 'UI', v_consumption, v_charge_id)
  RETURNING read_id INTO v_read_id;

  RETURN jsonb_build_object(
    'read_id', v_read_id, 'billed', true, 'charge_id', v_charge_id,
    'consumption', v_consumption, 'rate', v_rate.rate_per_kwh,
    'net', v_net, 'vat', v_vat, 'gross', v_net + v_vat
  );
END;
$function$;

-- Edit must apply the same rule, or a correction could reintroduce what entry now refuses.
CREATE OR REPLACE FUNCTION public.fn_update_meter_reading(p_read_id uuid, p_read_date date, p_reading numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_read    RECORD;
  v_meter   RECORD;
  v_prev    RECORD;
  v_charge  RECORD;
  v_rate    RECORD;
  v_consumption NUMERIC;
  v_max     NUMERIC;
  v_net     NUMERIC(12,2);
  v_vat     NUMERIC(12,2);
BEGIN
  SELECT read_id, meter_id, read_date, reading_value, charge_id, consumption_kwh
  INTO v_read FROM meter_reads WHERE read_id = p_read_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reading not found'; END IF;

  IF EXISTS (SELECT 1 FROM meter_reads WHERE meter_id = v_read.meter_id AND read_date > v_read.read_date) THEN
    RAISE EXCEPTION 'Only the most recent reading on a meter can be edited';
  END IF;

  IF v_read.charge_id IS NOT NULL THEN
    SELECT charge_id, status INTO v_charge FROM charge_records WHERE charge_id = v_read.charge_id;
    IF FOUND AND v_charge.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'This reading''s electric charge has already been approved/issued and cannot be edited. Credit or void it first.';
    END IF;
  END IF;

  SELECT m.meter_id, m.unit_id, m.asset_id, m.meter_reference, m.active, u.block_id, u.unit_reference,
         COALESCE(m.dial_count, 6) AS dial_count
  INTO v_meter
  FROM meters m JOIN units u ON u.unit_id = m.unit_id
  WHERE m.meter_id = v_read.meter_id;

  v_max := power(10, v_meter.dial_count)::numeric;

  IF p_reading < 0 OR p_reading >= v_max THEN
    RAISE EXCEPTION 'Reading % is outside this meter''s range (0 to %). Enter the actual meter reading.',
      p_reading, (v_max - 1);
  END IF;

  SELECT read_date, reading_value INTO v_prev
  FROM meter_reads
  WHERE meter_id = v_read.meter_id AND read_id <> p_read_id AND read_date < p_read_date
  ORDER BY read_date DESC LIMIT 1;

  IF EXISTS (SELECT 1 FROM meter_reads WHERE meter_id = v_read.meter_id AND read_id <> p_read_id AND read_date = p_read_date) THEN
    RAISE EXCEPTION 'Another reading already exists for this meter on %', p_read_date;
  END IF;

  IF v_prev.reading_value IS NULL THEN
    UPDATE meter_reads
    SET read_date = p_read_date, reading_value = p_reading, consumption_kwh = NULL
    WHERE read_id = p_read_id;
    RETURN jsonb_build_object('read_id', p_read_id, 'billed', false, 'consumption', NULL, 'opening', true);
  END IF;

  IF p_reading < v_prev.reading_value THEN
    IF v_prev.reading_value >= v_max * 0.9 AND p_reading <= v_max * 0.1 THEN
      v_consumption := (v_max - v_prev.reading_value) + p_reading;
    ELSE
      RAISE EXCEPTION
        'Reading % on % is lower than the previous reading of % on %. A meter reading cannot go down. Check the reading — a missed decimal is the usual cause. If the meter has genuinely been reset or replaced, register it under Manage Meters instead.',
        p_reading, TO_CHAR(p_read_date, 'DD Mon YYYY'),
        v_prev.reading_value, TO_CHAR(v_prev.read_date, 'DD Mon YYYY');
    END IF;
  ELSE
    v_consumption := p_reading - v_prev.reading_value;
  END IF;

  UPDATE meter_reads
  SET read_date = p_read_date, reading_value = p_reading, consumption_kwh = v_consumption
  WHERE read_id = p_read_id;

  IF v_read.charge_id IS NULL THEN
    RETURN jsonb_build_object('read_id', p_read_id, 'billed', false, 'consumption', v_consumption);
  END IF;

  SELECT rate_per_kwh INTO v_rate
  FROM utility_rates
  WHERE asset_id = v_meter.asset_id
    AND utility_type = 'ELECTRICITY'
    AND effective_from <= p_read_date
    AND (effective_to IS NULL OR effective_to >= p_read_date)
    AND (block_id = v_meter.block_id OR block_id IS NULL)
  ORDER BY (block_id IS NOT NULL) DESC, effective_from DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No electricity rate configured for this asset/block as at %', p_read_date;
  END IF;

  v_net := ROUND(v_consumption * v_rate.rate_per_kwh, 2);
  v_vat := ROUND(v_net * 0.20, 2);

  UPDATE charge_records SET
    period_start = v_prev.read_date,
    period_end   = p_read_date,
    due_date     = p_read_date,
    net_amount   = v_net,
    vat_amount   = v_vat,
    charge_label = 'Electric - ' || TRIM(TO_CHAR(p_read_date, 'FMMonth YYYY')),
    notes        = 'Meter ' || v_meter.meter_reference || ': ' || v_prev.reading_value || ' -> ' || p_reading ||
                   ' (' || v_consumption || ' kWh @ ' || v_rate.rate_per_kwh || ') [corrected]',
    updated_at   = now()
  WHERE charge_id = v_read.charge_id;

  RETURN jsonb_build_object(
    'read_id', p_read_id, 'billed', true, 'charge_id', v_read.charge_id,
    'consumption', v_consumption, 'rate', v_rate.rate_per_kwh,
    'net', v_net, 'vat', v_vat, 'gross', v_net + v_vat
  );
END;
$function$;

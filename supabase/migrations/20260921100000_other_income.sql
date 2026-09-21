-- Other income: money a property earns outside its leases.
--
-- Southgate earns from EV chargers (Swarco, quarterly in advance), parking bays let to
-- Maximus UK Services, car park enforcement via Vehicle Control Services, parking for
-- Suite 2.9, and the occasional one-off. None of it is rent, none of it has a lease, and
-- until now it lived in a separate spreadsheet (owner request 2026-09-21).
--
-- Deliberately a separate ledger. Nothing here is read by the lease, invoicing, payment,
-- arrears, collection or dispatch code, and nothing in those tables is touched, so the
-- rent system that works is left exactly as it is. The only consumers are the Other
-- Income tab and the two reports.
--
-- Scope for this version, on instruction: RECEIPTS ONLY. What arrived, when, and which
-- month it belongs to. No invoicing and no tracking of what is owed; revisit if needed.
--
-- Two rules carried over from how the owner already works:
--   - Every receipt belongs to a month, regardless of when it was paid. Swarco pay a
--     quarter in advance; the payment is spread evenly across the three months so the
--     income does not spike. period_month records the month, received_date the day.
--   - Sources are open-ended. Recurring ones (EV, parking, car park) show a line in every
--     monthly report, nil when nothing came in, so a missed payment is visible. One-off
--     income sits under a non-recurring source and appears only when received.

-- ---------------------------------------------------------------
-- 1. Sources
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.other_income_sources (
  source_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    uuid NOT NULL REFERENCES public.assets(asset_id),
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  payer       text,
  -- Recurring sources get a line in every monthly report, nil when nothing arrived.
  recurring   boolean NOT NULL DEFAULT true,
  -- What the entry form pre-selects. Each receipt can still be split differently.
  vat_default text NOT NULL DEFAULT 'NONE' CHECK (vat_default IN ('NONE', 'STANDARD')),
  active      boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, name)
);

-- ---------------------------------------------------------------
-- 2. Receipts
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.other_income_receipts (
  receipt_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      uuid NOT NULL REFERENCES public.other_income_sources(source_id),
  asset_id       uuid NOT NULL REFERENCES public.assets(asset_id),
  -- One payment spread across several months shares a group, so it can be seen and
  -- removed as the single payment it was.
  receipt_group  uuid NOT NULL,
  period_month   date NOT NULL CHECK (period_month = date_trunc('month', period_month)::date),
  received_date  date NOT NULL,
  net_amount     numeric(12,2) NOT NULL CHECK (net_amount >= 0),
  vat_amount     numeric(12,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  gross_amount   numeric(12,2) GENERATED ALWAYS AS (net_amount + vat_amount) STORED,
  description    text,
  comments       text,
  -- Removal is a soft delete with a reason, kept for audit, as with cancelled invoices.
  removed        boolean NOT NULL DEFAULT false,
  removed_reason text,
  removed_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (net_amount + vat_amount > 0),
  CHECK (NOT removed OR (removed_reason IS NOT NULL AND length(trim(removed_reason)) > 0))
);

CREATE INDEX IF NOT EXISTS other_income_receipts_asset_month
  ON public.other_income_receipts (asset_id, period_month) WHERE NOT removed;
CREATE INDEX IF NOT EXISTS other_income_receipts_source
  ON public.other_income_receipts (source_id);
CREATE INDEX IF NOT EXISTS other_income_receipts_group
  ON public.other_income_receipts (receipt_group);

-- Same access model as every other CPMS table: authenticated only, no anon.
ALTER TABLE public.other_income_sources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.other_income_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS other_income_sources_authenticated ON public.other_income_sources;
CREATE POLICY other_income_sources_authenticated ON public.other_income_sources
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS other_income_receipts_authenticated ON public.other_income_receipts;
CREATE POLICY other_income_receipts_authenticated ON public.other_income_receipts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON public.other_income_sources, public.other_income_receipts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.other_income_sources, public.other_income_receipts TO authenticated;

-- ---------------------------------------------------------------
-- 3. View for the tab and the reports
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_other_income AS
 SELECT r.receipt_id,
    r.receipt_group,
    r.asset_id,
    r.source_id,
    s.name        AS source_name,
    s.payer,
    s.recurring,
    r.period_month,
    r.received_date,
    r.net_amount,
    r.vat_amount,
    r.gross_amount,
    r.description,
    r.comments,
    r.removed,
    r.removed_reason,
    r.removed_at,
    r.created_at
   FROM public.other_income_receipts r
     JOIN public.other_income_sources s ON s.source_id = r.source_id;

ALTER VIEW public.v_other_income SET (security_invoker = true);
REVOKE ALL ON public.v_other_income FROM anon;
GRANT SELECT ON public.v_other_income TO authenticated;

-- ---------------------------------------------------------------
-- 4. Functions
-- ---------------------------------------------------------------

-- Add a source. A name is unique within its property.
CREATE OR REPLACE FUNCTION public.fn_add_other_income_source(
  p_asset_id uuid,
  p_name text,
  p_payer text DEFAULT NULL,
  p_recurring boolean DEFAULT true,
  p_vat_default text DEFAULT 'NONE',
  p_notes text DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' THEN RAISE EXCEPTION 'A source needs a name'; END IF;
  IF p_vat_default NOT IN ('NONE', 'STANDARD') THEN RAISE EXCEPTION 'VAT default must be NONE or STANDARD'; END IF;
  IF NOT EXISTS (SELECT 1 FROM assets WHERE asset_id = p_asset_id) THEN RAISE EXCEPTION 'Property not found'; END IF;
  IF EXISTS (SELECT 1 FROM other_income_sources WHERE asset_id = p_asset_id AND lower(name) = lower(trim(p_name))) THEN
    RAISE EXCEPTION 'This property already has a source called "%"', trim(p_name);
  END IF;

  INSERT INTO other_income_sources (asset_id, name, payer, recurring, vat_default, notes)
  VALUES (p_asset_id, trim(p_name), NULLIF(trim(COALESCE(p_payer, '')), ''),
          COALESCE(p_recurring, true), p_vat_default, NULLIF(trim(COALESCE(p_notes, '')), ''))
  RETURNING source_id INTO v_id;
  RETURN v_id;
END;
$function$;

-- Edit a source. Retiring one (active = false) keeps its history but stops it being
-- offered for new receipts and stops its nil line appearing in future reports.
CREATE OR REPLACE FUNCTION public.fn_update_other_income_source(
  p_source_id uuid,
  p_name text,
  p_payer text,
  p_recurring boolean,
  p_vat_default text,
  p_active boolean,
  p_notes text
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset uuid;
BEGIN
  SELECT asset_id INTO v_asset FROM other_income_sources WHERE source_id = p_source_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source not found'; END IF;
  IF p_name IS NULL OR trim(p_name) = '' THEN RAISE EXCEPTION 'A source needs a name'; END IF;
  IF p_vat_default NOT IN ('NONE', 'STANDARD') THEN RAISE EXCEPTION 'VAT default must be NONE or STANDARD'; END IF;
  IF EXISTS (SELECT 1 FROM other_income_sources
             WHERE asset_id = v_asset AND source_id <> p_source_id AND lower(name) = lower(trim(p_name))) THEN
    RAISE EXCEPTION 'This property already has a source called "%"', trim(p_name);
  END IF;

  UPDATE other_income_sources
  SET name = trim(p_name),
      payer = NULLIF(trim(COALESCE(p_payer, '')), ''),
      recurring = COALESCE(p_recurring, recurring),
      vat_default = p_vat_default,
      active = COALESCE(p_active, active),
      notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
      updated_at = now()
  WHERE source_id = p_source_id;
  RETURN true;
END;
$function$;

-- Record money received.
--
-- p_gross is the total actually received. VAT:
--   NONE      no VAT; net = gross
--   STANDARD  gross includes 20% VAT; net = gross / 1.2, VAT the remainder
--   MANUAL    p_vat_amount is the VAT within the gross, as typed
--
-- p_months > 1 spreads one payment evenly across consecutive months from p_first_month
-- (Swarco's quarter in advance becomes three equal months). The amount received is split
-- first, then the VAT, each with any odd penny on the last month; net is what is left on
-- each line. So every month carries the same amount (GBP 1,590 becomes 530 x 3, as the
-- owner records it) and the VAT across the quarter is exactly the VAT charged (265.00),
-- not three rounded thirds of it.
CREATE OR REPLACE FUNCTION public.fn_record_other_income(
  p_source_id uuid,
  p_received_date date,
  p_gross numeric,
  p_vat_mode text DEFAULT NULL,
  p_vat_amount numeric DEFAULT NULL,
  p_first_month date DEFAULT NULL,
  p_months integer DEFAULT 1,
  p_description text DEFAULT NULL,
  p_comments text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_src       RECORD;
  v_mode      text;
  v_gross     numeric(12,2);
  v_net       numeric(12,2);
  v_vat       numeric(12,2);
  v_months    integer := COALESCE(p_months, 1);
  v_first     date;
  v_group     uuid := gen_random_uuid();
  v_gross_each numeric(12,2);
  v_vat_each   numeric(12,2);
  v_line_gross numeric(12,2);
  v_line_net   numeric(12,2);
  v_line_vat   numeric(12,2);
  i           integer;
  v_lines     jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_src FROM other_income_sources WHERE source_id = p_source_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source not found'; END IF;
  IF NOT v_src.active THEN RAISE EXCEPTION 'The source "%" has been retired. Reactivate it to record against it.', v_src.name; END IF;
  IF p_received_date IS NULL THEN RAISE EXCEPTION 'Enter the date the money was received'; END IF;
  IF p_gross IS NULL OR p_gross <= 0 THEN RAISE EXCEPTION 'Enter the amount received'; END IF;
  IF v_months < 1 OR v_months > 12 THEN RAISE EXCEPTION 'A payment can cover between 1 and 12 months'; END IF;

  v_mode  := COALESCE(p_vat_mode, v_src.vat_default);
  v_gross := round(p_gross, 2);

  IF v_mode = 'NONE' THEN
    v_vat := 0;
  ELSIF v_mode = 'STANDARD' THEN
    v_vat := v_gross - round(v_gross / 1.2, 2);
  ELSIF v_mode = 'MANUAL' THEN
    IF p_vat_amount IS NULL OR p_vat_amount < 0 OR p_vat_amount > v_gross THEN
      RAISE EXCEPTION 'VAT must be between nil and the amount received';
    END IF;
    v_vat := round(p_vat_amount, 2);
  ELSE
    RAISE EXCEPTION 'VAT must be NONE, STANDARD or MANUAL';
  END IF;
  v_net := v_gross - v_vat;

  -- The month it belongs to defaults to the month it arrived.
  v_first := date_trunc('month', COALESCE(p_first_month, p_received_date))::date;

  v_gross_each := trunc(v_gross / v_months, 2);
  v_vat_each   := trunc(v_vat / v_months, 2);

  FOR i IN 0 .. v_months - 1 LOOP
    IF i = v_months - 1 THEN
      v_line_gross := v_gross - v_gross_each * (v_months - 1);
      v_line_vat   := v_vat - v_vat_each * (v_months - 1);
    ELSE
      v_line_gross := v_gross_each;
      v_line_vat   := v_vat_each;
    END IF;
    v_line_net := v_line_gross - v_line_vat;

    INSERT INTO other_income_receipts
      (source_id, asset_id, receipt_group, period_month, received_date,
       net_amount, vat_amount, description, comments)
    VALUES
      (p_source_id, v_src.asset_id, v_group, (v_first + make_interval(months => i))::date, p_received_date,
       v_line_net, v_line_vat,
       NULLIF(trim(COALESCE(p_description, '')), ''), NULLIF(trim(COALESCE(p_comments, '')), ''));

    v_lines := v_lines || jsonb_build_object(
      'month', to_char(v_first + make_interval(months => i), 'YYYY-MM'),
      'net', v_line_net, 'vat', v_line_vat, 'gross', v_line_net + v_line_vat);
  END LOOP;

  RETURN jsonb_build_object('receipt_group', v_group, 'gross', v_gross, 'net', v_net, 'vat', v_vat, 'lines', v_lines);
END;
$function$;

-- Remove a receipt recorded in error. By default the whole payment goes, since a payment
-- spread across a quarter was one payment. Kept, marked removed, with the reason.
CREATE OR REPLACE FUNCTION public.fn_remove_other_income(
  p_receipt_id uuid,
  p_reason text,
  p_whole_payment boolean DEFAULT true
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group uuid;
  v_count integer;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT receipt_group INTO v_group FROM other_income_receipts WHERE receipt_id = p_receipt_id AND NOT removed;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found, or already removed'; END IF;

  UPDATE other_income_receipts
  SET removed = true, removed_reason = trim(p_reason), removed_at = now()
  WHERE NOT removed
    AND (CASE WHEN COALESCE(p_whole_payment, true) THEN receipt_group = v_group ELSE receipt_id = p_receipt_id END);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- SECURITY DEFINER bypasses row-level security, so the lock is EXECUTE itself. A new
-- function is executable by PUBLIC by default: revoke from PUBLIC, not merely anon
-- (see 20260921095000 for what happens otherwise).
REVOKE ALL ON FUNCTION public.fn_add_other_income_source(uuid, text, text, boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_update_other_income_source(uuid, text, text, boolean, text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_record_other_income(uuid, date, numeric, text, numeric, date, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_remove_other_income(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_add_other_income_source(uuid, text, text, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_other_income_source(uuid, text, text, boolean, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_other_income(uuid, date, numeric, text, numeric, date, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_remove_other_income(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_add_other_income_source(uuid, text, text, boolean, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_update_other_income_source(uuid, text, text, boolean, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_record_other_income(uuid, date, numeric, text, numeric, date, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_remove_other_income(uuid, text, boolean) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.other_income_sources, public.other_income_receipts TO service_role;
GRANT SELECT ON public.v_other_income TO service_role;

-- Regenerate drafts was silently undoing the part-month pro-rata.
--
-- fn_regenerate_asset_draft_charges recalculates a draft's amount from the current lease
-- terms. It applied the incentive and rent-free rules but had NO pro-rata: it reset the
-- figure to annual_rent / 12, a full month, every time. So a part-month draft that
-- Generate had correctly pro-rated reverted to a full month the moment "Regenerate
-- drafts" was pressed, with nothing on screen to show it had happened — the Note column
-- also lost its "Part month pro-rata" line, because the notes were never rewritten either.
--
-- Concretely, pressing Regenerate on the August 2026 Southgate run would have turned
-- Al-Hurraya's Suites 2.5/2.6 draft from GBP 356.45 into GBP 650.00 and Suite 2.7 from
-- GBP 246.77 into GBP 450.00, and those figures would then have been approved and issued.
--
-- This is the same gap 20260726120000 closed between Preview and Generate; Regenerate was
-- the third path and was missed. All three now share one rule: bill the days occupied
-- within the month, both ends inclusive, over the days in that month. Regenerate also now
-- stamps billed_from / billed_to, so a refreshed draft prints its true period.

CREATE OR REPLACE FUNCTION public.fn_regenerate_asset_draft_charges(p_billing_month date, p_asset_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ps DATE := date_trunc('month', p_billing_month)::date;
  v_pe DATE := (date_trunc('month', p_billing_month) + interval '1 month' - interval '1 day')::date;
  v_count INTEGER := 0;
  r RECORD;
  v_net NUMERIC(12,2);
  v_rate NUMERIC(5,4);
  v_inc RECORD;
  v_msg TEXT;
  v_rent_start DATE;
  v_occ_from DATE;
  v_occ_to DATE;
  v_days_occ INTEGER;
  v_days_month INTEGER;
BEGIN
  v_days_month := (v_pe - v_ps) + 1;

  FOR r IN
    SELECT cr.charge_id, cr.lease_id, l.annual_rent, l.rent_free_end_date,
           l.commencement_date, l.rent_commencement_date, l.termination_date,
           cp.fixed_amount_annual, cp.vat_treatment
    FROM charge_records cr
    JOIN leases l ON l.lease_id = cr.lease_id
    JOIN charge_profiles cp ON cp.lease_id = cr.lease_id AND cp.charge_type = 'RENT'
    WHERE cr.asset_id = p_asset_id AND cr.charge_type = 'RENT'
      AND cr.status = 'DRAFT' AND cr.period_start = v_ps
  LOOP
    SELECT ri.incentive_type, ri.billed_amount_monthly INTO v_inc
    FROM rent_incentives ri
    WHERE ri.lease_id = r.lease_id AND ri.active = TRUE
      AND (ri.incentive_start_date IS NULL OR ri.incentive_start_date <= v_ps)
      AND (ri.incentive_end_date IS NULL OR ri.incentive_end_date >= v_ps)
    ORDER BY ri.incentive_start_date DESC NULLS LAST
    LIMIT 1;

    v_net := CASE
      WHEN v_inc.incentive_type = 'RENT_FREE' THEN 0.00
      WHEN v_inc.billed_amount_monthly IS NOT NULL THEN round(v_inc.billed_amount_monthly, 2)
      WHEN r.rent_free_end_date IS NOT NULL AND r.rent_free_end_date >= v_ps THEN 0.00
      ELSE round(COALESCE(r.annual_rent, r.fixed_amount_annual) / 12.0, 2)
    END;
    v_msg := CASE
      WHEN v_inc.incentive_type = 'RENT_FREE' THEN 'Rent-free period active'
      WHEN v_inc.billed_amount_monthly IS NOT NULL THEN 'Incentive applied: ' || v_inc.incentive_type
      WHEN r.rent_free_end_date IS NOT NULL AND r.rent_free_end_date >= v_ps THEN 'Rent-free period active'
      ELSE NULL
    END;
    v_rate := CASE r.vat_treatment WHEN 'STANDARD' THEN 0.2000 ELSE 0.0000 END;

    -- Same part-month rule as Preview and Generate.
    v_rent_start := COALESCE(r.rent_commencement_date, r.commencement_date);
    v_occ_from   := GREATEST(v_ps, v_rent_start);
    v_occ_to     := LEAST(v_pe, COALESCE(r.termination_date, v_pe));
    v_days_occ   := (v_occ_to - v_occ_from) + 1;

    IF v_days_occ > 0 AND v_days_occ < v_days_month AND v_net > 0 THEN
      v_net := round(v_net * v_days_occ::numeric / v_days_month::numeric, 2);
      v_msg := COALESCE(v_msg || ' | ', '')
               || 'Part month pro-rata: ' || v_days_occ || '/' || v_days_month || ' days ('
               || to_char(v_occ_from, 'DD Mon') || ' to ' || to_char(v_occ_to, 'DD Mon YYYY') || ')';
    END IF;

    UPDATE charge_records
    SET net_amount  = v_net,
        vat_rate    = v_rate,
        vat_amount  = round(v_net * v_rate, 2),
        billed_from = CASE WHEN v_days_occ > 0 THEN v_occ_from ELSE NULL END,
        billed_to   = CASE WHEN v_days_occ > 0 THEN v_occ_to   ELSE NULL END,
        notes       = v_msg,
        updated_at  = now()
    WHERE charge_id = r.charge_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

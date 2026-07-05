-- Before this migration the only pg_cron job in the project belonged to the mgmt app
-- (mgmt_book_recurring). Nothing ever ran fn_update_arrears (ISSUED -> OVERDUE once
-- due_date passes) or fn_refresh_lease_states (date-driven lease state transitions),
-- so both relied on someone remembering to trigger them.
--
-- Both functions are idempotent and safe to run daily:
--   - fn_update_arrears only touches ISSUED charges past their due date.
--   - fn_refresh_lease_states never reverts TERMINATED and only advances states.
-- Arrears figures themselves come from v_arrears_charges (date-based, unaffected);
-- these jobs keep the stored statuses honest.

DO $$
BEGIN
  PERFORM cron.unschedule('cpms-update-arrears');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('cpms-refresh-lease-states');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('cpms-update-arrears', '15 2 * * *', $$SELECT public.fn_update_arrears();$$);
SELECT cron.schedule('cpms-refresh-lease-states', '25 2 * * *', $$SELECT public.fn_refresh_lease_states();$$);

-- Live public-schema pg_cron JOBS - Supabase project jkpftidophjivmaqpkuu - captured 2026-07-29
-- Source of truth for changes is supabase/migrations; this is the recovery baseline.

-- jobid=1 active=t schedule=0 6 1 * *
    select public.mgmt_book_recurring();

-- jobid=2 active=t schedule=15 2 * * *
    SELECT public.fn_update_arrears();

-- jobid=3 active=t schedule=25 2 * * *
    SELECT public.fn_refresh_lease_states();

-- jobid=4 active=t schedule=20 2 * * *
    SELECT public.fn_apply_due_terminations();

-- Two functions were callable with the public anonymous key.
--
-- Every CPMS fn_* is SECURITY DEFINER, so it runs with the owner's rights and bypasses
-- row-level security. What stops an unauthenticated caller is that EXECUTE is granted to
-- authenticated and service_role only; PUBLIC and anon have none. Found 2026-09-21 while
-- adding the other income functions:
--
--   fn_apply_tenant_credit  created 2026-08-26 (20260826140000). A new function gets
--                           EXECUTE for PUBLIC by default, and that was never revoked.
--   fn_let_unit             dropped and recreated 2026-08-26 (20260826100200) to add the
--                           correspondence address. Recreating resets its permissions to
--                           the default, so the lock the original had was lost.
--
-- The anonymous key is shipped to every browser that loads the login page, so for about
-- four weeks anyone holding it could have let a unit or applied a tenant's credit without
-- signing in. Checked on discovery: every lease, tenant and credit application since
-- 26 August is accounted for as the owner's own or an administrative correction. Nothing
-- was done through this route.
--
-- Signed-in use is unaffected: authenticated keeps its explicit grant.
-- Lesson carried into later migrations: revoke from PUBLIC, not just anon.

REVOKE EXECUTE ON FUNCTION public.fn_apply_tenant_credit(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_apply_tenant_credit(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_let_unit(
  uuid[], text, date, numeric, text, text, text, text, text, text, date, text, text, numeric, boolean, text, text
) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_let_unit(
  uuid[], text, date, numeric, text, text, text, text, text, text, date, text, text, numeric, boolean, text, text
) TO authenticated, service_role;

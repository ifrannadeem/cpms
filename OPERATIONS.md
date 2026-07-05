# Opera (CPMS) — Operations runbook & owner checklist

_Last updated 2026-07-04 as part of the due-diligence remediation._

## Owner actions still required (in priority order)

1. **Review + apply one security-hardening migration:**
   `supabase/migrations/20260705100000_view_invoker_and_anon_revoke.sql`. All four
   remediation migrations from 2026-07-04 are applied and verified (rent-roll fix,
   deterministic units, invoice references, nightly cron). This last one flips CPMS
   views to caller-rights and revokes the anon key's dormant full table grants —
   no user-facing change, CPMS objects only. Apply via SQL Editor, or tell the
   assistant explicitly to apply it.
2. **Enrol MFA for both users** (Supabase Auth supports TOTP on the Free plan).
3. **Weekly backup:** run `npm run backup` (see Backups section below) and copy the
   dated folder off this machine.
4. **Vercel:** confirm the plan allows a 60s function duration (`/api/invoices` sets
   `maxDuration = 60` for full-month ZIP packs). Consider enabling a log drain or
   Sentry so query failures (now thrown, no longer silent) are recorded somewhere.

## Backups (Free plan — manual, one command)

The project stays on the Supabase Free plan (decision 2026-07-05), which has no
automated backups. Instead:

- **Data:** `npm run backup` exports every CPMS table to `Backups/YYYY-MM-DD/*.json`
  with a row-count manifest. Run it **weekly** (calendar reminder) and **always
  immediately before an invoicing run or bulk change**. Copy the dated folder
  somewhere off this machine — it contains tenant personal data, so treat it like
  the ledger itself. `Backups/` is git-ignored.
- **Structure:** already in git (`supabase/schema/` + `supabase/migrations/`).
- **Restore:** rebuild schema from the repo, then insert each table's JSON in the
  order listed in `scripts/backup.mjs` (parents before children).
- First backup taken and verified 2026-07-05 (28 tables).

## Decisions on record (2026-07-05)

- **Billing frequency: monthly for everyone, as policy.** The generator bills
  annual/12; the leases that were QUARTERLY/ANNUAL (One Below, Mencap, Swarco,
  Daahqan/Unit 6B) have been removed from the system. If a quarterly lease is ever
  added, the generator does NOT support it — raise it before the first billing run.
- **Supabase Free plan retained.** Leaked-password protection is Pro-only and was
  consciously skipped: sign-ups are disabled (re-disabled 2026-07-05 after being
  found ON), there are only trusted users, and MFA + strong unique passwords cover
  the same risk. Backups are manual via `npm run backup` (see Backups section).
- **One Supabase project, three distinct property apps — by design.** CPMS (`public`),
  `mgmt`, and `residential` stay in project `jkpftidophjivmaqpkuu` as separate,
  distinct systems. Standing rules that make this safe: nobody changes another app's
  objects (this repo owns `public.fn_*` / `v_*` / CPMS tables); check
  `supabase_migrations.schema_migrations` for unfamiliar entries before invoicing
  runs; accepted residual risk — the service-role key spans all three apps, so treat
  it accordingly and rotate it if it may have leaked.

## Routine

- **Monthly invoicing:** generate → approve → issue per asset as now. After the cron
  migration is applied, OVERDUE flipping and lease-state refresh run nightly
  (02:15/02:25 UTC) — check `select * from cron.job_run_details order by start_time
  desc limit 10;` if numbers look stale.
- **Deploys:** push to `main` → CI (typecheck, tests, build) → Vercel auto-deploy.
  If CI is red, the deploy that Vercel does anyway is suspect — fix before using it.
- **DB changes:** file in `supabase/migrations/` first, always (see supabase/README.md).

## Incident quick-reference

| Symptom | First move |
|---|---|
| Page shows red "could not load its data" box | Real query failure (this used to render as £0). Message includes the Postgres error; check Supabase logs. |
| Figures look stale | Check cron jobs ran (`cron.job_run_details`); dashboard/lease register are live-rendered so a hard refresh reflects the DB. |
| Invoice pack download times out | Check Vercel function duration limit vs `maxDuration = 60`; render per-tenant PDFs individually as a stopgap. |
| Wrong amount on an ISSUED invoice | Use the adjust-issued-invoice action (offsetting correction) — never edit `charge_records` directly. |
| Suspected unauthorised access | Supabase → Authentication → Users: remove/reset the user; then rotate the service-role key in Supabase and update Vercel env. |

## Key rotation

Supabase → Settings → API → rotate service role key → update `SUPABASE_SERVICE_ROLE_KEY`
in Vercel (Production) → redeploy → update local `.env.local`. Note the local `.env.local`
lives under a possibly cloud-synced Documents folder — keep it out of any shared sync.

## Access model (current, deliberate)

Two-ish trusted users, all with identical full access; RLS is authentication-gated only
(`USING (true)` for `authenticated`). Revisit the moment anyone with narrower trust
(bookkeeper, assistant) gets a login: that needs role checks in the mutating RPCs and
`auth.uid()` stamped into an audit trail (`significant_events` exists and is unused).

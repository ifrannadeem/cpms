# Database — source control and workflow

Supabase project: `jkpftidophjivmaqpkuu` (single project, **shared with other apps** — see
"Shared project" below).

## What is in this directory

| Path | What it is |
|---|---|
| `schema/functions.sql` | All 63 public-schema functions, captured live 2026-07-04 (pre-remediation) |
| `schema/views.sql` | All 22 public views, captured live 2026-07-04 |
| `schema/tables.sql` | Column definitions for all 28 public tables |
| `schema/constraints_indexes.sql` | Enums, PK/FK/CHECK constraints, indexes, triggers |
| `schema/rls_policies.sql` | RLS status, all policies, anon/authenticated grants |
| `schema/cron_jobs.sql` | pg_cron jobs at capture time |
| `migrations/` | New migrations, starting 2026-07-04. **Every DB change lands here first.** |

The `schema/` snapshot is the disaster-recovery baseline: together with the Supabase
migration history (69 migrations up to `nexus_expose_site_config_in_view`) it makes the
database rebuildable. It is a snapshot, not a living document — the living record is
`migrations/`.

## Rules (the reason this directory exists)

1. **No DDL in the SQL editor.** Every schema change is a file in `migrations/`
   committed to git, then applied. Before 2026-07-04, ~40 functions and ~12 tables
   existed only in the live DB and the repo could not rebuild the system.
2. **Migrations are additive and backward compatible** with the currently deployed app
   (new columns nullable, views only append columns).
3. After applying, refresh the relevant `schema/` capture file if the object is one the
   app depends on.

## Migration status

| File | What it does | Status |
|---|---|---|
| `20260704120000_fix_portfolio_health_rent_roll.sql` | Dashboard rent-roll no longer counts a multi-unit lease once per unit | **APPLIED 2026-07-05**, verified |
| `20260704120100_deterministic_unit_and_search_path.sql` | Charge generation picks the lowest unit reference (was arbitrary); pins `search_path` on CPMS functions | Pending |
| `20260704120200_invoice_reference_stamping.sql` | Adds `charge_records.invoice_reference` + exposes it in `v_charge_ledger`; app stamps it on first render of an issued invoice | Pending |
| `20260704120300_schedule_cpms_maintenance_jobs.sql` | Daily pg_cron: `fn_update_arrears` (02:15) and `fn_refresh_lease_states` (02:25) | Pending |

Apply pending ones in timestamp order: Supabase dashboard → SQL Editor → paste the
file's contents → Run — or approve the assistant's `apply_migration` calls in a session.
All three are additive/idempotent and safe with the currently deployed app.

## Shared project — read before touching anything

This Supabase project also hosts unrelated schemas: `mgmt` (9 tables, plus `mgmt_*`
views/functions in `public`), `residential` (12 tables), and the July 2026 `nexus_*`
parameterisation layer. One pg_cron job (`mgmt_book_recurring`, monthly) belongs to mgmt.

Consequences:

- The `SUPABASE_SERVICE_ROLE_KEY` grants access to **all** of it.
- Any CPMS user can read the `mgmt_*` views (SECURITY DEFINER, in `public`).
- Another workstream can change functions this app calls (`nexus_backward_compat_shims`).

**Owner decision (2026-07-05): the three property apps stay in this one project as
distinct systems.** The standing rules that make that safe: never modify objects you
don't own (this repo deliberately did **not** pin `search_path` on the five flagged
`mgmt` functions), and check `supabase_migrations.schema_migrations` for unfamiliar
entries before invoicing runs.

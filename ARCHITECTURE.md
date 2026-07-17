# Opera (CPMS) — Architecture, current state

**Last verified against the live system: 2026-07-04.** This supersedes HANDOVER.md and
SYSTEM_REVIEW.md, which are kept as historical records only.

## What it is

Internal property-management system for 2i Investments Limited: three commercial assets
(Rosehill Business Centre, Peartree Plaza — owned; Southgate Retail Park — managed,
`income_owned = false`), ~59 leases. Leases, rent + electric billing, invoicing PDFs,
cash-receipt payment registers, arrears, meter readings, VAT/rent Excel reports.

## Stack

- **Next.js 15 App Router** (TypeScript, Tailwind 4), deployed on Vercel from `main`.
- **Supabase Postgres** — project `jkpftidophjivmaqpkuu`, **shared with other apps**
  (see supabase/README.md). All business logic lives in SQL functions (`fn_*`).
- **Supabase Auth**, email+password, sign-ups disabled, no roles — every user has full
  access. Session validated in `middleware.ts` (redirects to `/login`), and again inside
  each API route (`lib/auth.ts`).

## Data-access pattern

| Context | Client | Behaviour |
|---|---|---|
| Server components / API routes | `lib/supabase.ts` (service-role) | **Throws on query error** (except `.single()` no-rows), caught by `app/error.tsx`. Never import in client components. |
| Rare best-effort writes | `supabaseUnchecked` from the same module | Caller inspects `error` itself (used for invoice-reference stamping). |
| Client components (`'use client'`) | `lib/supabase-browser.ts` (anon + session cookie) | All mutations via `fn_*` RPCs carrying the user's JWT; RLS restricts to `authenticated`. |

Pages that show money are `force-dynamic` — no ISR staleness. After a client-side
mutation, `router.refresh()` re-renders the server components.

## Billing lifecycle

`fn_generate_asset_rent_charges` (DRAFT, incentive-aware, rent derived from lease) →
approve (`fn_approve_asset_charges`) → issue (`fn_issue_asset_charges`, stamps
`issued_date`) → optionally adjust (`fn_adjust_issued_charge`) or cancel/write off
(`fn_cancel_charge` → CREDITED/WRITTEN_OFF; record retained, reason logged). Terminated
leases stay reachable via `v_lease_history` / `v_unit_history` (the register views hide
them by design; the lease detail page and search use the history view). Payments are a
cash-receipt journal: `fn_record_lease_payment` allocates oldest-first per lease and
charge type into `payments` / `payment_allocations`. Arrears definition is centralised
in `v_arrears_charges` (electric gets a month's grace; rent is overdue from the 1st).

Invoice PDFs (`/api/invoices`, `lib/invoice-pdf.tsx`) render from `v_charge_ledger` +
`issuing_entities`. The reference (`R2607-U12` / `2607E-U12`) is stamped onto
`charge_records.invoice_reference` on first render of an issued invoice and reused
verbatim thereafter (once migration `20260704120200` is applied).

## Known, deliberate quirks (do not "fix" without the owner)

- **All billing is monthly (annual/12) — policy, decided 2026-07-05.** The
  `billing_frequency` field exists but the generator does not respect it; the leases
  that were quarterly/annual have been removed from the system. Do not add a
  quarterly lease without raising this first.
- Periodic tenancies alert at **LOW** urgency ("accepted position") — intentional
  downgrade, June 2026.
- Rent-free ending mid-month zeroes the whole month (no pro-rating) unless a
  `rent_incentives` row says otherwise.
- Meter rollover is handled manually ("put a 1 in front") by owner preference.
- Southgate is invoiced like a landlord asset even though 2i is only agent; its income
  is excluded from owned-portfolio figures via `income_owned = false`.
- 2i Investments and As-Siraat have `applies = false` charge profiles — never billed.
- VAT is a hardcoded 20% for `STANDARD` inside the generator functions.

## Verification

- `npm run typecheck` / `npm test` (vitest — pins invoice reference/filename identity)
  / `npm run build`; all run in CI (`.github/workflows/ci.yml`).
- ESLint is skipped during production builds (style must not block a deploy) but runs
  non-blocking in CI.

## Layout

```
app/                    routes (dashboard, leases, reports, assets/[reference]/...)
app/api/                invoices PDF/ZIP, rent-income + VAT xlsx (auth-guarded)
components/             client components (leases editors, payments, meters, reports)
lib/                    supabase clients, auth guard, invoice assembly/PDF, reports
supabase/               schema snapshot + migrations (source of truth for the DB)
schema.sql, stage*.sql, seed.sql   original 2026-06 bootstrap — HISTORICAL, superseded
```

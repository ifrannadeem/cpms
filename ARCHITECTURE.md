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
Money received beyond what is outstanding stays on the receipt as
`payments.unallocated_amount` and is **never applied on its own** — `v_tenant_credit`
surfaces it and `fn_apply_tenant_credit` sets it against a lease's outstanding charges
when the operator presses Apply, writing ordinary `payment_allocations` rows so the
registers, arrears and `fn_reverse_payment` all treat it as the allocation it is.

Invoice PDFs (`/api/invoices`, `lib/invoice-pdf.tsx`) render from `v_charge_ledger` +
`issuing_entities`. The reference (`R2607-U12` / `2607E-U12`) is stamped onto
`charge_records.invoice_reference` on first render of an issued invoice and reused
verbatim thereafter (once migration `20260704120200` is applied).

## Known, deliberate quirks (do not "fix" without the owner)

- **All billing is monthly (annual/12) — policy, decided 2026-07-05.** The
  `billing_frequency` field exists but the generator does not respect it; the leases
  that were quarterly/annual have been removed from the system. Do not add a
  quarterly lease without raising this first. **Part months are pro-rata at both
  ends** (2026-07-26): a tenancy starting and/or ending mid-month bills the days
  occupied, both ends inclusive, over the days in that month. Preview, Generate and
  Regenerate all share this one rule — Regenerate was the odd one out until
  2026-08-26, silently resetting a part-month draft to a full month.
- **A part-month invoice prints the period it bills** (2026-08-26).
  `charge_records.billed_from` / `billed_to` record the window the generator billed,
  and the invoice shows those dates plus "(part month, 17 of 31 days)" rather than the
  whole calendar month. `period_start` / `period_end` still mean the calendar month, so
  the duplicate guard, the collection matrix and every existing query are unchanged.
  Charges raised before that date have NULL and render exactly as the tenant received
  them — the same protection the concession lines were given.
- **Rent concessions print on the invoice from the September 2026 run.** Where a
  fixed discount is live, the rent line shows the headline and a second line shows
  the reduction with its end date, so a tenant is never surprised when it reverts.
  Deliberately narrow (`concessionFor` in lib/invoice-data.ts): only a full month
  billed at exactly the discounted figure qualifies — rent-free, part months and
  adjusted invoices print unchanged, because the two lines would not reconcile to
  the total. Held to September so August, already issued and sent, still renders as
  the tenant received it.
- **Two tenant names, deliberately separated** (owner decision 2026-07-26).
  `legal_name` is the party liable under the lease and is the ONLY name that appears
  on an invoice or its filename — a brand must never appear on a demand for payment,
  which matters most for limited companies. `trading_name` is the recognisable brand
  and is used on screens only (registers, payments, arrears, dispatch cards). Both are
  edited on the tenancy page under Company. Invoice rendering reads `legal_name`
  directly in `assembleInvoices`, not `v_charge_ledger.tenant_name` (which is the
  screen name).
- **End Tenancy is date-aware.** A future date on End Tenancy records notice and
  keeps the lease active and billing until then, ending it automatically on the date
  (nightly `fn_apply_due_terminations`). Today/backdated ends immediately.
- **Credit is applied by hand, never swept automatically** (owner decision 2026-08-26).
  An advance or an overpayment shows as "credit held" on the payment register with an
  **Apply** button. Automatic allocation was rejected: credit is rare, and cash landing
  somewhere unexpected is worse than one extra click. Note `v_arrears_charges` does not
  net off unapplied credit, so a tenant who has paid ahead still reads as in arrears
  until Apply is pressed.
- Periodic tenancies alert at **LOW** urgency ("accepted position") — intentional
  downgrade, June 2026.
- Rent-free ending mid-month zeroes the whole month (no pro-rating) unless a
  `rent_incentives` row says otherwise.
- **A meter reading that goes down is refused** unless a rollover is actually possible —
  previous reading near the top of the dial range, new one near the bottom (2026-08-26).
  Both functions previously treated *any* decrease as a wrap: a missed decimal on Rosehill
  Unit 12A (1026.54 then 1026.00) became 999,999.46 kWh and a GBP 305,999.83 draft invoice.
  Nothing on screen distinguished it from a normal entry but the figure. Rollover otherwise
  stays manual ("put a 1 in front") by owner preference.
- **An electric reading cycle is keyed on the date the meters were read** (`period_end`),
  not on `period_start` (2026-08-26). A charge's `period_start` is that meter's *previous*
  reading date, which legitimately differs between meters in the same run — a meter
  installed mid-cycle, or one read a day apart. Keying on it split a single run into
  several "cycles" on Electric: Invoicing and hid most of the charges behind the dropdown,
  while the Approve and Issue buttons (which act asset-wide) reported the full count. The
  cycle label shows the earliest opening date; each invoice still carries its own exact
  period.
- **Invoice email sends from a per-asset mailbox** (2026-08-26): `SMTP_USER_<REF>` /
  `SMTP_PASS_<REF>` override the shared `SMTP_USER` / `SMTP_PASS`. A property's tenants
  hear from the entity named on their invoice, and a reply reaches the right inbox.
  Half-configured is refused, never guessed: a per-asset address without its own password
  raises rather than falling back to the shared one and sending from the wrong account.
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

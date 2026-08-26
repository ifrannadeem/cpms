# Opera (CPMS) — Operations runbook & owner checklist

_Last updated 2026-08-26._

## Where things stand — 26 August 2026

**Southgate 2.5/2.6 and 2.7 are let to Al-Hurraya from 15 August 2026** (2.5/2.6 one
tenancy at £7,800 pa, 2.7 at £5,400 pa, both rent-exempt as at Suite 2.4). Ambitions
Personnel ended on 17 August as scheduled; their part-month invoice of £302.71 stands
and was correct — Al-Hurraya took occupation early by agreement, so the three-day
overlap is deliberate and neither invoice needed adjusting.

Al-Hurraya now holds four suites (2.4, 2.5, 2.6, 2.7) under **one** tenant record. Three
had been created, because *Let Unit(s)* makes a new tenant every time; they were merged
on 26 August. Rent and electric therefore now combine into one email per cycle, with a
block and an attachment per suite and a single total, as Giara's do.

Ambitions' £302.71 was received by bank transfer on 11 August and is recorded; their
invoice is PAID and their row has dropped off the payment grid, as intended.

**Outstanding on this:** the two August part-month rent drafts (£356.45 and £246.77) are
generated and correct but **not yet approved, issued or sent**.

**Live from 26 August** (code needs pushing before the invoice side takes effect):
- A part-month rent invoice prints the period it bills (15 to 31 August) and says
  "part month, 17 of 31 days". Invoices already issued are untouched.
- *Regenerate drafts* no longer wipes the part-month pro-rata. It used to reset a
  pro-rated draft to a full month with nothing on screen to show it.
- Correspondence address is required when letting a unit.

**Electricity is standard-rated for everyone** (owner confirmation 2026-08-26). It is a
recharge at cost of a supply the landlord was itself charged VAT on, and the utility
gives no concession, so there is nothing to pass on. All 78 electric charges ever raised
carry 20%, and always have.

`charge_profiles.vat_treatment` on an **ELECTRIC** row is dead data — nothing reads it.
The charge is raised at a hardcoded 20% by `fn_record_meter_reading`; the electric page
of the invoice prints "VAT 20%" from its own layout (`vatRateLabel` and the VAT-invoice
block are on the *rent* page only); the lease screen shows the RENT profile; the VAT
report sums `charge_records.vat_amount`. So a wrong flag there has never produced a wrong
invoice, figure or return.

**Still open:** 22 Rosehill ELECTRIC profiles disagree with that policy in the same inert
way — 18 `VAT_DEFERRED`, 3 `EXEMPT`, 1 `OUTSIDE_SCOPE`. Suite 2.4 was corrected to
STANDARD on 26 August; the Rosehill 22 await a decision. Worth doing before anyone wires
the field into the electric path, at which point 22 leases would start billing wrongly.

## Where things stood — 29 July 2026

**August 2026 is fully issued.** Rosehill 33 rent invoices (issued, sent manually),
Peartree 9 (sent 28 Jul), Southgate 11 (emailed 27 Jul, the live pilot). Electric
issued per cycle. Nothing outstanding in the August run.

**Live but not yet exercised** — these activate with the September run, so expect them
and do not mistake them for faults:
- Invoice references gain a property code: `R2609-RBC-U10` (August stays `R2608-U10`).
- Rent concessions print as headline-less-concession on the eight discounted
  tenancies (five at Peartree). Held back from August deliberately.

**In flight**
- *Southgate 2.5/2.6/2.7*: settled on different terms from those planned here — see the
  26 August entry above. The plan to cancel Ambitions' August invoice was overtaken: the
  letting completed from 15 August, not 1 August, and their invoice stands.
- *Rosehill email go-live, September*: **still entirely outstanding as at 26 August.**
  Needs (a) real invoice recipients on every Rosehill tenancy — all 34 are still
  `…@placeholder.tbc` and none has an *Invoice recipients* entry, including all three
  Maher records; (b) a decision on whether Rosehill sends from its own mailbox, which needs
  its own Gmail App Password and per-asset SMTP credentials (about an hour's work);
  (c) `ASSET-001` added to `DISPATCH_LIVE_ASSETS`.

## Owner actions still required (in priority order)

1. **MFA on the dashboard accounts** (Supabase, GitHub, Vercel — account settings,
   one-time; browsers stay trusted so prompts are rare). Owner to-do as of
   2026-07-05. In-app MFA consciously skipped (two trusted users, sign-ups off).
2. **Weekly backup:** Settings → Download backup in the app (or `npm run backup`),
   stored off-device. First one taken 2026-07-05.
3. **Vercel:** confirm the plan allows a 60s function duration (`/api/invoices` sets
   `maxDuration = 60` for full-month ZIP packs). Consider enabling a log drain or
   Sentry so query failures (now thrown, no longer silent) are recorded somewhere.

All five remediation migrations (2026-07-04/05) are applied and verified — see
supabase/README.md for the record.

## Backups (Free plan — manual, one command)

The project stays on the Supabase Free plan (decision 2026-07-05), which has no
automated backups. Instead:

- **Data (either way, same export):**
  - In the app: **Settings → Download backup** — ZIP of every table as JSON plus a
    row-count manifest; works from any device.
  - Offline fallback: `npm run backup` writes the same export to
    `Backups/YYYY-MM-DD/` on this machine (`Backups/` is git-ignored).

  Take one **weekly** and **always immediately before an invoicing run or bulk
  change**, and store it off this machine — it contains tenant personal data, so
  treat it like the ledger itself.
- **Structure:** already in git (`supabase/schema/` + `supabase/migrations/`).
- **Restore:** rebuild schema from the repo, then insert each table's JSON in the
  order listed in `scripts/backup.mjs` (parents before children).
- First backup taken and verified 2026-07-05 (28 tables).

## Emailing invoices (Email Invoices tab)

Per asset: review each tenant's email (rent and electric separately), then Send or
Send all. Built from the issued invoices, so the email matches the PDF. Southgate is
the live pilot; Rosehill follows; Peartree stays manual (WhatsApp).

- **Recipients:** the tenancy's *Invoice recipients* field (comma-separated for
  several people), else the accounts/primary email.
- **Test vs live is per asset (env vars on Vercel):** `SMTP_USER`, `SMTP_PASS`
  (Gmail App Password) send the mail; `DISPATCH_TEST_TO` is the test inbox. An asset
  is **live** only if its reference is in `DISPATCH_LIVE_ASSETS` (comma-separated) —
  e.g. `ASSET-003` for Southgate. Everything else stays in **test mode**: every email
  goes to `DISPATCH_TEST_TO`, subject prefixed `[TEST]`, recipient named inside, and
  nothing marked sent. To add Rosehill later, append `ASSET-001`. (`DISPATCH_LIVE=true`
  forces every asset live — avoid; use the per-asset list.)
  Asset references: Rosehill `ASSET-001`, Peartree `ASSET-002`, Southgate `ASSET-003`.
- **Send log & no double-send:** a live send stamps `sent_date` /
  `sent_method=EMAIL` / `sent_to` on the charges. Already-sent tenants show a
  green "Sent" badge; **Send all skips them** (label becomes "Send all unsent"),
  so re-running the batch is safe. A deliberate resend is per-tenant via
  **Resend**, which asks to confirm before emailing the tenant again.
- **Rotate the App Password:** revoke at myaccount.google.com/apppasswords, issue a
  new one, update `SMTP_PASS` in Vercel, redeploy.

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
| Invoice raised but not due (surrender, error) | Open the charge → **Cancel / write off invoice** → Cancelled (credit). It leaves arrears; record and reason retained for audit. |
| Payment recorded against the wrong tenant / wrong amount | Receipt History → **Reverse** on that row (reason required) → re-enter the correct payment. Allocations unwind and charges revert automatically; the reversal is logged. |
| Need history of a unit / ended tenancy | Search the tenant (marked "ended"), or the asset's Leases tab → Past Tenancies. Detail pages work for terminated leases. |
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

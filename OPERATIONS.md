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

The two August part-month rent invoices are issued (`R2608-SGP-U8S2.5-2.6` £356.45 and
`R2608-SGP-U8S2.7` £246.77). Because Suite 2.4's August invoice was emailed on 27 July and
all four suites now sit under one tenant, the dispatch card shows as already sent and
**Send all unsent will skip Al-Hurraya** — August goes out manually, sending only the two
new PDFs. From the September run all three merge into one email as normal.

**Southgate August electric is entered and approved:** 11 charges, £493.05 gross, read
24 August, awaiting Issue. An earlier upload landed on 26 August by mistake and was
cleared in full and re-entered. The four billing-off meters (`MTR-SGP-1.1-1.2`,
`1.3-1.4`, `2.1-2.2`, `2.10`) raise no charge, which is what "Off" means.

Note the cycle runs 25 July to 24 August for ten meters and 26 July to 24 August for
Suite 2.5, whose meter was only installed on 26 July. That is correct, and each invoice
carries its own dates.

**Rosehill is live on email from 26 August.** `ASSET-001` is in `DISPATCH_LIVE_ASSETS`
alongside `ASSET-003`, and Rosehill sends from its own mailbox,
`2iinvestmentsltd@gmail.com` (`SMTP_USER_ASSET_001` / `SMTP_PASS_ASSET_001`, app password
named "Opera"). Southgate is unchanged on `noblestoneltd@gmail.com` via the shared
`SMTP_USER` / `SMTP_PASS`. The same address is now on Rosehill's letterhead, so the
invoice and the sending mailbox agree. Peartree stays manual.

Before go-live: August's 34 Rosehill rent invoices were marked as sent (Email, 26 Aug) —
they had been sent by hand and never recorded, so **Send all unsent** would otherwise
have re-emailed 33 tenants, seventeen of whom had already paid. Check that before taking
any future asset live.

All 34 Rosehill tenancies now have a real invoice recipient. **Eight route to
`taz.nadeem@yahoo.co.uk` as an interim relay** — RBC-A-4, A-5, A-8, A-B, A-21, B-25,
B-26, B-30 — because those tenants have supplied no email; Taz forwards hard copies and
so knows who has not been reached electronically. A-21 is 2i's own unit and is never
billed (`applies = false`), so seven billed tenancies are actually affected. Replace each
as a real address arrives.

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

The profiles have been brought into line: Suite 2.4 and 21 Rosehill tenancies (18
`VAT_DEFERRED`, 3 `EXEMPT`) corrected to STANDARD on 26 August. **One deliberate
exception:** `RBC-A-21`, 2i Investments' own occupation of its own unit, stays
`OUTSIDE_SCOPE` — it has no active meter, has never been charged for electricity, and is
not a tenant paying a recharge. Every ELECTRIC profile in the system is now STANDARD
except that one. No rent profile was touched; rent VAT is per lease and unchanged.

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
- *Rosehill email go-live*: **done 26 August** — see the entry at the top. Superseded.
  Original note: **still entirely outstanding as at 26 August.**
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
- **Sending address is per asset (2026-08-26).** `SMTP_USER_<REF>` / `SMTP_PASS_<REF>`
  — e.g. `SMTP_USER_ASSET_001` / `SMTP_PASS_ASSET_001` for Rosehill — override the shared
  `SMTP_USER` / `SMTP_PASS`, which stay the fallback for any asset without its own. Each
  property then sends from the mailbox its tenants expect, and a reply reaches the right
  inbox. The pair must be set **together**: a per-asset address with the shared password
  is refused outright rather than silently sending from the wrong account. The Email
  Invoices banner names the From address, so check it before going live.
  Current intent: Southgate `noblestoneltd@gmail.com` (2i acts as agent for Connect
  Derby), Rosehill `2iinvestmentsltd@gmail.com` (2i as landlord).
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
  new one, update `SMTP_PASS` (or the asset's `SMTP_PASS_<REF>`) in Vercel, redeploy.

### Bringing an asset live on email — the order that keeps it safe

1. Real invoice recipients on every tenancy for that asset (the *Invoice recipients*
   field). Anything still `…@placeholder.tbc` is skipped, not sent.
2. Its mailbox: create a Gmail App Password on that account, then set
   `SMTP_USER_<REF>` and `SMTP_PASS_<REF>` in Vercel (Production) and redeploy.
3. **Still in test mode**, open Email Invoices and confirm the banner reads *Sending
   from &lt;that address&gt;*, then send one. The test lands in `DISPATCH_TEST_TO` and
   shows the From address it really used.
4. Only then add the asset's reference to `DISPATCH_LIVE_ASSETS` and redeploy.

Nothing is marked as sent until step 4, so steps 1–3 are reversible.

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

## Other income (EV chargers, parking, car park, one-offs)

On each property, the **Other Income** tab. Record what arrived, the day it arrived, and
**the month it belongs to**, which is left blank on purpose so it is always chosen. VAT is
one click: *No VAT*, *Includes 20% VAT*, or type it. A quarterly payment (Swarco) goes in
once with *Months it covers* set to 3 and is spread evenly, so the income does not spike.

Southgate sources as set up on 2026-09-21: EV chargers (Swarco, 20%), Unit 7 parking bays
(Maximus, 20%), Car park (Vehicle Control Services, no VAT), and *Other (one-off)* for
anything occasional. Add Suite 2.9 parking as its own source when its records are to hand.

Receipts only. Opera does not invoice these payers or track what they owe, so outstanding
amounts (Maximus from March 2026, the car park balance of GBP 784 for August) are visible
only as nil lines in the monthly report. A wrong entry is removed with a reason and kept for
the record; re-enter it correctly.

## Giving the accountant income and VAT figures

**Reports → Rent Income & VAT by Month**, one property at a time. Pick the property and a
month range, and it downloads an Excel workbook with three sheets: a summary by month, then
VAT and net rent per tenant. Each month shows what was **invoiced** against what has been
**received**, so the gap between the two is the arrears rather than a discrepancy.

Three things to say when handing it over:

- **Rent and other income, no electricity.** Other income is its own section and sheet. Electric VAT is
  real output VAT and will need adding if the accountant asks for the full picture.
- **Opera holds nothing before July 2026.** The system went live that month; the first rent
  charges are for July 2026 and the first receipts are late June. Earlier periods have to
  come from whatever was kept before, not from here.
- **Never merge the properties.** Rosehill is 2i Investments (VAT 202 3355 59), Southgate is
  Noblestone Partners as agent for Connect Derby (VAT 487 8361 34), and Peartree is not
  registered. Separate entities, separate returns. The report will only ever produce one
  property at a time, by design.

Credited and written-off invoices are excluded from the totals and shown on their own line,
since a written-off debt may qualify for VAT bad debt relief.

## Incident quick-reference

| Symptom | First move |
|---|---|
| Page shows red "could not load its data" box | Real query failure (this used to render as £0). Message includes the Postgres error; check Supabase logs. |
| Figures look stale | Check cron jobs ran (`cron.job_run_details`); dashboard/lease register are live-rendered so a hard refresh reflects the DB. |
| Invoice pack download times out | Check Vercel function duration limit vs `maxDuration = 60`; render per-tenant PDFs individually as a stopgap. |
| Wrong amount on an ISSUED invoice | Use the adjust-issued-invoice action (offsetting correction) — never edit `charge_records` directly. |
| Invoice raised but not due (surrender, error) | Open the charge → **Cancel / write off invoice** → Cancelled (credit). It leaves arrears; record and reason retained for audit. |
| Payment recorded against the wrong tenant / wrong amount | Receipt History → **Reverse** on that row (reason required) → re-enter the correct payment. Allocations unwind and charges revert automatically; the reversal is logged. |
| Tenant paid in advance / overpaid; next invoice still shows as due | Expected. Unallocated money is held, not swept. Rent: Payments → the tenant's row shows "credit held" → **Apply**. Until then arrears counts them as owing. |
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

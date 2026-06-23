# CPMS — Council Review (Pre-Deployment)
**Prepared by:** Five Agent Council
**Date:** June 2026
**Focus (as requested):** functional completeness, user-friendliness, and user interface — ahead of deployment + user access.
**Scope reviewed:** portfolio dashboard, per-asset Overview/Leases/Billing, Invoicing (Rent + Electric), Payments (Rent + Electric), Meter Readings, Arrears, the data model and views, and the recent reorganisation.

---

## 1. Verdict

The system is **functionally strong and ready to deploy *after* a short, well-defined hardening pass.** The spine is excellent: a single normalised ledger, rent and electric as separate domains sharing that ledger, a proper staged invoicing lifecycle, cash-receipt payment registers, a centralised arrears definition, and now aging + a chase log. The design choices are sound and consistent. What remains before real-world use is mostly *safety and correction* work, not new features — and a handful of UX refinements that will make day-to-day use noticeably smoother.

We've grouped recommendations as **Must (before deploy)**, **Should (before issuing real invoices)**, and **Polish (high-value UX)**.

---

## 2. What the system does well

- **One ledger, two domains.** `charge_records` underpins rent and electric, so tenant statements, arrears and payments stay trivial while each workflow remains clean. This is the right architecture and it has paid off repeatedly.
- **Invoicing lifecycle is real.** Preview → Generate drafts → Approve → Issue, with regenerate-from-lease and a confirmation gate on irreversible actions. Sent-tracking is correctly separate from Issued, and routes by each tenant's preferred channel.
- **Money handling is honest.** Payments are a cash-receipt journal with oldest-first allocation by tenant and type; VAT is derived correctly per treatment; the Unit-B fix shows charges attribute to the right unit.
- **Single source of truth for arrears.** `v_arrears_charges` now drives both the dashboard and the Arrears page, so the numbers can't disagree — and current-month bills no longer raise false alerts.
- **Analytical depth where it matters.** Per-block electric dashboard, unit/block drill-downs, supplier reconciliation, and arrears aging give genuine management insight, not just data entry.
- **Consistent, professional UI.** Slate palette, card tiles, status badges, empty states, and now colour-grouped tabs. It reads like a real product.

---

## 3. Must — before deployment (safety/correctness)

**3.1 Authentication & access control (CRITICAL).**
The app runs with the service-role key server-side and an open anon key client-side. On localhost that's fine; **on a public URL it is not.** Anyone with the link could read everything and, worse, call the `SECURITY DEFINER` RPCs (record payments, issue invoices, log chases). Before Vercel: add Supabase Auth + a login screen, restrict anon `SELECT` policies, and require an authenticated role for every mutating RPC. This is the single most important item and it's exactly the phase you're about to enter.

**3.2 Remove the legacy/dead paths.**
The old global `/billing` page, the orphaned `billing-actions.tsx`, and the legacy `fn_record_payment` / `fn_issue_charges` functions are superseded but still present. The legacy payment function *overwrites* rather than accumulates — a foot-gun if ever called. Delete them so there is exactly one write path per action.

**3.3 Lock down the new tables' RLS.**
`supplier_bills` and `arrears_actions` were created with permissive "allow all" policies for development. Tighten these to authenticated-only as part of 3.1.

---

## 4. Should — before issuing real invoices (integrity)

**4.1 Corrections: void / credit + edit-a-draft.** (Already agreed as Phase 3.)
Today an issued invoice with a mistake needs SQL surgery. Add a void/credit function (offsetting record, never delete) and the per-draft amount/VAT override. This is the difference between a system you trust and one you're nervous to issue from.

**4.2 Store the invoice reference at issue time.**
References are computed at render. If a unit reference or scheme ever changes, historical PDFs would regenerate differently. Stamp the reference onto `charge_records` when issued and render from the stored value.

**4.3 Test quarterly / annual billing end-to-end.**
Generation has only been exercised monthly. Several leases bill quarterly/annually (One Below, Mencap, Swarco, Daahqan). Run a full cycle for one before its quarter day so the frequency logic is proven.

**4.4 Automate the routine.**
Charge generation, and the flip to OVERDUE, are manual. Add `pg_cron`: generate DRAFT rent charges on the 1st (respecting frequency); refresh arrears/overdue daily. The owner still reviews and approves — automation just removes "did we forget?".

---

## 5. Polish — high-value UX / UI wins

**5.1 CSV export on registers and the electric matrix.** The owner lives in Excel — meet him there. A one-click "Export CSV" on the charge ledger, payment registers, arrears, and the usage matrix would be used constantly and is low effort.

**5.2 Portfolio-wide tenant / unit search.** With ~60 tenants across three assets, finding "Maher Restaurant" means knowing which asset they're in. A simple global search box (tenant or unit → jump to their page) would save real time.

**5.3 Centralise the unit-label helper.** `formatUnit` is re-implemented in many files with small differences (e.g. `RBC-A-4-5` rendering as "Unit 5"). Extract one shared helper so labels are identical everywhere — and decide the canonical label for combined units like 4-5.

**5.4 Loading states.** Server components mean some navigations feel briefly blank. Add `loading.tsx` skeletons on the heavier pages (Billing, Meter Readings, Arrears) for perceived speed.

**5.5 Mobile / device friendliness.** You want to use this from any device. The wide tables scroll horizontally (workable) but are dense on a phone. For the screens you'd check on the go (Arrears, an asset Overview), a condensed card layout under a breakpoint would help.

**5.6 Tenant contacts screen.** The per-tenant preferred method (and email accuracy you'll review pre-go-live) lives on each lease's editor. A single "Tenant contacts" table to set preferred method, email and phone across an asset in one place would speed the review and ongoing upkeep.

**5.7 Sticky table headers** on the long tables (lease register, matrix) so column meaning stays visible while scrolling.

---

## 6. Functional gaps worth noting (not blockers)

- **Tenant phone numbers are empty** across all tenants, so WhatsApp dispatch isn't yet possible — email is. Capture numbers when convenient (a contacts screen, 5.6, is the natural home).
- **First/baseline meter reading is blocked** in the entry form, and there's no add-meter/split-unit admin — needed when billing Units 6/8/9 or splitting Southgate's Suite 2.5-2.6 (already on the backlog).
- **Southgate management-fee model** is unbuilt; it's treated as landlord rent. Income is correctly excluded from the owned rent roll, but invoicing/arrears treat it like rent. Worth a deliberate decision before relying on its figures.
- **`significant_events` audit table** exists but is unused; once auth lands, wire `entered_by` and correction events into a proper audit trail.

---

## 7. Strategic / later

- **Email dispatch automation** (Phase 7 — already specced): auto-send issued invoices by preferred method with a send log.
- **Tenant statements:** one PDF per tenant showing all charges + payments with a running balance — the natural next reporting artefact on top of the shared ledger.
- **Deeper supplier reconciliation:** trend recovery rate over time per block; flag blocks recovering < 90%.
- **Multi-user roles** (owner vs bookkeeper) once auth exists.

---

## 8. Suggested sequence

1. **Deploy phase:** Auth + RLS hardening (3.1, 3.3) → remove dead paths (3.2) → GitHub → Vercel.
2. **Trust phase:** void/credit + edit-draft (4.1), store invoice refs (4.2), test quarterly/annual (4.3).
3. **Automation:** pg_cron (4.4).
4. **UX wins, in order of daily value:** CSV export (5.1) → tenant/unit search (5.2) → tenant contacts screen (5.6) → loading states + mobile (5.4, 5.5) → unit-label helper (5.3).
5. **Then:** email automation, tenant statements, Southgate model.

The headline: **nothing fundamental is wrong — deploy is gated only on auth and dead-path removal, and the rest is incremental.** The foundations will carry all of it.

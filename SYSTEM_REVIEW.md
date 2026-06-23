# CPMS — Independent System Review
**Prepared by:** Five Agent Council session
**Date:** June 2026
**Scope:** Everything built to date — database, billing engine, payment registers, electric billing, invoice generation, dashboard.

---

## 1. What the system does well today

The fundamentals are sound. A normalised Supabase schema (assets → blocks → units → leases → tenants) drives everything; nothing is duplicated in the UI layer. The billing engine generates rent charges from charge profiles with per-lease VAT treatment, and the electric engine derives charges from meter readings with block-level rates — both verified to the penny against real issued invoices. Payments are a proper cash-receipt journal with an allocations ledger (`payments` → `payment_allocations` → `charge_records`), typed by RENT/ELECTRIC, with oldest-first allocation within type. Invoice PDFs reproduce the firm's actual stationery for three issuing entities and follow HMRC full-VAT-invoice requirements where VAT applies. Reporting views (`v_electric_usage`, `v_meter_usage`, `v_payment_register`, `v_charge_ledger`) mean any future report is a query, not a rebuild.

## 2. Critical findings (in priority order)

**C1. No authentication — currently acceptable, fatal after deployment.**
The app runs with the service-role key server-side and the anon key client-side with open read policies. Fine on localhost; unacceptable on Vercel. *Before deploying:* add Supabase Auth with a login screen, restrict anon SELECT policies, and move all RPC mutations behind authenticated policies. The SECURITY DEFINER functions are currently executable by `anon` — anyone with the URL could record payments.

**C2. Charge mutation history is single-valued.**
`charge_records.payment_amount` is a running total, not a history (the allocations table is the history — good — but `fn_record_payment` from Stage 3 still exists and *overwrites* rather than accumulates). Remove or fix the legacy `fn_record_payment` and the old per-charge payment form so there is exactly one write path.

**C3. No audit trail.**
Payments and charges can be created but not corrected. A mis-keyed payment today requires SQL surgery. Add: void/reverse payment function (creating an offsetting record, never deleting), and an `entered_by` on payments once auth exists. The `significant_events` table from the Architecture Spec exists but is unused — wire correction events into it.

**C4. Charge generation is manual and forgettable.**
Rent charges require someone to click Generate each month; overdue status requires `fn_update_arrears` to run. Add `pg_cron` jobs: 1st of month → generate DRAFT rent charges (respecting QUARTERLY/ANNUAL frequencies — currently only monthly generation has been exercised); daily → refresh arrears/lease states. Quarterly and annual frequency billing (One Below, Mencap, Swarco, Daahqan 6B) has **not yet been tested end-to-end** — verify before the next quarter day.

**C5. Invoice references are derived, not recorded.**
References (R2607-U25) are computed at render time. If a unit reference or scheme ever changes, historical PDFs regenerate differently. Store the reference on `charge_records` at issue time; render from the stored value.

**C6. Tenant contact data is incomplete.**
Email/phone fields are largely empty. Dispatch (email/WhatsApp) is blocked on this. A simple contacts editor on the lease page plus a bulk import would unblock it.

## 3. Improvement roadmap

**Now (before Vercel):** kill legacy payment path (C2); store invoice refs (C5); payment void function (C3); test quarterly/annual billing (C4); tenant contact editor (C6).

**Deploy phase:** Supabase Auth + RLS hardening (C1) → GitHub → Vercel → pg_cron automation.

**Next quarter:** Email dispatch (Gmail SMTP per entity) with send-log table; WhatsApp click-to-send for Peartree; CSV/Excel export buttons on matrix and registers (the owner lives in Excel — meet him there); arrears escalation workflow (the Architecture Spec's state machine §828 is built in SQL but unused in UI); vacant unit + void cost tracking (billing-off meters on vacant units already capture void electricity).

**Later / strategic:** supplier bill reconciliation screen (enter the actual British Gas/E.ON/TotalEnergies bill, system shows recovery rate vs tenant billing); tenant statements (one PDF per tenant: all charges + payments running balance); management fee module for Southgate (2i is agent — its income is fees, not rent; currently unmodelled); document storage references to OneDrive per spec §1322; multi-user roles (owner vs bookkeeper).

## 4. Design judgements the council endorses

Electric and rent as separate domains with a shared ledger is the right architecture — one `charge_records` table keeps the tenant statement trivial, while separate registers keep workflows clean. Deriving net from gross at display time for VAT-deferred tenants (rather than rewriting stored amounts) preserves the books. The billing-off meter mode (track consumption, raise no invoice) elegantly covers landlord supplies, voids, and departed tenants.

## 5. Known data gaps

Jubilee Church Derby's May electric usage (50 kWh) is in meter history but unbilled — tenant left, no record. Rosehill January-April readings exist only in the owner's Excel (system history starts 24 April 2026). Peartree has no meters (correct — no sub-metering there). EV charger (Swarco) billing frequency recorded as ANNUAL; owner mentioned quarterly VAT — unresolved.

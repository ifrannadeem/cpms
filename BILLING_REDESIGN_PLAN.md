# Billing Page — Redesign Plan
**Prepared:** 23 June 2026
**Scope:** Per-asset Billing page (`app/assets/[reference]/billing/page.tsx`) and supporting SQL.
**Source:** Owner's billing brief (23 Jun) + System Review findings C4/C5.

> **Guiding principle (owner's words):** *"The biggest improvement is not visual, it is process control: preview, validate, generate, issue, track."* This plan is sequenced so the process-control and data-integrity work lands first, cosmetics last.

---

## 0. Context — the VAT incident this plan must prevent

The RBC-A-C VAT problem that prompted this review had a single root cause: **a charge was already generated, and there was no UI path to regenerate or amend it after the lease term changed.** Charges correctly freeze their VAT at generation time, but nothing surfaced the staleness or let the owner refresh it. Phases 1, 3 and 4 below close that gap permanently — duplicate/staleness detection, a regenerate/amend action, and an audit trail.

Already fixed in the database (this session): the June charge corrected to 20% VAT, the contradictory `vat_deferred` flag reset, and `fn_update_lease_terms` patched to keep `vat_treatment` and `vat_deferred` in lockstep.

---

## What already exists (so we build, not rebuild)

| Capability | Status today |
|---|---|
| Month → generate → issue flow | Built (`BillingActions`: Generate Rent Charges + Issue Drafts) |
| Invoice PDF packs per month/type | Built (`/api/invoices`) |
| All / Rent / Electric filter | Built (top-of-table chips) |
| Charge table with per-charge PDF + detail | Built |
| Status lifecycle in data | Enum already supports DRAFT, ISSUED, PAID, PART_PAID, OVERDUE, WRITTEN_OFF, CREDITED |
| Duplicate prevention in SQL | Partial — generator silently skips a lease/month that already has a charge, but the **UI gives no feedback** that it did |
| Audit fields in `v_charge_ledger` | Partial — `issued_date`, `payment_date`, `generated_by`, `notes` exist; **no** `created_by`, `approved_date`, or `email_sent_date` |

The redesign is therefore mostly **surfacing and controlling** what the data layer already supports, plus a few new columns/functions.

---

## Phase 1 — Safer generation workflow + duplicate clarity *(highest value)*
Maps to owner points 1, 3 (duplicate prevention), 9 (regenerate vs generate).

1. **Preview → Approve & Generate.** Replace the single "Generate Rent Charges" click with a two-step: a **Preview** modal listing exactly what *will* be created (tenant, unit, net, VAT, gross) for the selected month, with a count, before anything is written. "Approve & Generate" commits.
2. **"Already generated?" state.** For the selected month, detect whether rent charges exist. If they do, the button changes to **View Existing** / **Regenerate Drafts** (regenerate only touches DRAFT charges — never ISSUED/PAID), instead of silently doing nothing.
3. **Amend / regenerate a single charge.** A per-row action to re-pull a DRAFT charge's amount and VAT from the current lease profile (this is the direct fix for the RBC-A-C class of problem). ISSUED+ charges are amended via a credit/void path (Phase 3), never edited in place.

*DB work:* small `fn_preview_asset_rent_charges` (read-only dry-run returning the same rows the generator would insert); a `fn_regenerate_draft_charge(charge_id)`.

---

## Phase 2 — Top cards & totals, rent/electric split *(most visible quick win)*
Maps to owner points 10 (separate rent/electric), 11–20 (card redesign).

Replace the four current tiles (Total Charges / Outstanding / Drafts / Overdue) with rent-vs-electric splits:

| Card | Rent | Electric |
|---|---|---|
| Charges this month | count | count |
| Gross billed | £ | £ |
| Outstanding | £ | £ |
| Overdue (>1 billing period old) | £ | £ |
| Drafts | count (combined, paired with value) |

Plus a **filter bar with live totals**: "Rent: £x outstanding · Electric: £y outstanding". All derivable from `v_charge_ledger` (has `outstanding_amount`, `days_overdue`, `charge_type`) — no new SQL.

---

## Phase 3 — Invoice lifecycle + void/credit
Maps to owner points 23 (lifecycle) and the System Review C3 (no corrections path).

1. **Surface the full lifecycle** already in the enum: Draft → (Approved) → Issued → Paid / Part-paid → Overdue → Voided/Credited. Add an **Approved** intermediate status if the owner wants generate and issue to be distinct gates (recommended, given the preview workflow).
2. **Void / credit function.** `fn_void_charge(charge_id, reason)` — never deletes; sets status to CREDITED/WRITTEN_OFF and writes a reason. This is how an ISSUED charge with wrong VAT gets corrected (void + regenerate), preserving the books.

*DB work:* `fn_void_charge`; optional `APPROVED` status handling in the generator/issue functions.

---

## Phase 4 — Audit trail per charge
Maps to owner point 27 — *"very important later when chasing arrears."*

Show, per charge: **Created by · Created date · Issued date · Email sent date · Payment matched date.** Created date and issued date exist; `created_at` and `generated_by` are on the table but not exposed in the ledger view. Need to add: `created_by` (once auth exists — until then `generated_by`), and `email_sent_date` (lands with dispatch, Phase 6 / future). Wire correction events into the existing-but-unused `significant_events` table.

*DB work:* extend `v_charge_ledger` with `created_at`; add `email_sent_date` column to `charge_records` (nullable, populated later by dispatch).

---

## Phase 5 — Billing-readiness check + exception highlighting
Maps to owner points 2–8 (readiness panel) and 24–25 (exceptions before generation).

Before the Preview, show a readiness panel for the selected month:
- N active tenancies · N rent charges expected · 0 missing rent amounts · N periodic tenancies · N VAT-deferred / unusual VAT · **N missing invoice contact emails**.
- Exceptions (missing email, £0 rent on a non-rent-free lease, contradictory VAT flags like the one we just fixed) listed **before** generation, not discovered after.

Most of this is a single aggregate query over `leases` + `charge_profiles` + `tenants`; the missing-email count uses `accounts_contact_email` (already in the ledger view — System Review C6 notes it's largely empty, so this will be a genuinely useful nudge).

---

## Phase 6 — Batch actions & pack history
Maps to owner points 21 (Export CSV), 26 (billing-pack history).

1. **Export CSV** button above the table (current view, respecting the active filter).
2. **Billing-pack history**, expanding the current PDF section: per pack show generated date, invoice count, total, and Download / Regenerate (Email pack deferred until dispatch exists). E.g. *"Rent — June 2026 · Generated 12 Jun · 29 invoices · £16,657."*

---

## Suggested build order & rough effort

| Phase | Owner points | Effort | Why this order |
|---|---|---|---|
| 1. Safer workflow + regenerate | 1, 3, 9 | M | Directly prevents the VAT incident; core process control |
| 2. Cards & rent/electric split | 10, 11–20 | S | Visible, low-risk, no new SQL |
| 3. Lifecycle + void/credit | 23, +C3 | M | Needed before real invoices are dispatched |
| 4. Audit trail | 27 | S–M | Cheap once lifecycle exists |
| 5. Readiness + exceptions | 2–8, 24–25 | M | Builds on Phase 1 preview |
| 6. Batch actions + pack history | 21, 26 | S | Nice-to-have, independent |

S ≈ half a session · M ≈ one focused session. Phases 1–2 together make the most sense as the first build; they deliver the owner's top priority (process control) plus the quick visible win, with Phase 1 permanently closing the bug that started this.

---

## Dependencies / open questions
- **Approved status** — do you want generate and issue to be two distinct gates (Draft → Approved → Issued), or keep Draft → Issued? Affects Phases 1 & 3.
- **Email sent date / Email pack** — depend on the dispatch feature (Gmail SMTP per entity), not yet built. Audit and pack-history will leave those columns blank until then.
- **Created by** — meaningful only once authentication exists (System Review C1). Until then we show `generated_by` (SYSTEM/owner).

---

## Phase 7 — Email dispatch automation (future)

**Foundation already built (June 2026):** `Issued` and `Sent` are separate; `charge_records.sent_date` / `sent_method` record delivery; `tenants.preferred_delivery_method` (EMAIL / WHATSAPP / POST) sets each tenant's channel, editable in the contacts editor. The Invoicing: Rent screen supports per-row and bulk "Mark as sent", defaulting to each tenant's preferred method.

**To automate:**
- One-click **Send** on the Invoicing screen routes by each tenant's `preferred_delivery_method`:
  - **EMAIL** tenants → system emails the invoice PDF from the correct issuing entity, stamps `sent_date`/`sent_method` automatically. Leaning Gmail (per owner) — likely Gmail API / SMTP per entity; keep a dedicated transactional service (Resend/Postmark) as the fallback if deliverability or volume becomes an issue.
  - **WHATSAPP / POST** tenants → flagged as "needs manual send"; owner sends and the row's "Mark sent" records it.
- **Send log** table: per-invoice send attempts, channel, recipient, status (sent/failed/bounced), timestamp — for audit and resend.
- **Per-entity sender identity** (Rosehill / Peartree / Southgate) so tenants see the invoice from the right managing entity; email template per entity.
- **Guardrails:** explicit "send to N tenants" confirmation; test-send-to-self per entity before go-live; never auto-fire silently.
- **Prerequisites:** verify tenant email accuracy (all populated, accuracy TBD in owner review); capture phone numbers before any WhatsApp automation (currently empty for all tenants); decide Gmail vs dedicated service at build time (whichever is simpler then).
- **Same pattern** will apply to the future "Invoicing: Electric" screen.

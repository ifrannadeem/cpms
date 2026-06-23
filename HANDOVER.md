# Commercial Portfolio Operating System — Development Handover
**Prepared for:** New development session  
**Date:** June 2026  
**Client:** 2i Investments Limited  
**System name:** Commercial Portfolio Operating System (CPMS)

---

## 1. Project Overview

2i Investments Limited manages a portfolio of three commercial properties in the UK. The CPMS is an internal web-based system for managing leases, billing tenants, recording payments, and maintaining a portfolio overview across those three assets.

**The three assets:**
| Reference | Asset Name | Role |
|---|---|---|
| ASSET-001 | Rosehill Business Centre | Owned — landlord |
| ASSET-002 | Peartree Plaza | Owned — landlord |
| ASSET-003 | Southgate Retail Park | Managed — 2i acts as agent only (`income_owned = false`) |

Southgate should be excluded from owned-portfolio views by default. It is included in the system for management purposes but 2i does not receive rental income there.

---

## 2. Source Materials

All source documents are in the project root:

**`C:\Users\ifran\Documents\Claude Cowork\Projects\Commercial Property Management System\`**

| File | Purpose |
|---|---|
| `Commercial_POS_Architecture_Specification_v1.0_1.docx` | Full system design: entity model, billing engine rules, lease event engine, state machine, data relationships. **Read this first.** |
| `Commercial_POS_Stage1_Data_Specification_v3.1_2.xlsx` | Seed data for all three assets — 59 leases, tenants, utility rates, rent incentives. |
| `schema.sql` | The Supabase database schema as built (generated from Architecture Spec Section 3) |
| `seed.sql` | The full seed data SQL (generated from Data Specification v3.1) |
| `stage2_lease_event_engine.sql` | SQL for the lease state machine and alert functions |
| `stage3_billing_engine.sql` | SQL for charge generation, VAT logic, and payment recording |
| `AGENTS.md` | Instructions for AI agents working on this codebase |

**Archive folder** (`Archive/`) contains original Excel tenancy schedules used as inputs — useful for cross-referencing data.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Database | Supabase (Postgres). Project ID: `jkpftidophjivmaqpkuu` |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Auth | Supabase Auth (configured but not yet enforced — no login screen) |
| Hosting | Vercel (not yet deployed — system is local dev only) |
| File storage | OneDrive (documents stored externally — system stores references, not files) |

**Environment variables** are in `.env.local` at the project root. This file is not committed to git.

**To run locally:**
```
cd "C:\Users\ifran\Documents\Claude Cowork\Projects\Commercial Property Management System"
npm run dev
```
Then open `http://localhost:3000`

---

## 4. Project File Structure

```
Commercial Property Management System/
├── app/
│   ├── page.tsx                          # Dashboard (portfolio KPI tiles + alerts)
│   ├── layout.tsx                        # Root layout with sidebar
│   ├── leases/
│   │   └── page.tsx                      # Lease Register (filterable, all assets)
│   ├── billing/
│   │   └── page.tsx                      # Global billing page (LEGACY — superseded)
│   └── assets/
│       └── [reference]/
│           ├── page.tsx                  # Asset detail — lease list with tab bar
│           ├── billing/
│           │   ├── page.tsx              # Per-asset billing page
│           │   ├── billing-actions.tsx   # Generate/issue buttons (client component)
│           │   └── [chargeId]/
│           │       ├── page.tsx          # Charge detail page
│           │       └── payment-form.tsx  # Payment recording form (client component)
│           └── leases/
│               └── [leaseId]/
│                   └── page.tsx          # Individual lease/tenancy detail page
├── components/
│   ├── sidebar.tsx                       # Navigation sidebar
│   ├── leases/
│   │   ├── lease-register-client.tsx     # Filterable lease register (client)
│   │   ├── lease-table.tsx               # Per-asset lease table
│   │   └── notes-editor.tsx              # Freetext notes on leases
│   ├── dashboard/
│   │   ├── portfolio-tiles.tsx           # KPI tiles
│   │   └── alerts-panel.tsx             # Lease alerts
│   └── ui/                               # shadcn/ui base components
├── lib/
│   ├── supabase.ts                       # Server-side Supabase client (SERVICE_ROLE_KEY)
│   ├── types.ts                          # TypeScript types
│   └── utils.ts                          # Utility functions
├── Commercial_POS_Architecture_Specification_v1.0_1.docx
├── Commercial_POS_Stage1_Data_Specification_v3.1_2.xlsx
├── schema.sql
├── seed.sql
├── stage2_lease_event_engine.sql
├── stage3_billing_engine.sql
└── AGENTS.md
```

---

## 5. Database State (Supabase)

**Project ID:** `jkpftidophjivmaqpkuu`

### Tables (all live and seeded)
- `assets` — 3 assets, `income_owned` flag set (ASSET-003 = false)
- `units` — all units across all three assets
- `tenants` — all tenants
- `leases` — 59 leases seeded
- `lease_units` — junction table (lease ↔ unit, many-to-many)
- `charge_profiles` — one per lease, defines VAT treatment and billing frequency
- `charge_records` — generated charges (DRAFT → ISSUED → PAID / PART_PAID / OVERDUE)
- `payments` — payment records linked to charges
- `utility_rates` — electricity/utility rates per asset
- `rent_incentives` — rent-free and other incentive records

### Key rules
- `gross_amount` on `charge_records` is a **GENERATED ALWAYS** column (`net_amount + vat_amount`). Never include it in INSERT statements.
- VAT: `STANDARD` = 20%. All other treatments (VAT_DEFERRED, EXEMPT, ZERO_RATED, OUTSIDE_SCOPE) = 0%.
- 2i Investments Limited and As-Siraat charity have `applies=FALSE, active=FALSE` on their charge profiles — they must never be billed.

### Views
- `v_lease_register` — joins assets, tenants, units; includes `asset_name`, `asset_reference`, `income_owned`, lease dates, alerts
- `v_charge_ledger` — joins charge_records with lease/tenant/unit data for billing display

### Stored Functions
| Function | Purpose |
|---|---|
| `fn_generate_rent_charges(p_billing_month DATE)` | Generate DRAFT charges for all leases (global) |
| `fn_generate_asset_rent_charges(p_billing_month DATE, p_asset_id UUID)` | Generate DRAFT charges for one asset only |
| `fn_issue_asset_drafts(p_asset_id UUID)` | Move all DRAFT charges to ISSUED for one asset |
| `fn_record_payment(p_charge_id UUID, p_payment_amount NUMERIC, p_payment_date DATE)` | Record a payment against a specific charge |

---

## 6. What Is Working

- **Dashboard** — renders with portfolio tiles and alerts panel (data partially live)
- **Lease Register** (`/leases`) — filterable by asset (chips), Southgate excluded by default, all columns sortable, rent roll total updates live, links to lease detail pages
- **Asset pages** (`/assets/ASSET-001`, `/assets/ASSET-002`, `/assets/ASSET-003`) — lease table with Leases/Billing tab bar
- **Lease detail** (`/assets/[reference]/leases/[leaseId]`) — full lease terms, dates, rent figures, freetext notes
- **Per-asset billing** (`/assets/[reference]/billing`) — generate monthly rent charges, issue all drafts, charge table with status badges, links to charge detail
- **Charge detail** (`/assets/[reference]/billing/[chargeId]`) — shows charge breakdown; payment form available for ISSUED/OVERDUE/PART_PAID charges

---

## 7. What Is NOT Done — Outstanding Work

### 7.1 User-specified UX changes (confirmed requirements, not yet built)

**A. Invoices visible at the lease/unit level**  
The owner wants to click into a tenancy (e.g. Unit 10) and see that tenant's invoices listed there. Currently, all invoices are only visible on the asset billing page. The lease detail page (`/assets/[reference]/leases/[leaseId]/page.tsx`) needs a "Charges" section that queries `v_charge_ledger` filtered by `lease_id` and displays a table of invoices with status, period, and amount.

**B. Payment recording redesign — global cash receipt journal per asset**  
The current implementation records payments against individual charges (one form per charge). The owner wants to replace this with a different model:
- One **payment register page per asset** (e.g. `/assets/ASSET-001/payments`)
- Table shows: Payment Date | Amount | Method | Notes
- Each payment entry is auto-allocated to the **most recent unpaid/outstanding month** for that tenant
- This is a cash receipt / bank reconciliation approach, not a charge-by-charge model
- The current `fn_record_payment` function and `payment-form.tsx` should be replaced or supplemented by a new asset-level payment page

This requires:
1. A new page: `app/assets/[reference]/payments/page.tsx`
2. A new client component for entering payments
3. A new SQL function `fn_record_asset_payment(p_asset_id, p_tenant_id, p_amount, p_date, p_method, p_notes)` that auto-matches to oldest unpaid charge
4. Adding a "Payments" tab to the asset tab bar

### 7.2 Unbuilt features (from Architecture Specification)

**C. Utility/electricity billing**  
Meter registration UI does not exist. The system has a `utility_rates` table but no UI for recording meter readings or calculating consumption-based charges. This is deferred until meters are set up in the field.

**D. Document generation — PDF invoices and rent demand letters**  
No document generation exists. The Architecture Spec envisages per-asset letterhead templates and the ability to generate/print rent demand letters as PDFs. Each asset (Rosehill, Peartree, Southgate) has its own managing entity and branding. Documents should be stored by reference in OneDrive, not as files in the database.

**E. Dashboard — real data**  
The dashboard tiles and alerts panel exist as components but are not fully connected to live Supabase data. Needs: total rent roll, total outstanding charges, number of leases by state, upcoming expiries (30/60/90 day), upcoming rent reviews.

**F. Deployment to Vercel**  
The system runs locally only. It has not been deployed. Vercel deployment requires: pushing to a GitHub repo, connecting to Vercel, adding environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).

**G. Authentication / access control**  
Currently there is no login screen. The system is open. Supabase Auth is configured but not enforced. Row-level security (RLS) policies exist in the schema but the frontend bypasses them using the service role key. A login screen and proper RLS enforcement should be added.

**H. Southgate billing model**  
Southgate is a managed asset — 2i receives management fees, not rent. The billing model for Southgate may differ from Rosehill/Peartree. This has not been designed or built. The Architecture Spec should be consulted.

---

## 8. Recommendations for Improvement

**1. Payment model first, before adding more billing features.**  
The current per-charge payment form is not how a property manager thinks about payments. Tenants pay monthly by standing order; the manager reconciles against a list. The global payment register model the owner described (Section 7.1B above) should be built before anything else, as it changes the fundamental payment flow.

**2. Automate charge generation on a schedule.**  
Currently someone must manually click "Generate" each month. A Supabase cron job (via pg_cron or a Vercel cron route) should generate DRAFT charges automatically on the 1st of each month, then notify by email that charges are ready to review before issuing.

**3. Lease expiry and rent review alerts need to be prominent.**  
The `v_lease_register` already computes `alert_priority` and `active_alert_types`. These should drive a clear alert banner on the dashboard — "3 leases expiring in the next 90 days" and "2 rent reviews due". Currently the alerts panel is a component but not prominently surfaced.

**4. Add a "Vacant units" view.**  
The system tracks units but has no way to see which units are currently unoccupied. A simple query joining `units` LEFT JOIN `lease_units` where `lease_state = 'ACTIVE'` would show vacancies. Useful for asset management and letting.

**5. Southgate should have a separate management fee model.**  
Southgate leases exist in the system, but since 2i is agent not landlord, the financials work differently. Consider a separate charge type for management fee invoices to the freeholder, rather than rent demand letters to tenants.

**6. Notes on lease detail should persist properly.**  
The `NotesEditor` component exists but stores notes on `v_lease_register.notes`. Confirm the underlying `leases.notes` column exists and is being written correctly via the Supabase update call.

**7. Deploy early.**  
Running on localhost is fragile. Even a basic Vercel deployment without auth would allow the owner to access the system from any device. This should be done as soon as the payment model is stable.

**8. Consider read-only RLS for Vercel.**  
Once deployed, the anon key (used in client components) should only have read access via RLS policies. All mutations (generate charges, record payments) should go through server actions or API routes that use the service role key server-side — not expose it to the browser.

---

## 9. Key Technical Rules for the Next Developer

1. **Server components** use `@/lib/supabase` (service role key, server-only). Never import this in a client component.
2. **Client components** (`'use client'`) must use `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)` directly.
3. **Never INSERT `gross_amount`** — it is a `GENERATED ALWAYS AS` column.
4. **PowerShell scripts** in this folder use `String.fromCharCode()` for the £ sign and em dash. Do not write `£` or `—` as literals in .ps1 files (PowerShell 5.1 encoding issues).
5. **Paths with square brackets** (e.g. `app/assets/[reference]`) require `Test-Path -LiteralPath` and `[System.IO.Directory]::CreateDirectory()` in PowerShell.
6. **`router.refresh()`** must be called after any Supabase mutation in a client component to re-fetch server component data.
7. **Next.js 15 App Router**: `params` is a `Promise` and must be awaited: `const { reference } = await params`.
8. Read `AGENTS.md` at the project root before making changes — it contains framework-specific rules.

---

## 10. Suggested Next Session Priorities (in order)

1. Build the global payment register per asset (Section 7.1B) — this is the owner's top priority
2. Add charges/invoices tab to lease detail page (Section 7.1A)
3. Wire up the dashboard with live data (Section 7.2E)
4. Deploy to Vercel (Section 7.2F)
5. PDF invoice/rent demand generation (Section 7.2D)
6. Utility billing UI (Section 7.2C)
7. Authentication (Section 7.2G)

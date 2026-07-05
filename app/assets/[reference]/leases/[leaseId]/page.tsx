import { supabase } from '@/lib/supabase'
import { unitLabels as formatUnit } from '@/lib/format'
import Link from 'next/link'
import NotesEditor from '@/components/leases/notes-editor'
import TenantEditor, { type TenantDetails } from '@/components/leases/tenant-editor'
import LeaseTermsEditor, { type LeaseTerms } from '@/components/leases/lease-terms-editor'
import PropertyTenancyEditor, { type LeaseProperty } from '@/components/leases/property-tenancy-editor'
import RentReviewEditor, { type LeaseReview } from '@/components/leases/rent-review-editor'
import ActivityLog, { type ActivityEntry } from '@/components/leases/activity-log'
import IncentivesEditor, { type Incentive } from '@/components/leases/incentives-editor'
import TenancyActions from '@/components/leases/tenancy-actions'
import LeaseDocument from '@/components/leases/lease-document'

interface Props {
  params: Promise<{ reference: string; leaseId: string }>
}

const UNIT_TYPE_LABEL: Record<string, string> = {
  OFFICE: 'Office', RETAIL: 'Retail', WORKSHOP: 'Workshop', STORAGE: 'Storage', OTHER: 'Other',
}

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)

function fmt(v: number | string | null | undefined): string {
  if (v == null || v === '') return DASH
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return DASH
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return DASH
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-800',
    PERIODIC: 'bg-amber-100 text-amber-800',
    APPROACHING_EXPIRY: 'bg-orange-100 text-orange-800',
    APPROACHING_REVIEW: 'bg-blue-100 text-blue-800',
    TERMINATED: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[state] ?? 'bg-gray-100 text-gray-700'}`}>
      {state.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  )
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  PART_PAID: 'bg-amber-100 text-amber-800',
  OVERDUE: 'bg-red-100 text-red-700',
  WRITTEN_OFF: 'bg-gray-100 text-gray-500',
  CREDITED: 'bg-purple-100 text-purple-700',
}

function statusLabel(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')
}

function tenancyTypeLabel(leaseType: string | null, leaseState: string | null): string {
  if (leaseType === 'FIXED_TERM' && leaseState === 'PERIODIC') return 'Fixed Term - now Periodic (holding over)'
  if (leaseType === 'FIXED_TERM') return 'Fixed Term'
  if (leaseType === 'PERIODIC') return 'Periodic'
  if (leaseType === 'TENANCY_AT_WILL') return 'Tenancy at Will'
  return DASH
}

/** "8 years, 9 months" */
function durationVerbose(fromIso: string | null, toIso?: string | null): string | null {
  if (!fromIso) return null
  const from = new Date(fromIso)
  const to = toIso ? new Date(toIso) : new Date()
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (months < 0) return null
  const years = Math.floor(months / 12)
  months = months % 12
  const y = years > 0 ? `${years} year${years !== 1 ? 's' : ''}` : ''
  const m = months > 0 ? `${months} month${months !== 1 ? 's' : ''}` : ''
  if (y && m) return `${y}, ${m}`
  return y || m || 'Less than a month'
}

const FREQ_LABEL: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUAL: 'Annual' }
const INCENTIVE_LABEL: Record<string, string> = {
  RENT_FREE: 'Rent free', FIXED_DISCOUNT: 'Discount', STEPPED_RENT: 'Stepped rent',
}

export default async function TenancyPage({ params }: Props) {
  const { reference, leaseId } = await params

  const [{ data: lease }, { data: leaseRow }, { data: incentives }, { data: charges }] = await Promise.all([
    supabase.from('v_lease_register').select('*').eq('lease_id', leaseId).single(),
    supabase
      .from('leases')
      .select('lease_type, lease_state, permitted_use, original_start_date, commencement_date, expiry_date, annual_rent, billing_frequency, billing_day, next_rent_review_date, rent_review_basis, rent_review_frequency_months, last_review_date, break_clause_date, break_clause_party, insurance_recharge, deposit_amount, deposit_type, document_id, tenant_id')
      .eq('lease_id', leaseId)
      .single(),
    supabase
      .from('rent_incentives')
      .select('incentive_id, incentive_type, headline_amount_annual, discount_amount_monthly, billed_amount_monthly, incentive_start_date, incentive_end_date, active')
      .eq('lease_id', leaseId)
      .order('incentive_start_date', { ascending: true }),
    supabase
      .from('v_charge_ledger')
      .select('charge_id, charge_type, period_start, period_end, gross_amount, status, outstanding_amount')
      .eq('lease_id', leaseId)
      .order('period_start', { ascending: false }),
  ])

  if (!lease || !leaseRow) {
    return (
      <div className="p-8">
        <p className="text-red-500 mb-4">Tenancy not found.</p>
        <Link href={`/assets/${reference}`} className="text-blue-600 hover:underline text-sm">
          {String.fromCharCode(0x2190)} Back to asset
        </Link>
      </div>
    )
  }

  const [{ data: tenantRecord }, { data: rentProfile }, { data: leaseUnits }, { data: activity }] = await Promise.all([
    supabase
      .from('tenants')
      .select('tenant_id, legal_name, trading_name, company_number, primary_contact_name, primary_contact_email, primary_contact_phone, accounts_contact_name, accounts_contact_email, accounts_contact_phone, emergency_contact_name, emergency_contact_phone, director_name, correspondence_address, preferred_delivery_method')
      .eq('tenant_id', leaseRow.tenant_id)
      .single(),
    supabase
      .from('charge_profiles')
      .select('vat_treatment')
      .eq('lease_id', leaseId)
      .eq('charge_type', 'RENT')
      .limit(1)
      .maybeSingle(),
    supabase.from('lease_units').select('unit_id').eq('lease_id', leaseId),
    supabase
      .from('tenant_activity')
      .select('activity_id, activity_type, activity_at, summary')
      .eq('tenant_id', leaseRow.tenant_id)
      .order('activity_at', { ascending: false })
      .limit(100),
  ])

  // Lease document (stored by reference per architecture spec)
  let leaseDoc: { document_name: string | null; file_reference: string | null } | null = null
  if (leaseRow.document_id) {
    const { data: doc } = await supabase
      .from('documents')
      .select('document_name, file_reference')
      .eq('document_id', leaseRow.document_id)
      .maybeSingle()
    leaseDoc = doc
  }

  // Electric recharge: any active meter on this lease's units?
  const unitIds = (leaseUnits ?? []).map(u => u.unit_id)
  let electricRecharge = false
  if (unitIds.length > 0) {
    const { data: activeMeters } = await supabase
      .from('meters')
      .select('meter_id, active')
      .in('unit_id', unitIds)
    electricRecharge = (activeMeters ?? []).some(m => m.active !== false)
  }

  const chargeRows = charges ?? []
  const isOpen = (c: { status: string }) => ['ISSUED', 'OVERDUE', 'PART_PAID'].includes(c.status)
  const rentOutstanding = chargeRows
    .filter(c => isOpen(c) && c.charge_type === 'RENT')
    .reduce((s, c) => s + parseFloat(c.outstanding_amount ?? '0'), 0)
  const electricOutstanding = chargeRows
    .filter(c => isOpen(c) && c.charge_type === 'ELECTRIC')
    .reduce((s, c) => s + parseFloat(c.outstanding_amount ?? '0'), 0)
  const totalOutstanding = chargeRows
    .filter(isOpen)
    .reduce((s, c) => s + parseFloat(c.outstanding_amount ?? '0'), 0)

  // Rent: headline vs current
  const today = new Date().toISOString().slice(0, 10)
  const incentiveList = incentives ?? []
  const activeIncentive = incentiveList.find(i =>
    i.active !== false &&
    (!i.incentive_start_date || i.incentive_start_date <= today) &&
    (!i.incentive_end_date || i.incentive_end_date >= today)
  )
  const headlineAnnual = activeIncentive?.headline_amount_annual != null
    ? parseFloat(activeIncentive.headline_amount_annual)
    : (leaseRow.annual_rent != null ? parseFloat(leaseRow.annual_rent) : null)
  const currentMonthly = activeIncentive?.billed_amount_monthly != null
    ? parseFloat(activeIncentive.billed_amount_monthly)
    : (headlineAnnual != null ? headlineAnnual / 12 : null)

  const unitType = lease.unit_types?.split(', ')[0] ?? ''
  const unitTypeLabel = UNIT_TYPE_LABEL[unitType] ?? unitType
  const unitDisplay = formatUnit(lease.unit_references)

  // Rent review & renewal block
  const isPeriodic = leaseRow.lease_state === 'PERIODIC'
  const daysUntil = (d: string | null) =>
    d ? Math.round((new Date(d).getTime() - Date.now()) / 86400000) : null
  const reviewDays = daysUntil(leaseRow.next_rent_review_date)
  const expiryDays = daysUntil(leaseRow.expiry_date)
  let actionRequired = 'None'
  if (isPeriodic) {
    actionRequired = `None ${DASH} periodic tenancy; formalise only if commercially desirable`
  } else if (reviewDays != null && reviewDays >= 0 && reviewDays <= 180) {
    actionRequired = `Initiate rent review ${DASH} due in ${reviewDays} days`
  } else if (expiryDays != null && expiryDays >= 0 && expiryDays <= 180) {
    actionRequired = `Begin renewal discussions ${DASH} lease ends in ${expiryDays} days`
  }

  const detailRows: [string, React.ReactNode][] = [
    ['Unit Reference', <span key="r" className="font-mono">{lease.lease_reference}</span>],
    ['Property', `${unitDisplay}${unitTypeLabel ? ` / ${unitTypeLabel}` : ''}`],
    ['Lease Document', (
      <LeaseDocument
        key="doc"
        leaseId={leaseId}
        documentName={leaseDoc?.document_name ?? null}
        fileReference={leaseDoc?.file_reference ?? null}
      />
    )],
  ]

  const leaseProperty: LeaseProperty = {
    lease_id: leaseId,
    lease_type: leaseRow.lease_type,
    lease_state: leaseRow.lease_state,
    permitted_use: leaseRow.permitted_use,
    commencement_date: leaseRow.commencement_date,
    expiry_date: leaseRow.expiry_date,
    original_start_date: leaseRow.original_start_date,
    billing_frequency: leaseRow.billing_frequency,
    billing_day: leaseRow.billing_day != null ? Number(leaseRow.billing_day) : null,
  }

  const leaseReview: LeaseReview = {
    lease_id: leaseId,
    next_rent_review_date: leaseRow.next_rent_review_date,
    rent_review_basis: leaseRow.rent_review_basis,
    rent_review_frequency_months: leaseRow.rent_review_frequency_months != null ? Number(leaseRow.rent_review_frequency_months) : null,
    last_review_date: leaseRow.last_review_date,
    renewal_due: isPeriodic
      ? `Rolling ${DASH} renewal possible at any time`
      : (leaseRow.expiry_date ? fmtDate(leaseRow.expiry_date) : DASH),
    action_required: actionRequired,
    action_highlight: actionRequired !== 'None' && !isPeriodic,
  }

  const leaseTerms: LeaseTerms = {
    lease_id: leaseId,
    permitted_use: leaseRow.permitted_use,
    vat_treatment: rentProfile?.vat_treatment ?? null,
    insurance_recharge: leaseRow.insurance_recharge === true,
    deposit_amount: leaseRow.deposit_amount != null ? parseFloat(leaseRow.deposit_amount) : null,
    deposit_type: leaseRow.deposit_type,
    annual_rent: leaseRow.annual_rent != null ? parseFloat(leaseRow.annual_rent) : null,
    electric_recharge: electricRecharge,
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">
          {lease.asset_name ?? reference}
        </Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{unitDisplay}</span>
      </nav>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{lease.tenant_name}</h1>
          <p className="text-slate-500 mt-1">{unitDisplay}, {lease.asset_name}</p>
        </div>
        <StateBadge state={leaseRow.lease_state ?? 'ACTIVE'} />
      </div>

      {/* Current position */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Current Rent</p>
          <p className="text-2xl font-bold text-slate-900">{currentMonthly != null ? fmt(currentMonthly) : DASH}</p>
          <p className="text-xs text-slate-400 mt-1">per month</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Rent Outstanding</p>
          <p className={`text-2xl font-bold ${rentOutstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmt(rentOutstanding)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Electric Outstanding</p>
          <p className={`text-2xl font-bold ${electricOutstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmt(electricOutstanding)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Outstanding</p>
          <p className={`text-2xl font-bold ${totalOutstanding > 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmt(totalOutstanding)}</p>
        </div>
      </div>

      {/* Property & tenancy */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Property &amp; Tenancy</h2>
        <div className="divide-y divide-slate-100">
          {detailRows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[180px_1fr] gap-4 py-2.5 items-baseline">
              <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
              <div className="text-sm text-slate-900">{value}</div>
            </div>
          ))}
        </div>
        <PropertyTenancyEditor lease={leaseProperty} />
      </div>

      {/* Financial terms */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Financial Terms</h2>
        <div className="grid grid-cols-[180px_1fr] gap-4 py-2.5 items-baseline border-b border-slate-100">
          <div className="text-xs text-slate-400 uppercase tracking-wide">Rent</div>
          <div className="text-sm text-slate-900">
            Headline: <span className="font-medium">{headlineAnnual != null ? fmt(headlineAnnual) + ' pa' : DASH}</span>
            <span className="text-slate-300 mx-2">|</span>
            Current: <span className="font-medium">{currentMonthly != null ? fmt(currentMonthly) + ' / month' : DASH}</span>
          </div>
        </div>
        <LeaseTermsEditor terms={leaseTerms} />

        <IncentivesEditor leaseId={leaseId} incentives={incentiveList as Incentive[]} />
      </div>

      {/* Rent review & renewal */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Rent Review &amp; Renewal</h2>
        <RentReviewEditor review={leaseReview} />
      </div>

      {/* Tenancy actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Tenancy Actions</h2>
        <TenancyActions
          leaseId={leaseId}
          assetReference={reference}
          tenantName={lease.tenant_name}
          currentAnnualRent={leaseRow.annual_rent != null ? parseFloat(leaseRow.annual_rent) : null}
          currentExpiry={leaseRow.expiry_date}
        />
      </div>

      {/* Tenant details */}
      {tenantRecord && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-5">Tenant Details</h2>
          <TenantEditor tenant={tenantRecord as TenantDetails} />
        </div>
      )}

      {/* Charges side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {([['Rent Charges', 'RENT', rentOutstanding], ['Electric Charges', 'ELECTRIC', electricOutstanding]] as [string, string, number][]).map(([title, type, outstanding]) => {
          const typeRows = chargeRows.filter(c => c.charge_type === type)
          return (
            <div key={type} className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
                {title}
                {outstanding > 0 && (
                  <span className="ml-2 font-normal normal-case text-red-600 text-sm">
                    {fmt(outstanding)} outstanding
                  </span>
                )}
              </h2>
              {typeRows.length === 0 ? (
                <p className="text-sm text-slate-400">No {type === 'RENT' ? 'rent' : 'electric'} charges raised yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-200">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                        <th className="px-2 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Gross</th>
                        <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {typeRows.map(c => (
                        <tr key={c.charge_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-2 py-2 text-xs text-slate-600 whitespace-nowrap">
                            {fmtDate(c.period_start)} {DASH} {fmtDate(c.period_end)}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">{fmt(c.gross_amount)}</td>
                          <td className="px-2 py-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {statusLabel(c.status)}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            <a href={`/api/invoices?chargeId=${c.charge_id}`} target="_blank"
                              className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline mr-2">PDF</a>
                            <Link href={`/assets/${reference}/billing/${c.charge_id}`}
                              className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline">View</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Activity log */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-5">Activity Log</h2>
        <ActivityLog
          tenantId={leaseRow.tenant_id}
          leaseId={leaseId}
          entries={(activity ?? []) as ActivityEntry[]}
        />
      </div>

      {/* Notes */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Notes</h2>
        <NotesEditor
          leaseId={leaseId}
          assetReference={reference}
          initialNotes={lease.notes ?? ''}
        />
      </div>
    </div>
  )
}

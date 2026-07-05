import { supabase } from '@/lib/supabase'
import { unitLabel } from '@/lib/format'
import Link from 'next/link'
import AssetTabs from '@/components/asset-tabs'

interface Props {
  params: Promise<{ reference: string }>
}

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)

function gbp(n: number, dp = 0): string {
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

const TYPE_LABEL: Record<string, string> = {
  OFFICE: 'Office', RETAIL: 'Retail', WORKSHOP: 'Workshop', STORAGE: 'Storage', OTHER: 'Other',
}

const ACTIVITY_BADGE: Record<string, { label: string; badge: string }> = {
  CALL:        { label: 'Call',        badge: 'bg-blue-100 text-blue-700' },
  EMAIL:       { label: 'Email',       badge: 'bg-sky-100 text-sky-700' },
  RENT_DEMAND: { label: 'Rent Demand', badge: 'bg-indigo-100 text-indigo-700' },
  COMPLAINT:   { label: 'Complaint',   badge: 'bg-red-100 text-red-700' },
  MAINTENANCE: { label: 'Maintenance', badge: 'bg-amber-100 text-amber-800' },
  SITE_VISIT:  { label: 'Site Visit',  badge: 'bg-emerald-100 text-emerald-700' },
  RENT_REVIEW: { label: 'Rent Review', badge: 'bg-purple-100 text-purple-700' },
  PAYMENT:     { label: 'Payment',     badge: 'bg-emerald-100 text-emerald-700' },
  SYSTEM:      { label: 'System',      badge: 'bg-slate-200 text-slate-600' },
  OTHER:       { label: 'Note',        badge: 'bg-slate-100 text-slate-600' },
}

export default async function AssetOverviewPage({ params }: Props) {
  const { reference } = await params

  const { data: asset } = await supabase
    .from('v_portfolio_health')
    .select('*')
    .eq('asset_reference', reference)
    .single()

  if (!asset) {
    return (
      <div className="p-8">
        <p className="text-red-500 mb-4">Asset not found: {reference}</p>
        <Link href="/" className="text-blue-600 hover:underline text-sm">
          {String.fromCharCode(0x2190)} Back to dashboard
        </Link>
      </div>
    )
  }

  const now = new Date()
  const monthStartISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  // Electric is billed in arrears: a bill only counts as arrears once the tenant
  // has missed a full cycle (i.e. it was due before the start of LAST month... see rule below)
  const prevMonthStartISO = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)

  const [
    { data: liveLeases },
    { data: allLeaseIds },
    { data: leaseUnits },
    { data: units },
    { data: openCharges },
    { data: rentProfiles },
    { data: arrears },
    { data: monthPayments },
  ] = await Promise.all([
    supabase
      .from('leases')
      .select('lease_id, tenant_id, lease_state, lease_type, expiry_date, next_rent_review_date, annual_rent, document_id')
      .eq('asset_id', asset.asset_id)
      .neq('lease_state', 'TERMINATED'),
    supabase.from('leases').select('lease_id').eq('asset_id', asset.asset_id),
    supabase.from('lease_units').select('lease_id, unit_id'),
    supabase
      .from('units')
      .select('unit_id, unit_reference, unit_type, active')
      .eq('asset_id', asset.asset_id),
    supabase
      .from('v_charge_ledger')
      .select('tenant_id, charge_type, outstanding_amount, status, due_date')
      .eq('asset_id', asset.asset_id)
      .in('status', ['ISSUED', 'OVERDUE', 'PART_PAID']),
    supabase
      .from('charge_profiles')
      .select('lease_id, applies, charge_type')
      .eq('charge_type', 'RENT'),
    supabase
      .from('v_arrears_summary')
      .select('tenant_id, total_outstanding, max_days_overdue')
      .eq('asset_id', asset.asset_id),
    supabase
      .from('v_payment_register')
      .select('amount, charge_type, payment_date')
      .eq('asset_id', asset.asset_id)
      .gte('payment_date', monthStartISO),
  ])

  const leases = liveLeases ?? []
  const activeUnits = (units ?? []).filter(u => u.active !== false)
  const unitById = new Map(activeUnits.map(u => [u.unit_id, u]))
  const liveLeaseIdSet = new Set(leases.map(l => l.lease_id))
  const leaseByUnit = new Map<string, typeof leases[number]>()
  const unitsByLease = new Map<string, string[]>()
  for (const lu of leaseUnits ?? []) {
    if (!liveLeaseIdSet.has(lu.lease_id)) continue
    const lease = leases.find(l => l.lease_id === lu.lease_id)
    if (lease && unitById.has(lu.unit_id)) {
      leaseByUnit.set(lu.unit_id, lease)
      const arr = unitsByLease.get(lu.lease_id) ?? []
      arr.push(lu.unit_id)
      unitsByLease.set(lu.lease_id, arr)
    }
  }

  // ---- Financials ----
  const monthlyRent = (asset.total_annual_rent ?? 0) / 12
  const open = openCharges ?? []
  const rentOutstanding = open.filter(c => c.charge_type === 'RENT')
    .reduce((s, c) => s + parseFloat(c.outstanding_amount ?? '0'), 0)
  const electricOutstanding = open.filter(c => c.charge_type === 'ELECTRIC')
    .reduce((s, c) => s + parseFloat(c.outstanding_amount ?? '0'), 0)
  const insuranceOutstanding = open.filter(c => c.charge_type === 'INSURANCE')
    .reduce((s, c) => s + parseFloat(c.outstanding_amount ?? '0'), 0)
  // Arrears = unpaid amounts due BEFORE the current month. Charges due this month
  // are normal in-month collection, not arrears (tenants pay through the month).
  // Rent is billed in advance: unpaid before this month = arrears.
  // Electric is billed in arrears: the latest cycle's bill is normal collection;
  // it becomes arrears only when unpaid beyond one cycle (due before last month's start).
  const priorArrearsByTenant = new Map<string, number>()
  const currentDueByTenant = new Map<string, number>()
  for (const c of open) {
    const amt = parseFloat(c.outstanding_amount ?? '0')
    const threshold = c.charge_type === 'ELECTRIC' ? prevMonthStartISO : monthStartISO
    if (c.due_date && c.due_date < threshold) {
      priorArrearsByTenant.set(c.tenant_id, (priorArrearsByTenant.get(c.tenant_id) ?? 0) + amt)
    } else {
      currentDueByTenant.set(c.tenant_id, (currentDueByTenant.get(c.tenant_id) ?? 0) + amt)
    }
  }
  const totalArrears = Array.from(priorArrearsByTenant.values()).reduce((s, v) => s + v, 0)

  // Internal / non-billed leases (e.g. the management office) are shown grey
  const internalLeaseIds = new Set(
    (rentProfiles ?? []).filter(p => p.applies === false).map(p => p.lease_id)
  )
  const rentCollectedThisMonth = (monthPayments ?? [])
    .filter(p => p.charge_type === 'RENT' || p.charge_type == null)
    .reduce((s, p) => s + parseFloat(p.amount ?? '0'), 0)

  // ---- Composition ----
  const occupancyPct = asset.total_units > 0
    ? Math.round((asset.occupied_units / asset.total_units) * 100) : 0
  const vacantCount = activeUnits.filter(u => !leaseByUnit.has(u.unit_id)).length
  const periodicCount = leases.filter(l => l.lease_state === 'PERIODIC').length
  const activeCount = leases.length - periodicCount

  // Income breakdown by unit type (headline rent, lease attributed to its first unit's type)
  const incomeByType = new Map<string, number>()
  const unitCountByType = new Map<string, number>()
  for (const u of activeUnits) {
    const t = TYPE_LABEL[u.unit_type] ?? u.unit_type ?? 'Other'
    unitCountByType.set(t, (unitCountByType.get(t) ?? 0) + 1)
  }
  for (const l of leases) {
    const unitIds = unitsByLease.get(l.lease_id) ?? []
    const firstUnit = unitIds.length > 0 ? unitById.get(unitIds[0]) : undefined
    const t = firstUnit ? (TYPE_LABEL[firstUnit.unit_type] ?? firstUnit.unit_type ?? 'Other') : 'Other'
    incomeByType.set(t, (incomeByType.get(t) ?? 0) + (l.annual_rent != null ? parseFloat(l.annual_rent) / 12 : 0))
  }
  const incomeRows = Array.from(incomeByType.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])

  // ---- Actions required ----
  const today = new Date()
  const in6m = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate()).toISOString().slice(0, 10)
  const in90d = new Date(today.getTime() + 90 * 86400000).toISOString().slice(0, 10)
  const todayISO = today.toISOString().slice(0, 10)

  const renewalsDue = leases.filter(l =>
    l.lease_state !== 'PERIODIC' && l.expiry_date && l.expiry_date >= todayISO && l.expiry_date <= in6m).length
  const reviewsDue = leases.filter(l =>
    l.next_rent_review_date && l.next_rent_review_date >= todayISO && l.next_rent_review_date <= in90d).length
  const arrears60 = (arrears ?? []).filter(a => (a.max_days_overdue ?? 0) > 60).length
  const missingDocs = leases.filter(l => !l.document_id).length

  const actions: { label: string; href: string; tone: 'red' | 'amber' | 'blue' }[] = []
  if (arrears60 > 0) actions.push({
    label: `${arrears60} tenant${arrears60 !== 1 ? 's' : ''} in arrears > 60 days`,
    href: `/assets/${reference}/payments`, tone: 'red',
  })
  if (renewalsDue > 0) actions.push({
    label: `${renewalsDue} lease renewal${renewalsDue !== 1 ? 's' : ''} required within 6 months`,
    href: `/assets/${reference}/leases`, tone: 'amber',
  })
  if (reviewsDue > 0) actions.push({
    label: `${reviewsDue} rent review${reviewsDue !== 1 ? 's' : ''} due within 90 days`,
    href: `/assets/${reference}/leases`, tone: 'amber',
  })
  if (electricOutstanding > 0) actions.push({
    label: `${gbp(electricOutstanding, 2)} electric outstanding`,
    href: `/assets/${reference}/electric`, tone: 'amber',
  })
  if (vacantCount > 0) actions.push({
    label: `${vacantCount} vacant unit${vacantCount !== 1 ? 's' : ''} available to let`,
    href: `/assets/${reference}/leases`, tone: 'blue',
  })
  if (missingDocs > 0) actions.push({
    label: `${missingDocs} lease${missingDocs !== 1 ? 's' : ''} missing a lease document`,
    href: `/assets/${reference}/leases`, tone: 'blue',
  })

  // ---- Recent activity ----
  const assetLeaseIdList = (allLeaseIds ?? []).map(l => l.lease_id)
  let recentActivity: { activity_id: string; activity_type: string; activity_at: string; summary: string; lease_id: string | null }[] = []
  if (assetLeaseIdList.length > 0) {
    const { data: act } = await supabase
      .from('tenant_activity')
      .select('activity_id, activity_type, activity_at, summary, lease_id')
      .in('lease_id', assetLeaseIdList)
      .order('activity_at', { ascending: false })
      .limit(10)
    recentActivity = act ?? []
  }
  const unitLabelByLease = new Map<string, string>()
  for (const [leaseId, unitIds] of unitsByLease.entries()) {
    const first = unitIds.length > 0 ? unitById.get(unitIds[0]) : undefined
    if (first) unitLabelByLease.set(leaseId, unitLabel(first.unit_reference))
  }

  // ---- Unit status grid ----
  const sortedUnits = [...activeUnits].sort((a, b) =>
    a.unit_reference.localeCompare(b.unit_reference, undefined, { numeric: true }))
  function unitStatus(unitId: string): { colour: string; status: string; lease?: typeof leases[number] } {
    const lease = leaseByUnit.get(unitId)
    if (!lease) return { colour: 'bg-slate-300 hover:bg-slate-400', status: 'Vacant' }
    if (internalLeaseIds.has(lease.lease_id))
      return { colour: 'bg-slate-300 hover:bg-slate-400', status: 'Internal (not billed)', lease }
    if ((priorArrearsByTenant.get(lease.tenant_id) ?? 0) > 0)
      return { colour: 'bg-red-500 hover:bg-red-600', status: 'Arrears', lease }
    if ((currentDueByTenant.get(lease.tenant_id) ?? 0) > 0)
      return { colour: 'bg-amber-400 hover:bg-amber-500', status: 'Current bills due (normal)', lease }
    return { colour: 'bg-emerald-500 hover:bg-emerald-600', status: 'Paid up', lease }
  }

  const toneClass = {
    red: 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100',
    amber: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100',
    blue: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-400 mb-6">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700 font-medium">{asset.asset_name}</span>
      </nav>

      <AssetTabs reference={reference} active="overview" />

      <h1 className="text-2xl font-bold text-slate-900 mb-6">{asset.asset_name}</h1>

      {/* Row 1: headline performance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Occupancy</p>
          <p className="text-2xl font-bold text-slate-900">{occupancyPct}%</p>
          <p className="text-xs text-slate-400 mt-1">{asset.occupied_units}/{asset.total_units} units</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Monthly Rent</p>
          <p className="text-2xl font-bold text-slate-900">{gbp(monthlyRent)}</p>
          <p className="text-xs text-slate-400 mt-1">{gbp(asset.total_annual_rent ?? 0)} pa</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Rent Collected This Month</p>
          <p className="text-2xl font-bold text-emerald-600">{gbp(rentCollectedThisMonth, 2)}</p>
        </div>
        <Link href={`/assets/${reference}/arrears`}
          className="bg-white border border-slate-200 rounded-xl p-5 hover:border-red-300 hover:shadow-sm transition-all block">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Arrears</p>
          <p className={`text-2xl font-bold ${totalArrears > 0 ? 'text-red-600' : 'text-slate-400'}`}>
            {gbp(totalArrears, 2)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Rent: prior months {String.fromCharCode(0x00B7)} Electric: missed cycle {String.fromCharCode(0x2192)}</p>
        </Link>
      </div>

      {/* Row 2: outstanding by type */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Outstanding Rent (incl. this month)</p>
          <p className={`text-xl font-bold ${rentOutstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>{gbp(rentOutstanding, 2)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Outstanding Electric (incl. this month)</p>
          <p className={`text-xl font-bold ${electricOutstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>{gbp(electricOutstanding, 2)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Outstanding Insurance</p>
          <p className={`text-xl font-bold ${insuranceOutstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>{gbp(insuranceOutstanding, 2)}</p>
        </div>
      </div>

      {/* Actions required */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Actions Required</h2>
        {actions.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing requires attention.</p>
        ) : (
          <div className="space-y-2">
            {actions.map(a => (
              <Link key={a.label} href={a.href}
                className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${toneClass[a.tone]}`}>
                <span>{a.label}</span>
                <span>{String.fromCharCode(0x2192)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Lease position + composition */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Lease Position</h2>
          <div className="divide-y divide-slate-100 text-sm">
            {([
              ['Active Leases', String(activeCount)],
              ['Periodic Leases', String(periodicCount)],
              ['Expiring < 6 months', String(renewalsDue)],
              ['Vacant Units', String(vacantCount)],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-2">
                <span className="text-slate-500">{label}</span>
                <span className="font-semibold text-slate-900">{value}</span>
              </div>
            ))}
          </div>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mt-6 mb-3">Unit Mix</h2>
          <div className="flex flex-wrap gap-2">
            {Array.from(unitCountByType.entries()).map(([type, count]) => (
              <span key={type} className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                {type}: {count}
              </span>
            ))}
          </div>
        </div>

        {/* Income breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Income Breakdown</h2>
          {incomeRows.length === 0 ? (
            <p className="text-sm text-slate-400">No income recorded.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-sm">
              {incomeRows.map(([type, pcm]) => (
                <div key={type} className="flex items-center justify-between py-2">
                  <span className="text-slate-500">{type}</span>
                  <span className="font-semibold text-slate-900">{gbp(pcm)} pcm</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-2">
                <span className="font-semibold text-slate-700">Total</span>
                <span className="font-bold text-slate-900">{gbp(monthlyRent)} pcm</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unit status grid */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Unit Status</h2>
        <div className="flex flex-wrap gap-1.5">
          {sortedUnits.map(u => {
            const s = unitStatus(u.unit_id)
            const label = unitLabel(u.unit_reference)
            const title = `${label} ${DASH} ${s.status}`
            const square = (
              <span
                className={`flex items-center justify-center w-12 h-9 rounded text-[10px] font-semibold text-white transition-colors ${s.colour}`}
              >
                {label.replace('Unit ', '').replace('Suite ', '')}
              </span>
            )
            return s.lease ? (
              <Link key={u.unit_id} href={`/assets/${reference}/leases/${s.lease.lease_id}`} title={title}>
                {square}
              </Link>
            ) : (
              <Link key={u.unit_id} href={`/assets/${reference}/leases`} title={`${title} ${DASH} click to let`}>
                {square}
              </Link>
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Paid up</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Current bills due (normal)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Arrears {String.fromCharCode(0x2014)} rent from prior months / electric beyond one cycle</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-300 inline-block" /> Vacant / internal</span>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-slate-400">No activity recorded yet.</p>
        ) : (
          <div className="space-y-0">
            {recentActivity.map(e => {
              const meta = ACTIVITY_BADGE[e.activity_type] ?? ACTIVITY_BADGE.OTHER
              const unit = e.lease_id ? unitLabelByLease.get(e.lease_id) : null
              return (
                <div key={e.activity_id} className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 mt-0.5 ${meta.badge}`}>
                    {meta.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800">
                      {unit && <span className="font-medium">{unit}: </span>}
                      {e.summary}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(e.activity_at).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

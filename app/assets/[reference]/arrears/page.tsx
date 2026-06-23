import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AssetTabs from '@/components/asset-tabs'
import ChaseCell, { type ChaseAction } from './chase-cell'

interface Props {
  params: Promise<{ reference: string }>
}

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)

function gbp(n: number): string {
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(s: string | null): string {
  if (!s) return DASH
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function AssetArrearsPage({ params }: Props) {
  const { reference } = await params

  const { data: asset } = await supabase
    .from('assets')
    .select('asset_id, asset_name, asset_reference')
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
  const monthLabel = new Date(now.getFullYear(), now.getMonth(), 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Single source of truth: v_arrears_charges applies the rent/electric arrears rule,
  // so this page and the portfolio dashboard always agree.
  const [{ data: arrearsCharges }, { data: chaseActions }, { data: tenantPrefs }] = await Promise.all([
    supabase
      .from('v_arrears_charges')
      .select('charge_id, tenant_id, tenant_name, lease_id, unit_reference, charge_type, charge_label, outstanding_amount, due_date, period_start, days_overdue')
      .eq('asset_id', asset.asset_id)
      .order('due_date', { ascending: true }),
    supabase
      .from('arrears_actions')
      .select('tenant_id, stage, method, action_date, amount, notes')
      .eq('asset_id', asset.asset_id)
      .order('action_date', { ascending: false }),
    supabase
      .from('tenants')
      .select('tenant_id, preferred_delivery_method'),
  ])

  const actionsByTenant = new Map<string, ChaseAction[]>()
  for (const a of chaseActions ?? []) {
    const arr = actionsByTenant.get(a.tenant_id) ?? []
    arr.push({ stage: a.stage, method: a.method, action_date: a.action_date, amount: a.amount, notes: a.notes })
    actionsByTenant.set(a.tenant_id, arr)
  }
  const prefByTenant = new Map<string, string>((tenantPrefs ?? []).map(t => [t.tenant_id, t.preferred_delivery_method ?? 'EMAIL']))

  interface TenantArrears {
    tenant_id: string
    tenant_name: string
    lease_id: string | null
    units: Set<string>
    rent: number
    electric: number
    other: number
    total: number
    oldest_due: string | null
    months: Set<string>
    b0_30: number
    b31_60: number
    b61_90: number
    b90: number
  }

  const byTenant = new Map<string, TenantArrears>()
  for (const c of arrearsCharges ?? []) {
    const amt = parseFloat(c.outstanding_amount ?? '0')
    let t = byTenant.get(c.tenant_id)
    if (!t) {
      t = {
        tenant_id: c.tenant_id,
        tenant_name: c.tenant_name,
        lease_id: c.lease_id ?? null,
        units: new Set<string>(),
        rent: 0, electric: 0, other: 0, total: 0,
        oldest_due: null,
        months: new Set<string>(),
        b0_30: 0, b31_60: 0, b61_90: 0, b90: 0,
      }
      byTenant.set(c.tenant_id, t)
    }
    if (c.charge_type === 'RENT') t.rent += amt
    else if (c.charge_type === 'ELECTRIC') t.electric += amt
    else t.other += amt
    t.total += amt
    const days = Number(c.days_overdue ?? 0)
    if (days <= 30) t.b0_30 += amt
    else if (days <= 60) t.b31_60 += amt
    else if (days <= 90) t.b61_90 += amt
    else t.b90 += amt
    if (c.unit_reference) t.units.add(c.unit_reference)
    if (!t.lease_id && c.lease_id) t.lease_id = c.lease_id
    if (!t.oldest_due || (c.due_date && c.due_date < t.oldest_due)) t.oldest_due = c.due_date
    if (c.period_start) t.months.add(String(c.period_start).slice(0, 7))
  }

  const rows = Array.from(byTenant.values()).sort((a, b) => b.total - a.total)
  const totalArrears = rows.reduce((s, r) => s + r.total, 0)
  const aging = rows.reduce((a, r) => ({
    b0_30: a.b0_30 + r.b0_30, b31_60: a.b31_60 + r.b31_60, b61_90: a.b61_90 + r.b61_90, b90: a.b90 + r.b90,
  }), { b0_30: 0, b31_60: 0, b61_90: 0, b90: 0 })

  function formatUnits(refs: string): string {
    return refs.split(',').map(s => {
      const r = s.trim()
      if (r.startsWith('SGP-I-')) return 'Suite ' + r.replace('SGP-I-', '')
      const last = r.split('-').pop() ?? r
      const m = last.match(/^0*(\d.*)$/)
      return 'Unit ' + (m ? m[1] : last)
    }).join(', ')
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset.asset_name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Arrears</span>
      </nav>

      <AssetTabs reference={reference} active="arrears" />

      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        {asset.asset_name} {DASH} Arrears
      </h1>
      <p className="text-sm text-slate-500 mb-6 max-w-3xl">
        Rent unpaid from <span className="font-medium">before {monthLabel}</span>, plus electric
        unpaid for <span className="font-medium">more than one billing cycle</span>. Current bills
        are excluded {DASH} tenants normally pay during the course of the month, and the latest
        electric invoice always relates to the prior month's usage.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Arrears</p>
          <p className={`text-2xl font-bold ${totalArrears > 0 ? 'text-red-600' : 'text-slate-400'}`}>{gbp(totalArrears)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Tenants in Arrears</p>
          <p className={`text-2xl font-bold ${rows.length > 0 ? 'text-red-600' : 'text-slate-400'}`}>{rows.length}</p>
        </div>
      </div>

      {/* Aging buckets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {([
          ['Up to 30 days', aging.b0_30, 'text-slate-900'],
          ['31–60 days', aging.b31_60, 'text-amber-600'],
          ['61–90 days', aging.b61_90, 'text-orange-600'],
          ['Over 90 days', aging.b90, 'text-red-600'],
        ] as [string, number, string][]).map(([label, val, color]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-xl font-bold ${val > 0 ? color : 'text-slate-300'}`}>{gbp(val)}</p>
          </div>
        ))}
      </div>

      {/* Arrears table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenant</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Owed</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">{'≤'}30d</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">31–60</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">61–90</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">90+</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Oldest Due</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Chase</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.tenant_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-700 text-xs max-w-44">{r.units.size > 0 ? formatUnits(Array.from(r.units).sort().join(', ')) : DASH}</td>
                <td className="px-4 py-3">
                  {r.lease_id
                    ? <Link href={`/assets/${reference}/leases/${r.lease_id}`} className="font-medium text-slate-900 hover:text-blue-700 hover:underline">{r.tenant_name}</Link>
                    : <span className="font-medium text-slate-900">{r.tenant_name}</span>}
                  <span className="block text-xs text-slate-400">
                    {r.rent > 0 && `Rent ${gbp(r.rent)}`}{r.rent > 0 && r.electric > 0 && ' · '}{r.electric > 0 && `Electric ${gbp(r.electric)}`}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-red-600 whitespace-nowrap">{gbp(r.total)}</td>
                <td className="px-4 py-3 text-right text-slate-600 text-xs whitespace-nowrap">{r.b0_30 > 0 ? gbp(r.b0_30) : DASH}</td>
                <td className="px-4 py-3 text-right text-amber-700 text-xs whitespace-nowrap">{r.b31_60 > 0 ? gbp(r.b31_60) : DASH}</td>
                <td className="px-4 py-3 text-right text-orange-700 text-xs whitespace-nowrap">{r.b61_90 > 0 ? gbp(r.b61_90) : DASH}</td>
                <td className="px-4 py-3 text-right font-semibold text-red-600 text-xs whitespace-nowrap">{r.b90 > 0 ? gbp(r.b90) : DASH}</td>
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.oldest_due)}</td>
                <td className="px-4 py-3">
                  <ChaseCell
                    assetId={asset.asset_id}
                    tenantId={r.tenant_id}
                    tenantName={r.tenant_name}
                    preferredMethod={prefByTenant.get(r.tenant_id) ?? 'EMAIL'}
                    amount={r.total}
                    oldestDue={r.oldest_due}
                    actions={actionsByTenant.get(r.tenant_id) ?? []}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm">
            No arrears {DASH} all tenants are paid up to the end of last month.
          </div>
        )}
      </div>
    </div>
  )
}

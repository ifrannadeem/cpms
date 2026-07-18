import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import PaymentGrid, { type GridRow } from './payment-entry'
import AssetTabs from '@/components/asset-tabs'
import ReversePayment from '@/components/payments/reverse-payment'
import { unitLabels } from '@/lib/format'

interface Props {
  params: Promise<{ reference: string }>
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

const METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER:  'Bank Transfer',
  STANDING_ORDER: 'Standing Order',
  CASH:           'Cash',
  CHEQUE:         'Cheque',
  CARD:           'Card',
  OTHER:          'Other',
}

export default async function AssetPaymentsPage({ params }: Props) {
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

  const [{ data: payments }, { data: outstandingCharges }, { data: gridLeases }] = await Promise.all([
    supabase
      .from('v_payment_register')
      .select('*')
      .eq('asset_id', asset.asset_id)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('v_charge_ledger')
      .select('lease_id, outstanding_amount, status')
      .eq('asset_id', asset.asset_id)
      .eq('charge_type', 'RENT')
      .in('status', ['ISSUED', 'OVERDUE', 'PART_PAID']),
    supabase
      .from('v_payment_grid')
      .select('lease_id, tenant_id, tenant_name, unit_references')
      .eq('asset_id', asset.asset_id)
      .eq('billable', true),
  ])

  const rows = (payments ?? []).filter(p => p.charge_type === 'RENT' || p.charge_type == null)

  // Outstanding total per lease (independent units under one tenant stay separate)
  const outstandingByLease = new Map<string, number>()
  for (const c of outstandingCharges ?? []) {
    outstandingByLease.set(
      c.lease_id,
      (outstandingByLease.get(c.lease_id) ?? 0) + parseFloat(c.outstanding_amount ?? '0')
    )
  }

  // Grid rows: one per billable lease, sorted by unit reference (natural order)
  const gridRows: GridRow[] = (gridLeases ?? [])
    .map(l => ({
      lease_id: l.lease_id,
      tenant_id: l.tenant_id,
      tenant_name: l.tenant_name,
      unit_references: l.unit_references,
      outstanding: outstandingByLease.get(l.lease_id) ?? 0,
    }))
    .sort((a, b) => a.unit_references.localeCompare(b.unit_references, undefined, { numeric: true }))

  const totalReceived    = rows.reduce((s, p) => s + parseFloat(p.amount ?? '0'), 0)
  const totalUnallocated = rows.reduce((s, p) => s + parseFloat(p.unallocated_amount ?? '0'), 0)
  const totalOutstanding = Array.from(outstandingByLease.values()).reduce((s, v) => s + v, 0)

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset.asset_name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Rent: Payments</span>
      </nav>

      <AssetTabs reference={reference} active="payments" />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {asset.asset_name} {DASH} Rent Payment Register
        </h1>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Payments Recorded</p>
          <p className="text-2xl font-bold text-slate-900">{rows.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Received</p>
          <p className="text-2xl font-bold text-emerald-600">{fmt(totalReceived)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Rent Outstanding</p>
          <p className={`text-2xl font-bold ${totalOutstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>
            {fmt(totalOutstanding)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Unallocated</p>
          <p className={`text-2xl font-bold ${totalUnallocated > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
            {fmt(totalUnallocated)}
          </p>
        </div>
      </div>

      {/* Payment entry grid: all units/tenants pre-populated */}
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Record Rent Payments</h2>
      <p className="text-xs text-slate-400 mb-3">
        Payments here settle rent charges only, oldest month first. Electric payments are recorded on the Electric: Payments tab.
      </p>
      <PaymentGrid assetId={asset.asset_id} rows={gridRows} chargeType="RENT" />

      {/* Receipt history */}
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Receipt History</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenant</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Method</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Allocated To</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(p => (
              <tr key={p.payment_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{fmtDate(p.payment_date)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{unitLabels(p.unit_references)}</td>
                <td className="px-4 py-3 text-slate-800 font-medium">{p.tenant_name}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{fmt(p.amount)}</td>
                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{METHOD_LABEL[p.method] ?? p.method}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {p.allocated_charges ?? DASH}
                  {parseFloat(p.unallocated_amount ?? '0') > 0 && (
                    <span className="block text-amber-600 font-medium mt-0.5">
                      {fmt(p.unallocated_amount)} unallocated
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{p.notes ?? DASH}</td>
                <td className="px-4 py-3 text-right align-top">
                  <ReversePayment
                    paymentId={p.payment_id}
                    amount={parseFloat(p.amount ?? '0')}
                    tenantName={p.tenant_name ?? ''}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm">
            No payments recorded yet. Use the grid above to record payments as they arrive.
          </div>
        )}
      </div>
    </div>
  )
}

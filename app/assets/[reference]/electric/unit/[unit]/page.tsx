import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Props {
  params: Promise<{ reference: string; unit: string }>
}

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)
const ARROW = String.fromCharCode(0x2190)

function gbp(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0)
  if (n == null || isNaN(n as number)) return DASH
  return POUND + (n as number).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function kwh(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0)
  if (n == null || isNaN(n as number)) return DASH
  return (n as number).toLocaleString('en-GB', { maximumFractionDigits: 1 })
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return DASH
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function unitLabel(ref: string): string {
  if (ref.startsWith('SGP-I-')) return 'Suite ' + ref.replace('SGP-I-', '')
  const last = ref.split('-').pop() ?? ref
  const m = last.match(/^0*(\d.*)$/)
  return 'Unit ' + (m ? m[1] : last)
}

export default async function UnitElectricHistoryPage({ params }: Props) {
  const { reference, unit } = await params
  const unitRef = decodeURIComponent(unit)

  const { data: asset } = await supabase
    .from('assets').select('asset_id, asset_name').eq('asset_reference', reference).single()

  const [{ data: bills }, { data: reads }] = await Promise.all([
    supabase
      .from('v_electric_usage')
      .select('bill_month, bill_month_label, block_name, tenant_name, consumption_kwh, net_amount, vat_amount, gross_amount, payment_amount, outstanding')
      .eq('asset_id', asset?.asset_id ?? '')
      .eq('unit_reference', unitRef)
      .order('bill_month', { ascending: false }),
    supabase
      .from('v_meter_usage')
      .select('tenant_name, read_month, read_date, consumption_kwh, billing_on')
      .eq('asset_id', asset?.asset_id ?? '')
      .eq('unit_reference', unitRef)
      .order('read_date', { ascending: false }),
  ])

  const billRows = bills ?? []
  const readRows = reads ?? []
  const tenant = billRows[0]?.tenant_name ?? readRows[0]?.tenant_name ?? null
  const block  = billRows[0]?.block_name ?? null

  const totalKwh   = billRows.reduce((s, r) => s + parseFloat(r.consumption_kwh ?? '0'), 0)
  const totalGross = billRows.reduce((s, r) => s + parseFloat(r.gross_amount ?? '0'), 0)
  const totalOut   = billRows.reduce((s, r) => s + parseFloat(r.outstanding ?? '0'), 0)

  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset?.asset_name}</Link>
        <span>/</span>
        <Link href={`/assets/${reference}/electric`} className="hover:text-slate-600">Meter Readings</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{unitLabel(unitRef)}</span>
      </nav>

      <Link href={`/assets/${reference}/electric`} className="text-sm text-blue-600 hover:underline">{ARROW} Back to Meter Readings</Link>

      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{unitLabel(unitRef)} {DASH} Electric History</h1>
        <p className="text-sm text-slate-500 mt-1">
          {tenant ?? DASH}{block ? ` · ${block}` : ''} · <span className="font-mono text-xs">{unitRef}</span>
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Total kWh billed</p>
          <p className="text-xl font-bold text-slate-900">{kwh(totalKwh)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Total billed</p>
          <p className="text-xl font-bold text-slate-900">{gbp(totalGross)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Outstanding</p>
          <p className={`text-xl font-bold ${totalOut > 0 ? 'text-red-600' : 'text-slate-400'}`}>{gbp(totalOut)}</p>
        </div>
      </div>

      {/* Bills */}
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Billing history</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 mb-8">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Month</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">kWh</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Net</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">VAT</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Gross</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Paid</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {billRows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{r.bill_month_label}</td>
                <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">{kwh(r.consumption_kwh)}</td>
                <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">{gbp(r.net_amount)}</td>
                <td className="px-4 py-2.5 text-right text-slate-500 text-xs whitespace-nowrap">{gbp(r.vat_amount)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{gbp(r.gross_amount)}</td>
                <td className="px-4 py-2.5 text-right text-emerald-700 whitespace-nowrap">{gbp(r.payment_amount)}</td>
                <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${parseFloat(r.outstanding ?? '0') > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {parseFloat(r.outstanding ?? '0') > 0 ? gbp(r.outstanding) : DASH}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {billRows.length === 0 && <div className="p-10 text-center text-slate-400 text-sm">No electric bills yet for this unit.</div>}
      </div>

      {/* Readings */}
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Meter readings</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Read date</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Consumption (kWh)</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Billing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {readRows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{fmtDate(r.read_date)}</td>
                <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">{kwh(r.consumption_kwh)}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{r.billing_on === false ? 'Off (not billed)' : 'On'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {readRows.length === 0 && <div className="p-10 text-center text-slate-400 text-sm">No meter readings recorded for this unit.</div>}
      </div>
    </div>
  )
}

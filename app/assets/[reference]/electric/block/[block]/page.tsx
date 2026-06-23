import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Props {
  params: Promise<{ reference: string; block: string }>
}

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)
const ARROW = String.fromCharCode(0x2190)

function gbp(v: number): string {
  return POUND + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function kwh(v: number): string {
  return v.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

interface MonthAgg {
  month: string; label: string
  invoices: number; kwh: number; net: number; vat: number; gross: number; paid: number; outstanding: number
}

export default async function BlockElectricHistoryPage({ params }: Props) {
  const { reference, block } = await params
  const blockName = decodeURIComponent(block)

  const { data: asset } = await supabase
    .from('assets').select('asset_id, asset_name').eq('asset_reference', reference).single()

  const { data: usage } = await supabase
    .from('v_electric_usage')
    .select('bill_month, bill_month_label, consumption_kwh, net_amount, vat_amount, gross_amount, payment_amount, outstanding')
    .eq('asset_id', asset?.asset_id ?? '')
    .eq('block_name', blockName)

  const aggMap = new Map<string, MonthAgg>()
  for (const r of usage ?? []) {
    const a = aggMap.get(r.bill_month) ?? {
      month: r.bill_month, label: r.bill_month_label,
      invoices: 0, kwh: 0, net: 0, vat: 0, gross: 0, paid: 0, outstanding: 0,
    }
    a.invoices += 1
    a.kwh += parseFloat(r.consumption_kwh ?? '0')
    a.net += parseFloat(r.net_amount ?? '0')
    a.vat += parseFloat(r.vat_amount ?? '0')
    a.gross += parseFloat(r.gross_amount ?? '0')
    a.paid += parseFloat(r.payment_amount ?? '0')
    a.outstanding += parseFloat(r.outstanding ?? '0')
    aggMap.set(r.bill_month, a)
  }
  const rows = Array.from(aggMap.values()).sort((a, b) => b.month.localeCompare(a.month))
  const maxKwh = Math.max(1, ...rows.map(r => r.kwh))

  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset?.asset_name}</Link>
        <span>/</span>
        <Link href={`/assets/${reference}/electric`} className="hover:text-slate-600">Meter Readings</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{blockName}</span>
      </nav>

      <Link href={`/assets/${reference}/electric`} className="text-sm text-blue-600 hover:underline">{ARROW} Back to Meter Readings</Link>

      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{blockName} {DASH} Usage Over Time</h1>
        <p className="text-sm text-slate-500 mt-1">Monthly consumption and cost for this block (its own supplier account).</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Month</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Invoices</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">kWh</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase w-40">Trend</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Net</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Gross</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.month} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{r.label}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{r.invoices}</td>
                <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">{kwh(r.kwh)}</td>
                <td className="px-4 py-2.5">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(r.kwh / maxKwh) * 100}%` }} />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">{gbp(r.net)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{gbp(r.gross)}</td>
                <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${r.outstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {r.outstanding > 0 ? gbp(r.outstanding) : DASH}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-10 text-center text-slate-400 text-sm">No usage recorded for this block yet.</div>}
      </div>
    </div>
  )
}

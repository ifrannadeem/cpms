import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Download } from 'lucide-react'
import AssetTabs from '@/components/asset-tabs'
import { PrintButton } from '@/components/print-button'
import { buildRentCollectionData, isCancelled, MONTHS, type MatrixCell } from '@/lib/rent-collection'

/**
 * Rent collection matrix — the owner's Excel income sheet, live.
 * Rows = tenancies, columns = months, cell = rent received against that
 * month's invoice. Assembly is shared with the Excel export
 * (lib/rent-collection.ts) so screen and download always agree.
 */

interface Props {
  params: Promise<{ reference: string }>
  searchParams: Promise<{ year?: string }>
}

const POUND = String.fromCharCode(0xA3)
const DASH = String.fromCharCode(0x2014)

function gbp(n: number, dp = 0): string {
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export default async function RentCollectionPage({ params, searchParams }: Props) {
  const { reference } = await params
  const sp = await searchParams
  const now = new Date()
  const year = /^\d{4}$/.test(sp.year ?? '') ? parseInt(sp.year!, 10) : now.getFullYear()

  const { data: asset } = await supabase
    .from('assets')
    .select('asset_id, asset_name, asset_reference')
    .eq('asset_reference', reference)
    .single()

  if (!asset) {
    return (
      <div className="p-8">
        <p className="text-red-500 mb-4">Asset not found: {reference}</p>
        <Link href="/" className="text-blue-600 hover:underline text-sm">{String.fromCharCode(0x2190)} Back to dashboard</Link>
      </div>
    )
  }

  const data = await buildRentCollectionData(asset.asset_id, reference, asset.asset_name, year)
  const { rows, monthlyTotals, cumulative, payerCounts, rentRoll, yearBilled, yearReceived } = data

  function cellView(cell: MatrixCell | null, monthIdx: number) {
    const isFuture = year > now.getFullYear() || (year === now.getFullYear() && monthIdx > now.getMonth())
    if (!cell) {
      return <td key={monthIdx} className={`px-2 py-2 text-right text-xs ${isFuture ? 'text-slate-200' : 'bg-slate-50 text-slate-300'}`}>{DASH}</td>
    }
    if (isCancelled(cell.status)) {
      return (
        <td key={monthIdx} className="px-2 py-2 text-right text-xs text-slate-400" title="Invoice cancelled / written off">
          <span className="line-through">{gbp(cell.billed)}</span>
        </td>
      )
    }
    if (cell.status === 'DRAFT' || cell.status === 'APPROVED') {
      return (
        <td key={monthIdx} className="px-2 py-2 text-right text-xs italic text-slate-300" title="Not yet issued">
          {gbp(cell.billed)}
        </td>
      )
    }
    const full = cell.received >= cell.billed && cell.billed > 0
    const part = !full && cell.received > 0
    const cls = full ? 'text-emerald-700 font-medium'
      : part ? 'bg-amber-50 text-amber-700 font-medium'
      : 'bg-red-50 text-red-600'
    const title = part ? `Received ${gbp(cell.received, 2)} of ${gbp(cell.billed, 2)}` : `Billed ${gbp(cell.billed, 2)}`
    return (
      <td key={monthIdx} className={`px-2 py-2 text-right text-xs whitespace-nowrap ${cls}`} title={title}>
        {gbp(cell.received)}
      </td>
    )
  }

  return (
    <div className="p-6 md:p-10 max-w-none print:p-0">
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2 print:hidden">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset.asset_name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Rent Collection</span>
      </nav>

      <div className="print:hidden">
        <AssetTabs reference={reference} active="rent-collection" />
      </div>

      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{asset.asset_name} {DASH} Rent Collection {year}</h1>
          <p className="text-sm text-slate-500 mt-1 print:hidden">
            Rent received against each month{String.fromCharCode(0x2019)}s invoice. Hover a cell for the billed amount.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm print:hidden">
          <Link href={`/assets/${reference}/rent-collection?year=${year - 1}`}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">{String.fromCharCode(0x2190)} {year - 1}</Link>
          <span className="font-semibold text-slate-900 px-2">{year}</span>
          <Link href={`/assets/${reference}/rent-collection?year=${year + 1}`}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">{year + 1} {String.fromCharCode(0x2192)}</Link>
          <span className="w-px h-6 bg-slate-200 mx-1" />
          <a href={`/api/reports/rent-collection?assetId=${asset.asset_id}&year=${year}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors">
            <Download className="h-4 w-4" />
            Excel
          </a>
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 max-w-3xl print:hidden">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Rent Roll (monthly)</p>
          <p className="text-xl font-bold text-slate-900">{gbp(rentRoll)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Billed {year}</p>
          <p className="text-xl font-bold text-slate-900">{gbp(yearBilled)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Received {year}</p>
          <p className={`text-xl font-bold ${yearReceived >= yearBilled ? 'text-emerald-700' : 'text-slate-900'}`}>{gbp(yearReceived)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white print:overflow-visible print:border-0 print:rounded-none">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <th className="sticky left-0 bg-slate-800 px-3 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wide min-w-36 print:static">Unit</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wide min-w-44">Occupant</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-white uppercase tracking-wide">Rent</th>
              {MONTHS.map(mo => (
                <th key={mo} className="px-2 py-2.5 text-right text-xs font-semibold text-slate-100">{mo}</th>
              ))}
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-white uppercase tracking-wide">Year</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.leaseId} className="hover:bg-slate-50 transition-colors">
                <td className="sticky left-0 bg-white px-3 py-2 font-medium text-slate-800 whitespace-nowrap print:static">
                  {r.unitLabel}
                </td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                  <Link href={`/assets/${reference}/leases/${r.leaseId}`} className="hover:text-blue-700 hover:underline">
                    {r.occupant}
                  </Link>
                  {r.ended && <span className="ml-1.5 text-[10px] text-amber-600">(ended)</span>}
                </td>
                <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{r.monthlyRent > 0 ? gbp(r.monthlyRent) : DASH}</td>
                {MONTHS.map((_, m) => cellView(r.cells[m], m))}
                <td className="px-3 py-2 text-right font-semibold text-slate-800 whitespace-nowrap">{gbp(r.yearReceived)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50">
            <tr>
              <td className="sticky left-0 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wide print:static">Received</td>
              <td></td><td></td>
              {monthlyTotals.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right text-xs font-bold text-slate-800 whitespace-nowrap">{v > 0 ? gbp(v) : DASH}</td>
              ))}
              <td className="px-3 py-2 text-right text-xs font-bold text-slate-900 whitespace-nowrap">{gbp(yearReceived)}</td>
            </tr>
            <tr>
              <td className="sticky left-0 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide print:static">Cumulative</td>
              <td></td><td></td>
              {cumulative.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right text-xs text-slate-500 whitespace-nowrap">{v > 0 ? gbp(v) : DASH}</td>
              ))}
              <td></td>
            </tr>
            <tr>
              <td className="sticky left-0 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide print:static"># Payers</td>
              <td></td><td></td>
              {payerCounts.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right text-xs text-slate-500">{v > 0 ? v : DASH}</td>
              ))}
              <td></td>
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm">No rent charges for {year}.</div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-3">
        Green = paid in full {DASH} amber = part paid {DASH} red = nothing received {DASH} struck through = invoice
        cancelled or written off {DASH} light italic = draft, not yet issued.{' '}
        <span className="print:hidden">
          Payments are recorded on the{' '}
          <Link href={`/assets/${reference}/payments`} className="text-blue-600 hover:underline">Rent: Payments</Link> page.
        </span>
      </p>
    </div>
  )
}

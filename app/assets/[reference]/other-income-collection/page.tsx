import Link from 'next/link'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AssetTabs from '@/components/asset-tabs'
import { PrintButton } from '@/components/print-button'
import { fetchOtherIncome } from '@/lib/other-income-data'
import { otherIncomeCollection, shortDate, type CollectionCell } from '@/lib/other-income'
import { currentMonthKey } from '@/lib/other-income-collection'

export const dynamic = 'force-dynamic'

/**
 * Other Income: Collection. The same calendar grid as Rent: Collection and Electric:
 * Collection, sources down and months across. There is no invoice to compare against, so
 * a cell is what was received for that month, and a regular source that paid nothing for
 * a past month is shown in red. Rules in lib/other-income.ts (otherIncomeCollection).
 */

const POUND = String.fromCharCode(0xA3)
const DASH = String.fromCharCode(0x2014)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function gbp(n: number, dp = 0): string {
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

interface Props {
  params: Promise<{ reference: string }>
  searchParams: Promise<{ year?: string }>
}

export default async function OtherIncomeCollectionPage({ params, searchParams }: Props) {
  const { reference } = await params
  const sp = await searchParams
  const year = /^\d{4}$/.test(sp.year ?? '') ? parseInt(sp.year!, 10) : new Date().getFullYear()

  const { data: asset } = await supabase
    .from('assets')
    .select('asset_id, asset_name')
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

  const { sources, receipts } = await fetchOtherIncome(asset.asset_id)
  const grid = otherIncomeCollection(year, currentMonthKey(), sources, receipts)
  const slug = 'other-income-collection'

  function cellView(cell: CollectionCell, i: number) {
    if (cell.state === 'received') {
      const title = `Received ${cell.receivedDates.map(shortDate).join(', ')}. Net ${gbp(cell.net, 2)}, VAT ${gbp(cell.vat, 2)}.`
      return <td key={i} className="px-2 py-2 text-right text-xs whitespace-nowrap text-emerald-700 font-medium" title={title}>{gbp(cell.gross)}</td>
    }
    if (cell.state === 'missed') {
      return <td key={i} className="px-2 py-2 text-right text-xs whitespace-nowrap bg-red-50 text-red-600" title="Nothing received for this month">{gbp(0)}</td>
    }
    if (cell.state === 'pending') {
      return <td key={i} className="px-2 py-2 text-right text-xs text-slate-200">{DASH}</td>
    }
    return <td key={i} className="px-2 py-2 text-right text-xs bg-slate-50 text-slate-300">{DASH}</td>
  }

  return (
    <div className="p-6 md:p-10 max-w-none print:p-0">
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2 print:hidden">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset.asset_name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Other Income Collection</span>
      </nav>

      <div className="print:hidden">
        <AssetTabs reference={reference} active={slug} />
      </div>

      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{asset.asset_name} {DASH} Other Income Collection {year}</h1>
          <p className="text-sm text-slate-500 mt-1 print:hidden">
            Money received for each month, in the month it belongs to. Hover a cell for the date it arrived and the VAT.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm print:hidden">
          <Link href={`/assets/${reference}/${slug}?year=${year - 1}`}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">{String.fromCharCode(0x2190)} {year - 1}</Link>
          <span className="font-semibold text-slate-900 px-2">{year}</span>
          <Link href={`/assets/${reference}/${slug}?year=${year + 1}`}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">{year + 1} {String.fromCharCode(0x2192)}</Link>
          <span className="w-px h-6 bg-slate-200 mx-1" />
          <a href={`/api/reports/${slug}?assetId=${asset.asset_id}&year=${year}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors">
            <Download className="h-4 w-4" />
            Excel
          </a>
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 max-w-3xl print:hidden">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Received {year}</p>
          <p className="text-xl font-bold text-slate-900">{gbp(grid.yearGross)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Net of VAT</p>
          <p className="text-xl font-bold text-slate-900">{gbp(grid.yearNet)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">VAT</p>
          <p className="text-xl font-bold text-slate-900">{gbp(grid.yearVat)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white print:overflow-visible print:border-0 print:rounded-none">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <th className="sticky left-0 bg-slate-800 px-3 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wide min-w-40 print:static">Source</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wide min-w-44">Payer</th>
              {MONTHS.map(mo => (
                <th key={mo} className="px-2 py-2.5 text-right text-xs font-semibold text-slate-100">{mo}</th>
              ))}
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-white uppercase tracking-wide">Year</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {grid.rows.map(r => (
              <tr key={r.sourceId} className="hover:bg-slate-50 transition-colors">
                <td className="sticky left-0 bg-white px-3 py-2 font-medium text-slate-800 whitespace-nowrap print:static">
                  {r.source}
                  {!r.recurring && <span className="ml-1.5 text-[10px] text-slate-400">(one-off)</span>}
                  {!r.active && <span className="ml-1.5 text-[10px] text-amber-600">(retired)</span>}
                </td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.payer || DASH}</td>
                {r.cells.map((c, i) => cellView(c, i))}
                <td className="px-3 py-2 text-right font-semibold text-slate-800 whitespace-nowrap">{gbp(r.yearGross)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50">
            <tr>
              <td className="sticky left-0 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wide print:static">Received</td>
              <td></td>
              {grid.monthlyTotals.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right text-xs font-bold text-slate-800 whitespace-nowrap">{v > 0 ? gbp(v) : DASH}</td>
              ))}
              <td className="px-3 py-2 text-right text-xs font-bold text-slate-900 whitespace-nowrap">{gbp(grid.yearGross)}</td>
            </tr>
            <tr>
              <td className="sticky left-0 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide print:static">Cumulative</td>
              <td></td>
              {grid.cumulative.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right text-xs text-slate-500 whitespace-nowrap">{v > 0 ? gbp(v) : DASH}</td>
              ))}
              <td></td>
            </tr>
            <tr>
              <td className="sticky left-0 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide print:static"># Sources paid</td>
              <td></td>
              {grid.payerCounts.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right text-xs text-slate-500">{v > 0 ? v : DASH}</td>
              ))}
              <td></td>
            </tr>
          </tfoot>
        </table>
        {grid.rows.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm">No other income recorded for {year}.</div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-3">
        Green = received {DASH} red = a regular source paid nothing for a month now past {DASH} grey = before the
        source started, or the current month and later, which are not yet late. Opera records what arrives rather
        than what is owed, so a part payment shows as the amount received.{' '}
        <span className="print:hidden">
          Receipts are recorded on the{' '}
          <Link href={`/assets/${reference}/other-income`} className="text-blue-600 hover:underline">Other Income: Payments</Link>{' '}page.
        </span>
      </p>
    </div>
  )
}

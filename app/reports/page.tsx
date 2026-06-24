import { Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import RentIncomeDownload, { type AssetOpt } from '@/components/reports/rent-income-download'
import VatControls from '@/components/reports/vat-controls'
import { computeVatMatrix, currentVatYear } from '@/lib/reports'

export const dynamic = 'force-dynamic'

const POUND = String.fromCharCode(0xA3)
const DASH = String.fromCharCode(0x2014)

function money(n: number): string {
  if (!n) return DASH
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  searchParams: Promise<{ asset?: string; vyear?: string }>
}

export default async function ReportsPage({ searchParams }: Props) {
  const sp = await searchParams

  const { data: assets } = await supabase
    .from('assets').select('asset_id, asset_name, asset_reference').order('asset_reference')
  const assetList: AssetOpt[] = (assets ?? []).map(a => ({ id: a.asset_id, name: a.asset_name, ref: a.asset_reference }))

  const { data: configs } = await supabase.from('vat_config').select('asset_id, registered, quarter_end_month')
  const cfgByAsset = new Map((configs ?? []).map(c => [c.asset_id, c]))

  const selectedAssetId = sp.asset && assetList.some(a => a.id === sp.asset) ? sp.asset : (assetList[0]?.id ?? '')
  const selCfg = cfgByAsset.get(selectedAssetId)
  const selRegistered = selCfg?.registered !== false
  const selQEnd: number | null = selCfg?.quarter_end_month ?? null

  const defaultYear = currentVatYear(selQEnd)
  const year = sp.vyear ? parseInt(sp.vyear, 10) : defaultYear

  const matrix = selectedAssetId ? await computeVatMatrix(selectedAssetId, year) : null

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Download formatted Excel reports for rental income and VAT.</p>
      </div>

      {/* Monthly rent income */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-1">Monthly Rent Income</h2>
        <p className="text-xs text-slate-400 mb-4 max-w-2xl">
          Gross rent billed, cash received in the month, and balance outstanding per tenant. Run it at month end.
        </p>
        <RentIncomeDownload assets={assetList} />
      </section>

      {/* VAT */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-1">VAT on Rent</h2>
        <p className="text-xs text-slate-400 mb-4 max-w-2xl">
          Output VAT due by unit, broken down by month and grouped into your VAT quarters (accrual basis, rent only).
          Set each property{String.fromCharCode(0x2019)}s quarter cycle once {DASH} it then rolls forward automatically.
        </p>

        <VatControls
          assets={assetList}
          assetId={selectedAssetId}
          year={year}
          registered={selRegistered}
          quarterEndMonth={selQEnd}
          yearLabel={matrix?.yearLabel ?? String(year)}
        />

        {matrix && !matrix.registered ? (
          <div className="mt-5 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            {matrix.assetName} is marked as not VAT registered. Use “VAT settings” above to register it and pick a quarter cycle.
          </div>
        ) : matrix ? (
          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full bg-white text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th rowSpan={2} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50">Unit</th>
                  <th rowSpan={2} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenant</th>
                  {matrix.quarters.map(q => (
                    <th key={q.q} colSpan={4} className="px-3 py-2 text-center text-xs font-semibold text-slate-600 border-l border-slate-200">
                      {q.label} <span className="font-normal text-slate-400">{q.range}</span>
                    </th>
                  ))}
                  <th rowSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide border-l border-slate-200">Year Total</th>
                </tr>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {matrix.quarters.map(q => (
                    <Fragment key={q.q}>
                      {q.monthKeys.map(k => {
                        const m = matrix.months.find(mm => mm.key === k)!
                        return <th key={k} className="px-3 py-1.5 text-right text-[11px] font-medium text-slate-400 border-l border-slate-100">{m.mLabel} {m.yShort}</th>
                      })}
                      <th className="px-3 py-1.5 text-right text-[11px] font-semibold text-slate-500 bg-slate-100">{q.label}</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matrix.rows.map(row => (
                  <tr key={row.unit + row.tenant} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap sticky left-0 bg-white">{row.unit}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.tenant}</td>
                    {matrix.quarters.map(q => {
                      const qSum = q.monthKeys.reduce((s, k) => s + (row.byMonth[k] ?? 0), 0)
                      return (
                        <Fragment key={q.q}>
                          {q.monthKeys.map(k => (
                            <td key={k} className="px-3 py-2 text-right text-slate-700 whitespace-nowrap border-l border-slate-100">{money(row.byMonth[k] ?? 0)}</td>
                          ))}
                          <td className="px-3 py-2 text-right font-semibold text-slate-900 whitespace-nowrap bg-slate-50">{money(qSum)}</td>
                        </Fragment>
                      )
                    })}
                    <td className="px-3 py-2 text-right font-bold text-slate-900 whitespace-nowrap border-l border-slate-200">{money(row.total)}</td>
                  </tr>
                ))}
                {matrix.rows.length === 0 && (
                  <tr><td colSpan={2 + 4 * 4 + 1} className="px-3 py-8 text-center text-slate-400">No rent invoices issued in this VAT year.</td></tr>
                )}
              </tbody>
              {matrix.rows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 border-t border-slate-300 font-semibold">
                    <td className="px-3 py-2 text-slate-900 sticky left-0 bg-slate-100">Total</td>
                    <td className="px-3 py-2"></td>
                    {matrix.quarters.map((q, qi) => (
                      <Fragment key={q.q}>
                        {q.monthKeys.map(k => (
                          <td key={k} className="px-3 py-2 text-right text-slate-900 whitespace-nowrap border-l border-slate-200">{money(matrix.monthTotals[k] ?? 0)}</td>
                        ))}
                        <td className="px-3 py-2 text-right text-slate-900 whitespace-nowrap bg-slate-200">{money(matrix.quarterTotals[qi] ?? 0)}</td>
                      </Fragment>
                    ))}
                    <td className="px-3 py-2 text-right text-slate-900 whitespace-nowrap border-l border-slate-300">{money(matrix.grandTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}

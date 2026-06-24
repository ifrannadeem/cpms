import { supabase } from '@/lib/supabase'
import RentIncomeDownload, { type AssetOpt } from '@/components/reports/rent-income-download'
import VatManager, { type VatPeriod } from '@/components/reports/vat-manager'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const [{ data: assets }, { data: periods }] = await Promise.all([
    supabase.from('assets').select('asset_id, asset_name, asset_reference').order('asset_reference'),
    supabase.from('vat_periods').select('period_id, asset_id, label, period_start, period_end')
      .order('period_start', { ascending: false }),
  ])

  const assetList: AssetOpt[] = (assets ?? []).map(a => ({
    id: a.asset_id, name: a.asset_name, ref: a.asset_reference,
  }))
  const periodList: VatPeriod[] = (periods ?? []).map(p => ({
    period_id: p.period_id, asset_id: p.asset_id, label: p.label,
    period_start: p.period_start, period_end: p.period_end,
  }))

  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">
          Download formatted Excel reports for rental income and VAT.
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-1">Monthly Rent Income</h2>
        <p className="text-xs text-slate-400 mb-4 max-w-2xl">
          Gross rent billed, cash received in the month, and balance outstanding per tenant. Run it at
          month end for the month just closed.
        </p>
        <RentIncomeDownload assets={assetList} />
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-1">VAT Reporting</h2>
        <p className="text-xs text-slate-400 mb-4 max-w-2xl">
          Define VAT quarters per asset, then download the output-VAT return for each period (accrual basis,
          with a memo of VAT actually received). Includes both rent and electric VAT.
        </p>
        <VatManager assets={assetList} periods={periodList} />
      </section>
    </div>
  )
}

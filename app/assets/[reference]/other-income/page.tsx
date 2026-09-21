import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AssetTabs from '@/components/asset-tabs'
import OtherIncomeClient, { type SourceView, type ReceiptView } from '@/components/other-income/other-income-client'

export const dynamic = 'force-dynamic'

const DASH = String.fromCharCode(0x2014)

interface Props {
  params: Promise<{ reference: string }>
}

/**
 * Other income: money this property earns outside its leases (EV chargers, parking,
 * car park, one-offs). A separate ledger, receipts only. See lib/other-income.ts and
 * migration 20260921100000.
 */
export default async function OtherIncomePage({ params }: Props) {
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

  const [{ data: sources }, { data: receipts }] = await Promise.all([
    supabase.from('other_income_sources')
      .select('source_id, name, payer, recurring, vat_default, active, notes')
      .eq('asset_id', asset.asset_id)
      .order('name'),
    supabase.from('v_other_income')
      .select('receipt_id, receipt_group, source_id, source_name, period_month, received_date, net_amount, vat_amount, gross_amount, description, comments')
      .eq('asset_id', asset.asset_id)
      .eq('removed', false)
      .order('period_month', { ascending: false })
      .order('received_date', { ascending: false }),
  ])

  const sourceViews: SourceView[] = (sources ?? []).map(s => ({
    source_id: s.source_id,
    name: s.name,
    payer: s.payer,
    recurring: s.recurring,
    vat_default: s.vat_default as 'NONE' | 'STANDARD',
    active: s.active,
    notes: s.notes,
  }))

  const receiptViews: ReceiptView[] = (receipts ?? []).map(r => ({
    receipt_id: r.receipt_id,
    receipt_group: r.receipt_group,
    source_name: r.source_name,
    period_month: r.period_month,
    received_date: r.received_date,
    net: parseFloat(r.net_amount ?? '0'),
    vat: parseFloat(r.vat_amount ?? '0'),
    gross: parseFloat(r.gross_amount ?? '0'),
    description: r.description,
    comments: r.comments,
  }))

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset.asset_name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Other Income: Payments</span>
      </nav>

      <AssetTabs reference={reference} active="other-income" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{asset.asset_name} {DASH} Other Income: Payments</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          Money this property earns outside its leases, such as EV chargers, parking and the car park, or anything
          received once. Record what arrived and the month it belongs to. It appears in the monthly reports
          alongside rent but never touches rent invoicing, payments or arrears.
        </p>
      </div>

      <OtherIncomeClient assetId={asset.asset_id} sources={sourceViews} receipts={receiptViews} />
    </div>
  )
}

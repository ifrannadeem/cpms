import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AssetTabs from '@/components/asset-tabs'
import { monthLabel } from '@/lib/invoice-data'
import { gatherDispatch, type DispatchType } from '@/lib/dispatch'
import { dispatchMode } from '@/lib/mailer'
import DispatchList, { type DraftView } from '@/components/dispatch/dispatch-list'

interface Props {
  params: Promise<{ reference: string }>
  searchParams: Promise<{ type?: string; month?: string }>
}

const DASH = String.fromCharCode(0x2014)

export const dynamic = 'force-dynamic'

export default async function DispatchPage({ params, searchParams }: Props) {
  const { reference } = await params
  const sp = await searchParams
  const type: DispatchType = sp.type === 'ELECTRIC' ? 'ELECTRIC' : 'RENT'

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

  const { months, month, items } = await gatherDispatch({
    assetId: asset.asset_id, assetName: asset.asset_name, reference, type, month: sp.month,
  })
  const mode = dispatchMode(reference)

  const drafts: DraftView[] = items.map(i => ({
    tenantId: i.tenantId,
    tenantName: i.draft.tenantName,
    to: i.draft.to,
    subject: i.draft.subject,
    body: i.draft.body,
    attachments: i.draft.attachments,
    chargeCount: i.chargeIds.length,
  }))

  const tab = (t: DispatchType, label: string) => (
    <Link
      href={`/assets/${reference}/dispatch?type=${t}`}
      className={`px-4 py-2 text-sm rounded-lg transition-colors ${type === t ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
    >
      {label}
    </Link>
  )

  return (
    <div className="p-6 md:p-10 max-w-4xl">
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset.asset_name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Email Invoices</span>
      </nav>

      <AssetTabs reference={reference} active="dispatch" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{asset.asset_name} {DASH} Email Invoices</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review each tenant{String.fromCharCode(0x2019)}s email, then send. Rent and electric are sent separately.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {tab('RENT', 'Rent')}
        {tab('ELECTRIC', 'Electric')}
        {months.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {months.map(m => (
              <Link
                key={m}
                href={`/assets/${reference}/dispatch?type=${type}&month=${m}`}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${m === month ? 'border-slate-800 text-slate-900 font-semibold' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
              >
                {monthLabel(`${m}-01`)}
              </Link>
            ))}
          </div>
        )}
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
          No issued {type === 'ELECTRIC' ? 'electric' : 'rent'} invoices found. Issue invoices on the{' '}
          {type === 'ELECTRIC' ? 'Electric: Invoicing' : 'Rent: Invoicing'} tab first.
        </div>
      ) : (
        <DispatchList
          assetId={asset.asset_id}
          assetReference={reference}
          type={type}
          month={month!}
          monthLabel={monthLabel(`${month}-01`)}
          live={mode.live}
          testTo={mode.testTo}
          drafts={drafts}
        />
      )}
    </div>
  )
}

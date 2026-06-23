import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AssetTabs from '@/components/asset-tabs'

interface Props {
  params: Promise<{ reference: string }>
  searchParams: Promise<{ type?: string }>
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

function formatUnit(ref: string | null | undefined): string {
  if (!ref) return DASH
  if (ref.startsWith('SGP-I-')) return 'Suite ' + ref.replace('SGP-I-', '')
  const parts = ref.trim().split('-')
  return 'Unit ' + parts[parts.length - 1]
}

function methodLabel(m: string | null | undefined): string {
  if (!m) return ''
  return m.charAt(0) + m.slice(1).toLowerCase()
}

function monthLabel(ym: string): string {
  return new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT:       'bg-slate-100 text-slate-600',
  APPROVED:    'bg-amber-100 text-amber-800',
  ISSUED:      'bg-blue-100 text-blue-700',
  PAID:        'bg-emerald-100 text-emerald-700',
  PART_PAID:   'bg-amber-100 text-amber-800',
  OVERDUE:     'bg-red-100 text-red-700',
  WRITTEN_OFF: 'bg-gray-100 text-gray-500',
  CREDITED:    'bg-purple-100 text-purple-700',
}

function statusLabel(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')
}

export default async function AssetBillingPage({ params, searchParams }: Props) {
  const { reference } = await params
  const { type } = await searchParams
  const typeFilter = type === 'RENT' || type === 'ELECTRIC' ? type : null

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

  const { data: charges } = await supabase
    .from('v_charge_ledger')
    .select('*')
    .eq('asset_id', asset.asset_id)
    .order('unit_reference', { ascending: true })

  const allRows = charges ?? []
  // Billing shows only issued+ charges (amounts due). Drafts & approved live on the Invoicing screen.
  const dueRows = allRows.filter(c => !['DRAFT', 'APPROVED'].includes(c.status))
  const rows = typeFilter ? dueRows.filter(c => c.charge_type === typeFilter) : dueRows

  // ---- Period reference points ---------------------------------------------
  const now = new Date()
  const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const curMonthStart  = ymOf(now) + '-01'                                   // rent overdue: period before this
  const prevMonthStart = ymOf(new Date(now.getFullYear(), now.getMonth() - 1, 1)) + '-01' // electric overdue: period_end before this
  const curYM = ymOf(now)

  const DUE = ['ISSUED', 'OVERDUE', 'PART_PAID']
  const num = (v: string | number | null | undefined) => parseFloat(String(v ?? '0')) || 0

  // Per-type metric helper over issued charges only (amounts due)
  function metrics(t: 'RENT' | 'ELECTRIC') {
    const set = dueRows.filter(c => c.charge_type === t)
    const isThisMonth = (c: typeof set[number]) =>
      (t === 'RENT' ? String(c.period_start ?? '').slice(0, 7) : String(c.period_end ?? '').slice(0, 7)) === curYM
    const unpaid = set.filter(c => DUE.includes(c.status))
    const overdue = unpaid.filter(c =>
      t === 'RENT'
        ? String(c.period_start ?? '') < curMonthStart
        : String(c.period_end ?? '') < prevMonthStart
    )
    return {
      countThisMonth: set.filter(isThisMonth).length,
      grossThisMonth: set.filter(isThisMonth).reduce((s, c) => s + num(c.gross_amount), 0),
      outstanding:    unpaid.reduce((s, c) => s + num(c.outstanding_amount), 0),
      overdue:        overdue.reduce((s, c) => s + num(c.outstanding_amount), 0),
    }
  }
  const rentM = metrics('RENT')
  const elecM = metrics('ELECTRIC')

  // Pending work still on the Invoicing screen (not yet issued)
  const pendingDrafts   = allRows.filter(c => c.status === 'DRAFT').length
  const pendingApproved = allRows.filter(c => c.status === 'APPROVED').length

  const summaryCards = [
    { title: 'Charges this month', rent: String(rentM.countThisMonth), elec: String(elecM.countThisMonth), alert: false },
    { title: 'Gross billed (month)', rent: fmt(rentM.grossThisMonth), elec: fmt(elecM.grossThisMonth), alert: false },
    { title: 'Outstanding', rent: fmt(rentM.outstanding), elec: fmt(elecM.outstanding), alert: false },
    { title: 'Overdue (1+ period old)', rent: fmt(rentM.overdue), elec: fmt(elecM.overdue), alert: true },
  ]

  // Invoice packs: rent grouped by period_start month, electric by period_end month
  const rentMonths = Array.from(new Set(
    allRows.filter(c => c.charge_type === 'RENT' && c.period_start)
      .map(c => String(c.period_start).slice(0, 7))
  )).sort().reverse()
  const electricMonths = Array.from(new Set(
    allRows.filter(c => c.charge_type === 'ELECTRIC' && c.period_end)
      .map(c => String(c.period_end).slice(0, 7))
  )).sort().reverse()

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset.asset_name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Billing</span>
      </nav>

      <AssetTabs reference={reference} active="billing" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {asset.asset_name} {DASH} Billing
        </h1>
        <p className="text-sm text-slate-500 mt-1">Amounts due and outstanding. Invoices are prepared on the Invoicing screen.</p>
      </div>

      {/* Summary tiles — each split Rent / Electric */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {summaryCards.map(card => (
          <div key={card.title} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">{card.title}</p>
            <div className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-slate-400 uppercase">Rent</span>
                <span className={card.alert && rentM.overdue > 0 ? 'text-base font-bold text-red-600' : 'text-base font-bold text-slate-900'}>{card.rent}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-slate-400 uppercase">Electric</span>
                <span className={card.alert && elecM.overdue > 0 ? 'text-base font-bold text-red-600' : 'text-base font-bold text-slate-700'}>{card.elec}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pointer to pending work on the Invoicing screen */}
      {(pendingDrafts > 0 || pendingApproved > 0) && (
        <Link
          href={`/assets/${reference}/invoicing`}
          className="flex items-center justify-between gap-3 mb-6 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors"
        >
          <span className="text-sm text-amber-900">
            {pendingDrafts > 0 && <><span className="font-semibold">{pendingDrafts}</span> draft{pendingDrafts !== 1 ? 's' : ''}</>}
            {pendingDrafts > 0 && pendingApproved > 0 && <span> and </span>}
            {pendingApproved > 0 && <><span className="font-semibold">{pendingApproved}</span> approved</>}
            {' '}awaiting issue on the Invoicing screen.
          </span>
          <span className="text-sm font-medium text-amber-800 whitespace-nowrap">Go to Invoicing {String.fromCharCode(0x2192)}</span>
        </Link>
      )}

      {/* Invoice packs */}
      {(rentMonths.length > 0 || electricMonths.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Invoice PDFs</h2>
          <div className="flex flex-wrap gap-2">
            {rentMonths.map(m => (
              <a key={'r' + m}
                href={`/api/invoices?assetId=${asset.asset_id}&month=${m}&type=RENT`}
                target="_blank"
                className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                Rent {DASH} {monthLabel(m)}
              </a>
            ))}
            {electricMonths.map(m => (
              <a key={'e' + m}
                href={`/api/invoices?assetId=${asset.asset_id}&month=${m}&type=ELECTRIC`}
                target="_blank"
                className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                Electric {DASH} {monthLabel(m)}
              </a>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Each pack contains one invoice per tenant, ready to print or send.
          </p>
        </div>
      )}

      {/* Type filter + live outstanding totals */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold mr-1">Show:</span>
        {([['All', null], ['Rent', 'RENT'], ['Electric', 'ELECTRIC']] as [string, string | null][]).map(([label, val]) => (
          <Link
            key={label}
            href={val ? `/assets/${reference}/billing?type=${val}` : `/assets/${reference}/billing`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              typeFilter === val
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {label}
          </Link>
        ))}
        <span className="text-xs text-slate-400 ml-1">{rows.length} charge{rows.length !== 1 ? 's' : ''}</span>
        <span className="ml-auto text-xs text-slate-500">
          Outstanding {DASH} Rent <span className="font-semibold text-slate-700">{fmt(rentM.outstanding)}</span>
          <span className="mx-1.5 text-slate-300">|</span>
          Electric <span className="font-semibold text-slate-700">{fmt(elecM.outstanding)}</span>
        </span>
      </div>

      {/* Charges table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenant</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Net</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">VAT</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Gross</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Sent</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Due</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(c => (
              <tr key={c.charge_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-medium text-slate-900">{formatUnit(c.unit_reference)}</span>
                  <span className="block text-xs text-slate-400 font-mono">{c.unit_reference}</span>
                </td>
                <td className="px-4 py-3 text-slate-800 font-medium">{c.tenant_name}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{c.charge_label}</td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{fmt(c.net_amount)}</td>
                <td className="px-4 py-3 text-right text-slate-500 text-xs whitespace-nowrap">{fmt(c.vat_amount)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{fmt(c.gross_amount)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {statusLabel(c.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">
                  {c.sent_date
                    ? <span className="text-emerald-700">{methodLabel(c.sent_method)} {fmtDate(c.sent_date)}</span>
                    : <span className="text-amber-600 font-medium">Not sent</span>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(c.due_date)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <a
                    href={`/api/invoices?chargeId=${c.charge_id}`}
                    target="_blank"
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline mr-3"
                  >
                    PDF
                  </a>
                  <Link
                    href={`/assets/${reference}/billing/${c.charge_id}`}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
                  >
                    View {String.fromCharCode(0x2192)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm">
            Nothing due yet. Prepare and issue invoices on the{' '}
            <Link href={`/assets/${reference}/invoicing`} className="text-blue-600 hover:underline">Invoicing screen</Link>.
          </div>
        )}
      </div>
    </div>
  )
}

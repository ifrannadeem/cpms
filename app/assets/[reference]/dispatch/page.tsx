import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AssetTabs from '@/components/asset-tabs'
import { assembleInvoices, monthLabel, type InvoiceData } from '@/lib/invoice-data'
import { buildRentEmail, buildElectricEmail, type EmailDraft } from '@/lib/email-templates'

interface Props {
  params: Promise<{ reference: string }>
  searchParams: Promise<{ type?: string; month?: string }>
}

const DASH = String.fromCharCode(0x2014)
const ISSUED = ['ISSUED', 'OVERDUE', 'PART_PAID', 'PAID']

export default async function DispatchPage({ params, searchParams }: Props) {
  const { reference } = await params
  const sp = await searchParams
  const type: 'RENT' | 'ELECTRIC' = sp.type === 'ELECTRIC' ? 'ELECTRIC' : 'RENT'

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

  const { data: ledger } = await supabase
    .from('v_charge_ledger')
    .select('charge_id, period_start, period_end, status')
    .eq('asset_id', asset.asset_id)
    .eq('charge_type', type)
    .in('status', ISSUED)

  const rows = ledger ?? []
  const monthOf = (r: { period_start: string; period_end: string }) =>
    (type === 'ELECTRIC' ? r.period_end : r.period_start).slice(0, 7)
  const months = Array.from(new Set(rows.map(monthOf))).sort().reverse()
  const month = sp.month && months.includes(sp.month) ? sp.month : months[0]

  const chargeIds = rows.filter(r => monthOf(r) === month).map(r => r.charge_id)
  const invoices = chargeIds.length ? await assembleInvoices(chargeIds) : []

  const tenantIds = Array.from(new Set(invoices.map(i => i.tenantId)))
  const { data: tenants } = tenantIds.length
    ? await supabase.from('tenants')
        .select('tenant_id, invoice_email_to, accounts_contact_email, primary_contact_email')
        .in('tenant_id', tenantIds)
    : { data: [] }
  // Recipients: the dedicated invoice list if set, else the accounts/primary email.
  // Split on comma/semicolon, drop blanks and TBC placeholders.
  const emailById = new Map(
    (tenants ?? []).map(t => {
      const raw = t.invoice_email_to || t.accounts_contact_email || t.primary_contact_email || ''
      const parts = raw.split(/[,;]/).map((s: string) => s.trim()).filter((s: string) => s && !/tbc/i.test(s))
      return [t.tenant_id, parts.length ? parts.join(', ') : null]
    })
  )

  const byTenant = new Map<string, InvoiceData[]>()
  for (const inv of invoices) {
    const arr = byTenant.get(inv.tenantId) ?? []
    arr.push(inv)
    byTenant.set(inv.tenantId, arr)
  }

  const drafts: EmailDraft[] = Array.from(byTenant.entries())
    .map(([tid, invs]) => {
      const opts = { tenantId: tid, invoices: invs, assetName: asset.asset_name, to: emailById.get(tid) ?? null }
      return type === 'ELECTRIC' ? buildElectricEmail(opts) : buildRentEmail(opts)
    })
    .sort((a, b) => a.tenantName.localeCompare(b.tenantName))

  const withEmail = drafts.filter(d => d.to).length
  const monthName = month ? monthLabel(`${month}-01`) : DASH

  const tab = (t: 'RENT' | 'ELECTRIC', label: string) => (
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
          Preview of the email each tenant would receive, built from the issued invoices. This is a preview only
          {String.fromCharCode(0x2014)} sending is not enabled yet.
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
        <>
          <div className="mb-4 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
            <span><span className="font-semibold text-slate-900">{drafts.length}</span> email{drafts.length !== 1 ? 's' : ''} for {monthName}</span>
            <span><span className="font-semibold text-slate-900">{withEmail}</span> with an address on file</span>
            {withEmail < drafts.length && (
              <span className="text-amber-600">{drafts.length - withEmail} missing an email address</span>
            )}
          </div>

          <div className="space-y-4">
            {drafts.map(d => (
              <div key={d.tenantId} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-semibold text-slate-900">{d.tenantName}</span>
                    {d.to ? (
                      <span className="text-slate-500 ml-2">{d.to}</span>
                    ) : (
                      <span className="text-amber-600 ml-2">no email on file {DASH} add it on the tenancy</span>
                    )}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Subject</p>
                  <p className="text-sm font-medium text-slate-800 mb-4">{d.subject}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Body</p>
                  <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans mb-4">{d.body}</pre>
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Attachment{d.attachments.length !== 1 ? 's' : ''}</p>
                  <div className="flex flex-wrap gap-2">
                    {d.attachments.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md text-xs text-slate-600">
                        <span className="text-red-500 font-semibold">PDF</span> {a}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

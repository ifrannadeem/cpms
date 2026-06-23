'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/confirm-dialog'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)
const RARR  = String.fromCharCode(0x2192)

type RpcResult = { data: unknown; error: { message: string } | null }

function fmt(v: number | null | undefined): string {
  const n = v ?? 0
  if (isNaN(n)) return DASH
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthLabel(ym: string): string {
  return new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function formatUnit(ref: string): string {
  if (!ref) return DASH
  if (ref.startsWith('SGP-I-')) return 'Suite ' + ref.replace('SGP-I-', '')
  const parts = ref.trim().split('-')
  return 'Unit ' + parts[parts.length - 1]
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT:    'bg-slate-100 text-slate-600',
  APPROVED: 'bg-amber-100 text-amber-800',
  ISSUED:   'bg-blue-100 text-blue-700',
  PAID:     'bg-emerald-100 text-emerald-700',
  PART_PAID:'bg-amber-100 text-amber-800',
  OVERDUE:  'bg-red-100 text-red-700',
}
function statusLabel(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')
}

export interface RentRow {
  charge_id: string
  unit_reference: string
  tenant_name: string
  charge_label: string
  period: string
  net_amount: number
  vat_amount: number
  gross_amount: number
  vat_rate: number
  status: string
  sent_date: string | null
  sent_method: string | null
  preferred_method: string
}

const SENT_METHODS = ['EMAIL', 'WHATSAPP', 'POST', 'HAND']
function methodLabel(m: string | null): string {
  if (!m) return ''
  return m.charAt(0) + m.slice(1).toLowerCase()
}
function fmtDate(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface PreviewRow {
  lease_id: string
  tenant_name: string
  unit_reference: string
  net_amount: number
  vat_amount: number
  gross_amount: number
  already_exists: boolean
  note: string | null
}

interface Props {
  assetId: string
  assetReference: string
  rentRows: RentRow[]
}

function currentMonthValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function InvoicingClient({ assetId, rentRows }: Props) {
  const router = useRouter()
  const [month, setMonth]     = useState(currentMonthValue())
  const [busy, setBusy]       = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [sentMethod, setSentMethod] = useState('EMAIL')
  const [sentDate, setSentDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [pending, setPending] = useState<{ title: string; message: string; confirmLabel: string; act: () => void } | null>(null)

  // Charges that already exist for the selected month
  const monthRows = rentRows.filter(r => r.period === month)
  const monthDraft    = monthRows.filter(r => r.status === 'DRAFT').length
  const monthApproved = monthRows.filter(r => r.status === 'APPROVED').length
  const monthIssued   = monthRows.filter(r => !['DRAFT', 'APPROVED'].includes(r.status)).length

  // Rent-scoped asset-wide counts (Approve / Issue act on all rent drafts / approved)
  const rentDraft    = rentRows.filter(r => r.status === 'DRAFT').length
  const rentApproved = rentRows.filter(r => r.status === 'APPROVED').length

  const sum = (rows: { net_amount: number; vat_amount: number; gross_amount: number }[]) =>
    rows.reduce((a, r) => ({
      net: a.net + r.net_amount, vat: a.vat + r.vat_amount, gross: a.gross + r.gross_amount,
    }), { net: 0, vat: 0, gross: 0 })

  async function run(label: string, fn: () => PromiseLike<RpcResult>, ok: (data: unknown) => string) {
    setBusy(label)
    setMessage(null)
    const { data, error } = await fn()
    setBusy(null)
    if (error) { setMessage({ type: 'error', text: 'Error: ' + error.message }); return }
    setMessage({ type: 'success', text: ok(data) })
    router.refresh()
  }

  async function handlePreview() {
    setBusy('preview')
    setMessage(null)
    const { data, error } = await supabase.rpc('fn_preview_asset_rent_charges', {
      p_billing_month: month + '-01', p_asset_id: assetId,
    })
    setBusy(null)
    if (error) { setMessage({ type: 'error', text: 'Error: ' + error.message }); return }
    setPreview((data as PreviewRow[]) ?? [])
  }

  const handleGenerate = () => run('generate',
    () => supabase.rpc('fn_generate_asset_rent_charges', { p_billing_month: month + '-01', p_asset_id: assetId }),
    (d) => { const n = Array.isArray(d) ? d.length : 0; setPreview(null); return `Generated ${n} draft charge${n !== 1 ? 's' : ''} for ${monthLabel(month)}.` })

  const handleRegenerate = () => run('regenerate',
    () => supabase.rpc('fn_regenerate_asset_draft_charges', { p_billing_month: month + '-01', p_asset_id: assetId }),
    (d) => `Refreshed ${Number(d) || 0} draft charge${Number(d) !== 1 ? 's' : ''} from current lease terms.`)

  const handleApprove = () => run('approve',
    () => supabase.rpc('fn_approve_asset_charges', { p_asset_id: assetId, p_charge_type: 'RENT' }),
    (d) => `Approved ${Number(d) || 0} rent draft${Number(d) !== 1 ? 's' : ''}.`)

  const handleIssue = () => run('issue',
    () => supabase.rpc('fn_issue_asset_charges', { p_asset_id: assetId, p_charge_type: 'RENT' }),
    (d) => `Issued ${Number(d) || 0} rent charge${Number(d) !== 1 ? 's' : ''} ${DASH} now showing on Billing as due.`)

  // Issued charges for this month not yet marked as sent
  const issuedUnsent = monthRows.filter(r => !['DRAFT', 'APPROVED'].includes(r.status) && !r.sent_date)

  // Bulk: mark all issued-unsent using each tenant's own preferred channel
  const handleMarkSentPreferred = () => run('markpref',
    () => supabase.rpc('fn_mark_charges_sent_preferred', {
      p_charge_ids: issuedUnsent.map(r => r.charge_id), p_date: sentDate,
    }),
    (d) => `Marked ${Number(d) || 0} invoice${Number(d) !== 1 ? 's' : ''} as sent by each tenant's preferred method.`)

  // Bulk override: mark all with one chosen method
  const handleMarkSent = () => run('marksent',
    () => supabase.rpc('fn_mark_charges_sent', {
      p_charge_ids: issuedUnsent.map(r => r.charge_id), p_method: sentMethod, p_date: sentDate,
    }),
    (d) => `Marked ${Number(d) || 0} invoice${Number(d) !== 1 ? 's' : ''} as sent (${methodLabel(sentMethod).toLowerCase()}).`)

  // Per-row: mark one charge sent by the tenant's preferred method, dated today
  const markOne = (chargeId: string, method: string) => run('one-' + chargeId,
    () => supabase.rpc('fn_mark_charges_sent', {
      p_charge_ids: [chargeId], p_method: method, p_date: sentDate,
    }),
    () => `Marked 1 invoice as sent (${methodLabel(method).toLowerCase()}).`)

  const previewWouldCreate = preview?.filter(r => !r.already_exists).length ?? 0
  const previewTotals = sum(preview ?? [])
  const monthTotals = sum(monthRows)

  const notGenerated = monthRows.length === 0

  return (
    <div>
      {/* Workflow controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-1">Monthly rent run</h2>
        <p className="text-xs text-slate-400 mb-4">Preview {RARR} Generate drafts {RARR} Approve {RARR} Issue</p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Billing month</label>
            <input
              type="month"
              value={month}
              onChange={e => { setMonth(e.target.value); setPreview(null); setMessage(null) }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          {notGenerated && (
            <>
              <button onClick={handlePreview} disabled={!!busy}
                className="px-5 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
                {busy === 'preview' ? 'Loading...' : 'Preview charges'}
              </button>
              {preview && (
                <button onClick={handleGenerate} disabled={!!busy || previewWouldCreate === 0}
                  className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                  {busy === 'generate' ? 'Generating...' : `Generate ${previewWouldCreate} draft${previewWouldCreate !== 1 ? 's' : ''}`}
                </button>
              )}
            </>
          )}

          {monthDraft > 0 && (
            <button onClick={handleRegenerate} disabled={!!busy}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors">
              {busy === 'regenerate' ? 'Refreshing...' : 'Regenerate drafts'}
            </button>
          )}
          {rentDraft > 0 && (
            <button onClick={handleApprove} disabled={!!busy}
              className="px-5 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors">
              {busy === 'approve' ? 'Approving...' : `Approve ${rentDraft} draft${rentDraft !== 1 ? 's' : ''}`}
            </button>
          )}
          {rentApproved > 0 && (
            <button
              onClick={() => setPending({
                title: 'Issue invoices?',
                message: `This will issue ${rentApproved} approved rent invoice${rentApproved !== 1 ? 's' : ''}, post ${rentApproved !== 1 ? 'them' : 'it'} to Billing as amounts due, and date ${rentApproved !== 1 ? 'them' : 'it'} today.`,
                confirmLabel: 'Issue',
                act: handleIssue,
              })}
              disabled={!!busy}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors">
              {busy === 'issue' ? 'Issuing...' : `Issue ${rentApproved} approved`}
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-slate-600">{monthLabel(month)}:</span>
          <span>{monthDraft} draft</span>
          <span>{monthApproved} approved</span>
          <span>{monthIssued} issued</span>
          {notGenerated && <span className="text-slate-400">{DASH} nothing generated yet</span>}
        </div>

        {message && (
          <p className={`mt-3 text-sm font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* Review table — generated charges for the month (always visible once generated) */}
      {!notGenerated && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">{monthLabel(month)} rent {DASH} {monthRows.length} charge{monthRows.length !== 1 ? 's' : ''}</h3>
            <div className="flex gap-x-5 text-xs text-slate-600">
              <span>Net {fmt(monthTotals.net)}</span>
              <span>VAT {fmt(monthTotals.vat)}</span>
              <span className="font-semibold text-slate-900">Gross {fmt(monthTotals.gross)}</span>
            </div>
          </div>

          {/* Record dispatch — mark issued invoices as sent (per tenant's preferred method, or override) */}
          {issuedUnsent.length > 0 && (
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex flex-wrap items-center gap-2">
              <span className="text-xs text-amber-900 mr-1">
                <span className="font-semibold">{issuedUnsent.length}</span> issued, not yet sent {DASH} record dispatch on
              </span>
              <input type="date" value={sentDate} onChange={e => setSentDate(e.target.value)}
                className="border border-amber-200 rounded-md px-2 py-1 text-xs text-slate-700 bg-white focus:outline-none" />
              <button
                onClick={() => setPending({
                  title: 'Send all invoices?',
                  message: `This will send all ${issuedUnsent.length} issued invoice${issuedUnsent.length !== 1 ? 's' : ''}, each by the tenant's preferred method (Email / WhatsApp / Post), dated ${sentDate}. This cannot be undone.`,
                  confirmLabel: 'Send All',
                  act: handleMarkSentPreferred,
                })}
                disabled={!!busy}
                className="px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                {busy === 'markpref' ? 'Sending...' : 'Send All'}
              </button>
              <span className="text-xs text-slate-400">or all as</span>
              <select value={sentMethod} onChange={e => setSentMethod(e.target.value)}
                className="border border-amber-200 rounded-md px-2 py-1 text-xs text-slate-700 bg-white focus:outline-none">
                {SENT_METHODS.map(m => <option key={m} value={m}>{methodLabel(m)}</option>)}
              </select>
              <button
                onClick={() => setPending({
                  title: 'Send all invoices?',
                  message: `This will send all ${issuedUnsent.length} issued invoice${issuedUnsent.length !== 1 ? 's' : ''} as ${methodLabel(sentMethod)}, dated ${sentDate}. This cannot be undone.`,
                  confirmLabel: 'Send',
                  act: handleMarkSent,
                })}
                disabled={!!busy}
                className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors">
                {busy === 'marksent' ? 'Sending...' : 'Send all'}
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-white border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Unit</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Tenant</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Net</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">VAT</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Gross</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Sent</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthRows.map(r => (
                  <tr key={r.charge_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{formatUnit(r.unit_reference)}</span>
                      <span className="block text-xs text-slate-400 font-mono">{r.unit_reference}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{r.tenant_name}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">{fmt(r.net_amount)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500 text-xs whitespace-nowrap">{r.vat_amount > 0 ? fmt(r.vat_amount) : DASH}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{fmt(r.gross_amount)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                      {['DRAFT', 'APPROVED'].includes(r.status)
                        ? <span className="text-slate-300">{DASH}</span>
                        : r.sent_date
                          ? <span className="text-emerald-700">{methodLabel(r.sent_method)} {fmtDate(r.sent_date)}</span>
                          : (
                            <span className="flex items-center gap-2">
                              <span className="text-slate-400">prefers {methodLabel(r.preferred_method)}</span>
                              <button
                                onClick={() => setPending({
                                  title: 'Send invoice?',
                                  message: `Send this invoice to ${r.tenant_name} by ${methodLabel(r.preferred_method)}, dated ${sentDate}? This cannot be undone.`,
                                  confirmLabel: 'Send',
                                  act: () => markOne(r.charge_id, r.preferred_method),
                                })}
                                disabled={!!busy}
                                className="text-blue-600 hover:underline font-medium disabled:opacity-50">
                                {busy === 'one-' + r.charge_id ? '...' : 'Send'}
                              </button>
                            </span>
                          )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <a href={`/api/invoices?chargeId=${r.charge_id}`} target="_blank"
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">PDF</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview panel — dry run before generating */}
      {notGenerated && preview && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">Preview {DASH} {monthLabel(month)}</h3>
            <div className="flex gap-x-5 text-xs text-slate-600">
              <span className="text-emerald-700 font-medium">{previewWouldCreate} to create</span>
              <span>Net {fmt(previewTotals.net)}</span>
              <span>VAT {fmt(previewTotals.vat)}</span>
              <span className="font-semibold text-slate-900">Gross {fmt(previewTotals.gross)}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-white border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Unit</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Tenant</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Net</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">VAT</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Gross</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.map(r => (
                  <tr key={r.lease_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 whitespace-nowrap font-medium text-slate-900">{formatUnit(r.unit_reference)}</td>
                    <td className="px-4 py-2.5 text-slate-800">{r.tenant_name}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">{fmt(r.net_amount)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500 text-xs whitespace-nowrap">{r.vat_amount > 0 ? fmt(r.vat_amount) : DASH}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{fmt(r.gross_amount)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{r.already_exists ? 'already exists' : r.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        title={pending?.title ?? ''}
        message={pending?.message ?? ''}
        confirmLabel={pending?.confirmLabel}
        onConfirm={() => { pending?.act(); setPending(null) }}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}

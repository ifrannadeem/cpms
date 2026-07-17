'use client'

import { useState } from 'react'
import { unitLabel as formatUnit } from '@/lib/format'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ConfirmDialog from '@/components/confirm-dialog'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)

type RpcResult = { data: unknown; error: { message: string } | null }

function fmt(v: number | null | undefined): string {
  const n = v ?? 0
  if (isNaN(n)) return DASH
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function periodLabel(start: string, end: string): string {
  if (!start) return DASH
  const s = new Date(start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  const e = end ? new Date(end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  return `${s} ${DASH} ${e}`
}
function methodLabel(m: string | null): string {
  if (!m) return ''
  return m.charAt(0) + m.slice(1).toLowerCase()
}

const SENT_METHODS = ['EMAIL', 'WHATSAPP', 'POST', 'HAND']
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

export interface ElectricRow {
  charge_id: string
  unit_reference: string
  tenant_name: string
  charge_label: string
  period: string
  period_end: string
  net_amount: number
  vat_amount: number
  gross_amount: number
  vat_rate: number
  status: string
  sent_date: string | null
  sent_method: string | null
  preferred_method: string
}

interface Props {
  assetId: string
  assetReference: string
  electricRows: ElectricRow[]
}

export default function ElectricInvoicingClient({ assetId, assetReference, electricRows }: Props) {
  const router = useRouter()
  const [busy, setBusy]       = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sentMethod, setSentMethod] = useState('EMAIL')
  const [sentDate, setSentDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [pending, setPending] = useState<{ title: string; message: string; confirmLabel: string; act: () => void } | null>(null)

  // Distinct reading cycles, newest first
  const periods = Array.from(new Set(electricRows.map(r => r.period))).filter(Boolean).sort().reverse()
  const [period, setPeriod] = useState(periods[0] ?? '')

  const periodRows = electricRows.filter(r => r.period === period)
  const periodEnd  = periodRows[0]?.period_end ?? ''

  const periodDraft    = periodRows.filter(r => r.status === 'DRAFT').length
  const periodApproved = periodRows.filter(r => r.status === 'APPROVED').length
  const periodIssued   = periodRows.filter(r => !['DRAFT', 'APPROVED'].includes(r.status)).length

  // Electric-scoped asset-wide counts (Approve / Issue act on all electric drafts / approved)
  const elecDraft    = electricRows.filter(r => r.status === 'DRAFT').length
  const elecApproved = electricRows.filter(r => r.status === 'APPROVED').length

  const issuedUnsent = periodRows.filter(r => !['DRAFT', 'APPROVED'].includes(r.status) && !r.sent_date)

  // Cancelled / written-off invoices stay listed (audit) but are excluded from the
  // cycle totals — they are not amounts due.
  const liveRows = periodRows.filter(r => !['CREDITED', 'WRITTEN_OFF'].includes(r.status))
  const totals = liveRows.reduce(
    (a, r) => ({ net: a.net + r.net_amount, vat: a.vat + r.vat_amount, gross: a.gross + r.gross_amount }),
    { net: 0, vat: 0, gross: 0 }
  )
  const cancelledGross = periodRows
    .filter(r => ['CREDITED', 'WRITTEN_OFF'].includes(r.status))
    .reduce((s, r) => s + r.gross_amount, 0)

  async function run(label: string, fn: () => PromiseLike<RpcResult>, ok: (data: unknown) => string) {
    setBusy(label)
    setMessage(null)
    const { data, error } = await fn()
    setBusy(null)
    if (error) { setMessage({ type: 'error', text: 'Error: ' + error.message }); return }
    setMessage({ type: 'success', text: ok(data) })
    router.refresh()
  }

  const handleApprove = () => run('approve',
    () => supabase.rpc('fn_approve_asset_charges', { p_asset_id: assetId, p_charge_type: 'ELECTRIC' }),
    (d) => `Approved ${Number(d) || 0} electric draft${Number(d) !== 1 ? 's' : ''}.`)

  const handleIssue = () => run('issue',
    () => supabase.rpc('fn_issue_asset_charges', { p_asset_id: assetId, p_charge_type: 'ELECTRIC' }),
    (d) => `Issued ${Number(d) || 0} electric charge${Number(d) !== 1 ? 's' : ''} ${DASH} now on Billing as due.`)

  const handleMarkSentPreferred = () => run('markpref',
    () => supabase.rpc('fn_mark_charges_sent_preferred', { p_charge_ids: issuedUnsent.map(r => r.charge_id), p_date: sentDate }),
    (d) => `Marked ${Number(d) || 0} invoice${Number(d) !== 1 ? 's' : ''} as sent by each tenant's preferred method.`)

  const handleMarkSent = () => run('marksent',
    () => supabase.rpc('fn_mark_charges_sent', { p_charge_ids: issuedUnsent.map(r => r.charge_id), p_method: sentMethod, p_date: sentDate }),
    (d) => `Marked ${Number(d) || 0} invoice${Number(d) !== 1 ? 's' : ''} as sent (${methodLabel(sentMethod).toLowerCase()}).`)

  const markOne = (chargeId: string, method: string) => run('one-' + chargeId,
    () => supabase.rpc('fn_mark_charges_sent', { p_charge_ids: [chargeId], p_method: method, p_date: sentDate }),
    () => `Marked 1 invoice as sent (${methodLabel(method).toLowerCase()}).`)

  if (electricRows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <p className="text-slate-500 text-sm mb-3">No electric charges yet for this asset.</p>
        <Link href={`/assets/${assetReference}/electric`} className="text-blue-600 hover:underline text-sm font-medium">
          Record meter readings on the Electric screen {String.fromCharCode(0x2192)}
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-1">Electric run</h2>
        <p className="text-xs text-slate-400 mb-4">Review {String.fromCharCode(0x2192)} Approve {String.fromCharCode(0x2192)} Issue {String.fromCharCode(0x2192)} Send</p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Reading cycle</label>
            <select value={period} onChange={e => { setPeriod(e.target.value); setMessage(null) }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300">
              {periods.map(p => {
                const pe = electricRows.find(r => r.period === p)?.period_end ?? ''
                return <option key={p} value={p}>{periodLabel(p, pe)}</option>
              })}
            </select>
          </div>

          {elecDraft > 0 && (
            <button onClick={handleApprove} disabled={!!busy}
              className="px-5 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors">
              {busy === 'approve' ? 'Approving...' : `Approve ${elecDraft} draft${elecDraft !== 1 ? 's' : ''}`}
            </button>
          )}
          {elecApproved > 0 && (
            <button
              onClick={() => setPending({
                title: 'Issue invoices?',
                message: `This will issue ${elecApproved} approved electric invoice${elecApproved !== 1 ? 's' : ''}, post ${elecApproved !== 1 ? 'them' : 'it'} to Billing as amounts due, and date ${elecApproved !== 1 ? 'them' : 'it'} today.`,
                confirmLabel: 'Issue',
                act: handleIssue,
              })}
              disabled={!!busy}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors">
              {busy === 'issue' ? 'Issuing...' : `Issue ${elecApproved} approved`}
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-slate-600">{periodLabel(period, periodEnd)}:</span>
          <span>{periodDraft} draft</span>
          <span>{periodApproved} approved</span>
          <span>{periodIssued} issued</span>
        </div>

        {message && (
          <p className={`mt-3 text-sm font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* Review table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">{periodLabel(period, periodEnd)} {DASH} {periodRows.length} charge{periodRows.length !== 1 ? 's' : ''}</h3>
          <div className="flex gap-x-5 text-xs text-slate-600">
            <span>Net {fmt(totals.net)}</span>
            <span>VAT {fmt(totals.vat)}</span>
            <span className="font-semibold text-slate-900">Gross {fmt(totals.gross)}</span>
            {cancelledGross > 0 && (
              <span className="text-slate-400">(+ {fmt(cancelledGross)} cancelled, excluded)</span>
            )}
          </div>
        </div>

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
              {periodRows.map(r => (
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

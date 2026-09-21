'use client'

import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)
const DASH = String.fromCharCode(0x2014)

export interface SourceView {
  source_id: string
  name: string
  payer: string | null
  recurring: boolean
  vat_default: 'NONE' | 'STANDARD'
  active: boolean
  notes: string | null
}

export interface ReceiptView {
  receipt_id: string
  receipt_group: string
  source_name: string
  period_month: string
  received_date: string
  net: number
  vat: number
  gross: number
  description: string | null
  comments: string | null
}

type VatMode = 'NONE' | 'STANDARD' | 'MANUAL'

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300'

const round2 = (n: number) => Math.round(n * 100) / 100
const trunc2 = (n: number) => Math.trunc(n * 100 + 1e-9) / 100

function money(n: number): string {
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function addMonths(ym: string, k: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + k, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Mirrors fn_record_other_income exactly, so the preview is what will be saved. */
function splitVat(gross: number, mode: VatMode, manualVat: number): { net: number; vat: number } {
  const g = round2(gross)
  const vat = mode === 'NONE' ? 0 : mode === 'STANDARD' ? round2(g - round2(g / 1.2)) : round2(manualVat)
  return { net: round2(g - vat), vat }
}

export default function OtherIncomeClient({
  assetId, sources, receipts,
}: { assetId: string; sources: SourceView[]; receipts: ReceiptView[] }) {
  const router = useRouter()
  const activeSources = sources.filter(s => s.active)

  // ---------- record a receipt ----------
  const [sourceId, setSourceId] = useState('')
  const [receivedDate, setReceivedDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [vatMode, setVatMode] = useState<VatMode>('NONE')
  const [manualVat, setManualVat] = useState('')
  // Deliberately blank. The month a receipt belongs to is rarely the month it arrived
  // (Vehicle Control Services pay for the month before; Swarco a quarter ahead), and a
  // pre-filled date reads as a question already answered.
  const [month, setMonth] = useState('')
  const [months, setMonths] = useState('1')
  const [description, setDescription] = useState('')
  const [comments, setComments] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const source = sources.find(s => s.source_id === sourceId)
  const gross = parseFloat(amount)
  const n = Math.min(Math.max(parseInt(months, 10) || 1, 1), 12)
  const { net, vat } = splitVat(isNaN(gross) ? 0 : gross, vatMode, parseFloat(manualVat) || 0)
  const perMonth = n > 1 && !isNaN(gross) ? trunc2(gross / n) : null
  const lastMonth = perMonth != null ? round2(gross - perMonth * (n - 1)) : null
  const manualBad = vatMode === 'MANUAL' && (isNaN(parseFloat(manualVat)) || parseFloat(manualVat) < 0 || parseFloat(manualVat) > gross)
  const canRecord = !!sourceId && !!receivedDate && !!month && gross > 0 && !manualBad && !saving

  function chooseSource(id: string) {
    setSourceId(id)
    const s = sources.find(x => x.source_id === id)
    if (s) setVatMode(s.vat_default)
  }

  async function record() {
    if (!canRecord || !source) return
    const span = n > 1 ? `, spread over ${monthLabel(month)} to ${monthLabel(addMonths(month, n - 1))}` : ` for ${monthLabel(month)}`
    const vatText = vat > 0 ? `, including ${money(vat)} VAT` : ', no VAT'
    if (!confirm(`Record ${money(gross)} from ${source.name}, received ${shortDate(receivedDate)}${vatText}${span}?`)) return

    setSaving(true)
    setMessage(null)
    const { error } = await supabase.rpc('fn_record_other_income', {
      p_source_id: sourceId,
      p_received_date: receivedDate,
      p_gross: gross,
      p_vat_mode: vatMode,
      p_vat_amount: vatMode === 'MANUAL' ? parseFloat(manualVat) : null,
      p_first_month: `${month}-01`,
      p_months: n,
      p_description: description.trim() || null,
      p_comments: comments.trim() || null,
    })
    setSaving(false)
    if (error) { setMessage({ ok: false, text: error.message }); return }
    setMessage({ ok: true, text: `Recorded ${money(gross)} from ${source.name}.` })
    setAmount(''); setManualVat(''); setMonth(''); setMonths('1'); setDescription(''); setComments('')
    router.refresh()
  }

  // ---------- receipts, grouped by the month they belong to ----------
  const groupSize = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of receipts) m.set(r.receipt_group, (m.get(r.receipt_group) ?? 0) + 1)
    return m
  }, [receipts])
  const byMonth = useMemo(() => {
    const m = new Map<string, ReceiptView[]>()
    for (const r of receipts) {
      const k = r.period_month.slice(0, 7)
      const arr = m.get(k) ?? []
      arr.push(r)
      m.set(k, arr)
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [receipts])

  async function remove(r: ReceiptView) {
    const size = groupSize.get(r.receipt_group) ?? 1
    const scope = size > 1
      ? `This was one payment spread over ${size} months. All ${size} months will be removed.\n\n`
      : ''
    const reason = prompt(`${scope}Why is this being removed? (It is kept for the record, marked as removed.)`)
    if (reason === null) return
    if (!reason.trim()) { alert('A reason is required.'); return }
    const { error } = await supabase.rpc('fn_remove_other_income', {
      p_receipt_id: r.receipt_id, p_reason: reason.trim(), p_whole_payment: true,
    })
    if (error) { alert(error.message); return }
    router.refresh()
  }

  // ---------- sources ----------
  const blankSource = { name: '', payer: '', recurring: true, vat_default: 'NONE' as 'NONE' | 'STANDARD', active: true, notes: '' }
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState(blankSource)
  const [srcError, setSrcError] = useState<string | null>(null)

  function startEdit(s?: SourceView) {
    setSrcError(null)
    if (!s) { setEditing('new'); setDraft(blankSource); return }
    setEditing(s.source_id)
    setDraft({ name: s.name, payer: s.payer ?? '', recurring: s.recurring, vat_default: s.vat_default, active: s.active, notes: s.notes ?? '' })
  }

  async function saveSource() {
    if (!draft.name.trim()) { setSrcError('Give the source a name.'); return }
    const { error } = editing === 'new'
      ? await supabase.rpc('fn_add_other_income_source', {
          p_asset_id: assetId, p_name: draft.name, p_payer: draft.payer || null,
          p_recurring: draft.recurring, p_vat_default: draft.vat_default, p_notes: draft.notes || null,
        })
      : await supabase.rpc('fn_update_other_income_source', {
          p_source_id: editing, p_name: draft.name, p_payer: draft.payer || null,
          p_recurring: draft.recurring, p_vat_default: draft.vat_default, p_active: draft.active, p_notes: draft.notes || null,
        })
    if (error) { setSrcError(error.message); return }
    setEditing(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Record */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Record income received</h2>
        {activeSources.length === 0 ? (
          <p className="text-sm text-slate-500">Add a source below first.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <label className="text-xs text-slate-500">Source
                <select value={sourceId} onChange={e => chooseSource(e.target.value)} className={`${inputClass} mt-1`}>
                  <option value="">Choose...</option>
                  {activeSources.map(s => (
                    <option key={s.source_id} value={s.source_id}>{s.name}{s.payer ? ` (${s.payer})` : ''}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-500">Date received
                <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-xs text-slate-500">Amount received ({POUND})
                <input type="number" step="0.01" min="0.01" placeholder="0.00" value={amount}
                  onChange={e => setAmount(e.target.value)} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-xs text-slate-500">Belongs to month <span className="text-red-500">*</span>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                  className={`${inputClass} mt-1 ${month ? '' : 'border-amber-400 bg-amber-50'}`} />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <div className="md:col-span-2">
                <p className="text-xs text-slate-500 mb-1">VAT</p>
                <div className="flex flex-wrap gap-2">
                  {([['NONE', 'No VAT'], ['STANDARD', 'Includes 20% VAT'], ['MANUAL', 'Enter VAT']] as [VatMode, string][]).map(([m, label]) => (
                    <button key={m} type="button" onClick={() => setVatMode(m)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${vatMode === m
                        ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      {label}
                    </button>
                  ))}
                  {vatMode === 'MANUAL' && (
                    <input type="number" step="0.01" min="0" placeholder={`VAT ${POUND}`} value={manualVat}
                      onChange={e => setManualVat(e.target.value)} className={`${inputClass} w-32`} />
                  )}
                </div>
              </div>
              <label className="text-xs text-slate-500">Months it covers
                <input type="number" min="1" max="12" value={months} onChange={e => setMonths(e.target.value)} className={`${inputClass} mt-1`} />
              </label>
              <div className="text-xs text-slate-600 self-end pb-2">
                {gross > 0 ? (
                  <>Net <strong>{money(net)}</strong>, VAT <strong>{money(vat)}</strong>{manualBad && <span className="text-red-600"> (VAT cannot exceed the amount)</span>}</>
                ) : <span className="text-slate-400">Net and VAT appear here</span>}
              </div>
            </div>

            {perMonth != null && month && (
              <p className="text-xs text-slate-600 mt-3">
                Spread as {money(perMonth)} a month
                {lastMonth !== perMonth && <> ({money(lastMonth!)} in the last)</>} across {monthLabel(month)} to {monthLabel(addMonths(month, n - 1))}.
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <label className="text-xs text-slate-500">Description
                <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                  placeholder={source?.recurring === false ? 'What this was for' : 'e.g. Q4 2026, or their reference'} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-xs text-slate-500">Comments
                <input type="text" value={comments} onChange={e => setComments(e.target.value)} placeholder="Optional" className={`${inputClass} mt-1`} />
              </label>
            </div>

            <div className="flex items-center gap-4 mt-5">
              <button onClick={record} disabled={!canRecord}
                className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-40 transition-colors">
                {saving ? 'Recording...' : 'Record'}
              </button>
              {!month && <span className="text-xs text-amber-700">Choose the month this income belongs to.</span>}
              {message && <span className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>{message.text}</span>}
            </div>
          </>
        )}
      </section>

      {/* Receipts */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide px-6 pt-5 pb-3">Received, by the month it belongs to</h2>
        {byMonth.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-slate-400">Nothing recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr className="text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-6 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Received</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-right">VAT</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Comments</th>
                  <th className="px-6 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {byMonth.map(([ym, rows]) => {
                  const t = rows.reduce((a, r) => ({ net: a.net + r.net, vat: a.vat + r.vat, gross: a.gross + r.gross }), { net: 0, vat: 0, gross: 0 })
                  return (
                    <Fragment key={ym}>
                      <tr className="bg-slate-50/60">
                        <td colSpan={3} className="px-6 pt-4 pb-1 font-semibold text-slate-800">{monthLabel(ym)}</td>
                        <td className="px-3 pt-4 pb-1 text-right font-semibold text-slate-700">{money(t.net)}</td>
                        <td className="px-3 pt-4 pb-1 text-right font-semibold text-slate-700">{money(t.vat)}</td>
                        <td className="px-3 pt-4 pb-1 text-right font-semibold text-slate-900">{money(t.gross)}</td>
                        <td colSpan={2}></td>
                      </tr>
                      {rows.map(r => {
                        const size = groupSize.get(r.receipt_group) ?? 1
                        return (
                          <tr key={r.receipt_id} className="border-b border-slate-100 align-top">
                            <td className="px-6 py-2 text-slate-800">{r.source_name}</td>
                            <td className="px-3 py-2 text-slate-600">
                              {r.description ?? DASH}
                              {size > 1 && <span className="block text-xs text-slate-400">Part of one payment over {size} months</span>}
                            </td>
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{shortDate(r.received_date)}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{money(r.net)}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{money(r.vat)}</td>
                            <td className="px-3 py-2 text-right font-medium text-slate-900">{money(r.gross)}</td>
                            <td className="px-3 py-2 text-xs text-slate-500 max-w-64">{r.comments ?? ''}</td>
                            <td className="px-6 py-2 text-right">
                              <button onClick={() => remove(r)} className="text-xs text-red-600 hover:underline">Remove</button>
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Sources */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Sources</h2>
          {editing === null && (
            <button onClick={() => startEdit()} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50">
              Add source
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-4 max-w-3xl">
          A recurring source appears in every monthly report, at nil when nothing came in, so a missed payment shows.
          A one-off source appears only in months it received something. Retiring a source keeps its history.
        </p>

        {editing !== null && (
          <div className="border border-slate-200 rounded-lg p-4 mb-4 bg-slate-50/50">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <label className="text-xs text-slate-500">Name
                <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Suite 2.9 parking" className={`${inputClass} mt-1`} />
              </label>
              <label className="text-xs text-slate-500">Who pays
                <input value={draft.payer} onChange={e => setDraft({ ...draft, payer: e.target.value })} placeholder="Optional" className={`${inputClass} mt-1`} />
              </label>
              <label className="text-xs text-slate-500">Type
                <select value={draft.recurring ? 'R' : 'O'} onChange={e => setDraft({ ...draft, recurring: e.target.value === 'R' })} className={`${inputClass} mt-1`}>
                  <option value="R">Recurring</option>
                  <option value="O">One-off / occasional</option>
                </select>
              </label>
              <label className="text-xs text-slate-500">VAT usually
                <select value={draft.vat_default} onChange={e => setDraft({ ...draft, vat_default: e.target.value as 'NONE' | 'STANDARD' })} className={`${inputClass} mt-1`}>
                  <option value="NONE">No VAT</option>
                  <option value="STANDARD">Includes 20% VAT</option>
                </select>
              </label>
            </div>
            <label className="text-xs text-slate-500 block mt-3">Notes
              <input value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" className={`${inputClass} mt-1`} />
            </label>
            {editing !== 'new' && (
              <label className="flex items-center gap-2 text-xs text-slate-600 mt-3">
                <input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />
                Active (untick to retire it; its history is kept)
              </label>
            )}
            <div className="flex items-center gap-3 mt-4">
              <button onClick={saveSource} className="px-4 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700">Save</button>
              <button onClick={() => setEditing(null)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
              {srcError && <span className="text-xs text-red-600">{srcError}</span>}
            </div>
          </div>
        )}

        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="py-2 text-left">Name</th>
              <th className="py-2 text-left">Who pays</th>
              <th className="py-2 text-left">Type</th>
              <th className="py-2 text-left">VAT usually</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sources.map(s => (
              <tr key={s.source_id} className={`border-b border-slate-100 ${s.active ? '' : 'text-slate-400'}`}>
                <td className="py-2 font-medium">{s.name}</td>
                <td className="py-2">{s.payer ?? DASH}</td>
                <td className="py-2">{s.recurring ? 'Recurring' : 'One-off'}</td>
                <td className="py-2">{s.vat_default === 'STANDARD' ? 'Includes 20%' : 'No VAT'}</td>
                <td className="py-2">{s.active ? 'Active' : 'Retired'}</td>
                <td className="py-2 text-right">
                  {editing === null && <button onClick={() => startEdit(s)} className="text-xs text-blue-600 hover:underline">Edit</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)

export interface ChaseAction {
  stage: string
  method: string | null
  action_date: string
  amount: number | null
  notes: string | null
}

interface Props {
  assetId: string
  tenantId: string
  tenantName: string
  preferredMethod: string
  amount: number
  oldestDue: string | null
  actions: ChaseAction[]
}

const STAGES = [
  { value: 'REMINDER',        label: 'Reminder' },
  { value: 'SECOND_REMINDER', label: 'Second reminder' },
  { value: 'FINAL_NOTICE',    label: 'Final notice' },
  { value: 'LBA',             label: 'Letter before action' },
  { value: 'OTHER',           label: 'Other' },
]
const METHODS = [
  { value: 'EMAIL',    label: 'Email' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'POST',     label: 'Post' },
  { value: 'CALL',     label: 'Phone call' },
  { value: 'OTHER',    label: 'Other' },
]

function stageLabel(s: string): string {
  return STAGES.find(x => x.value === s)?.label ?? s
}
function gbp(n: number): string {
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function nextStage(actions: ChaseAction[]): string {
  if (actions.length === 0) return 'REMINDER'
  const order = ['REMINDER', 'SECOND_REMINDER', 'FINAL_NOTICE', 'LBA']
  const last = actions[0].stage // actions sorted newest-first
  const idx = order.indexOf(last)
  if (idx === -1) return 'REMINDER'
  return order[Math.min(idx + 1, order.length - 1)]
}

function buildMessage(stage: string, tenant: string, amount: number, oldestDue: string | null): string {
  const due = oldestDue ? ` (oldest amount due ${fmtDate(oldestDue)})` : ''
  const bal = gbp(amount)
  switch (stage) {
    case 'REMINDER':
      return `Dear ${tenant},\n\nOur records show an outstanding balance of ${bal} on your account${due}. We would be grateful if you could arrange payment at your earliest convenience. If you have already paid, please disregard this message.\n\nKind regards`
    case 'SECOND_REMINDER':
      return `Dear ${tenant},\n\nFurther to our earlier reminder, your account remains in arrears by ${bal}${due}. Please arrange payment without further delay, or contact us to discuss.\n\nKind regards`
    case 'FINAL_NOTICE':
      return `Dear ${tenant},\n\nDespite previous reminders, your account is still in arrears by ${bal}${due}. This is a final notice: please settle the outstanding balance within 7 days to avoid further action.\n\nKind regards`
    case 'LBA':
      return `Dear ${tenant},\n\nYour account remains in arrears by ${bal}${due}. As previous reminders have gone unanswered, we may now refer the matter for recovery. Please treat this as a letter before action and settle the balance within 7 days.\n\nKind regards`
    default:
      return `Dear ${tenant},\n\nRegarding the outstanding balance of ${bal} on your account${due}.`
  }
}

export default function ChaseCell({ assetId, tenantId, tenantName, preferredMethod, amount, oldestDue, actions }: Props) {
  const router = useRouter()
  const [open, setOpen]     = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [stage, setStage]   = useState(() => nextStage(actions))
  const [method, setMethod] = useState(() => (METHODS.some(m => m.value === preferredMethod) ? preferredMethod : 'EMAIL'))
  const [date, setDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes]   = useState('')
  const [copied, setCopied] = useState(false)

  const last = actions[0]

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('fn_log_arrears_action', {
      p_asset_id: assetId, p_tenant_id: tenantId, p_stage: stage,
      p_method: method, p_amount: amount, p_notes: notes.trim() || null, p_date: date,
    })
    setSaving(false)
    if (rpcError) { setError(rpcError.message); return }
    setOpen(false)
    setNotes('')
    router.refresh()
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(buildMessage(stage, tenantName, amount, oldestDue))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <>
      <div className="flex items-center gap-2 justify-end">
        <span className="text-xs text-slate-500 whitespace-nowrap">
          {last ? <>{stageLabel(last.stage)} <span className="text-slate-400">{fmtDate(last.action_date)}</span></> : <span className="text-slate-400">Not chased</span>}
        </span>
        <button onClick={() => setOpen(true)}
          className="px-2.5 py-1 bg-slate-800 text-white text-xs font-medium rounded-md hover:bg-slate-700 transition-colors whitespace-nowrap">
          Log chase
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-slate-900 mb-1">Log a chase {String.fromCharCode(0x2014)} {tenantName}</h3>
            <p className="text-sm text-slate-500 mb-4">Owes {gbp(amount)}{oldestDue ? `, oldest due ${fmtDate(oldestDue)}` : ''}.</p>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <label className="text-xs text-slate-500">Stage
                <select value={stage} onChange={e => setStage(e.target.value)}
                  className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300">
                  {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">Method
                <select value={method} onChange={e => setMethod(e.target.value)}
                  className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300">
                  {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">Date
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </label>
            </div>

            <label className="text-xs text-slate-500 block mb-3">Notes
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </label>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">Suggested message (copy &amp; send via {METHODS.find(m => m.value === method)?.label})</span>
                <button onClick={copyMessage} className="text-xs font-medium text-blue-600 hover:underline">{copied ? 'Copied' : 'Copy'}</button>
              </div>
              <textarea readOnly value={buildMessage(stage, tenantName, amount, oldestDue)}
                className="w-full h-32 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 bg-slate-50 focus:outline-none resize-none" />
            </div>

            {actions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">History</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {actions.map((a, i) => (
                    <div key={i} className="text-xs text-slate-600 flex gap-2">
                      <span className="text-slate-400 whitespace-nowrap">{fmtDate(a.action_date)}</span>
                      <span className="font-medium">{stageLabel(a.stage)}</span>
                      {a.method && <span className="text-slate-400">via {a.method.toLowerCase()}</span>}
                      {a.notes && <span className="text-slate-400 truncate">{String.fromCharCode(0x2014)} {a.notes}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Record chase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

interface Props {
  chargeId: string
  paid: number
}

const inputClass =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300'

/**
 * Cancels (credits) or writes off an issued invoice via fn_cancel_charge.
 * The record is never deleted: the status change, reason and date stay on the
 * charge and in the activity log for audit.
 */
export default function CancelCharge({ chargeId, paid }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<'CREDITED' | 'WRITTEN_OFF'>('CREDITED')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (reason.trim() === '') { setError('A reason is required'); return }
    if (!confirming) { setConfirming(true); setError(null); return }
    setSaving(true); setError(null)
    const { error: e } = await supabase.rpc('fn_cancel_charge', {
      p_charge_id: chargeId,
      p_outcome: outcome,
      p_reason: reason.trim(),
    })
    setSaving(false)
    if (e) { setError(e.message); setConfirming(false); return }
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="px-4 py-2 border border-red-200 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors">
        Cancel / write off invoice
      </button>
    )
  }

  return (
    <div className="bg-white border border-red-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-1">Cancel Invoice</h2>
      <p className="text-xs text-slate-400 mb-4 max-w-xl">
        The invoice is kept for audit with its reason and date; it stops counting as outstanding and
        leaves the arrears list. Use <span className="font-medium text-slate-600">Cancelled</span> when the
        invoice is not due (e.g. raised after a surrender), or <span className="font-medium text-slate-600">Written
        off</span> for amounts due but being given up as unrecoverable.
      </p>
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Outcome</label>
          <select value={outcome} onChange={e => { setOutcome(e.target.value as 'CREDITED' | 'WRITTEN_OFF'); setConfirming(false) }}
            className={`${inputClass} w-56`}>
            <option value="CREDITED">Cancelled {String.fromCharCode(0x2014)} not due</option>
            <option value="WRITTEN_OFF">Written off {String.fromCharCode(0x2014)} bad debt</option>
          </select>
          {outcome === 'CREDITED' && paid > 0 && (
            <p className="text-[11px] text-amber-600 mt-1 max-w-56">
              A payment is recorded against this invoice, so cancelling will be refused. Adjust the amount instead.
            </p>
          )}
        </div>
        <div className="flex-1 min-w-64">
          <label className="block text-xs text-slate-500 mb-1.5">Reason (required)</label>
          <input type="text" value={reason} placeholder="e.g. Lease surrendered 30 June 2026"
            onChange={e => { setReason(e.target.value); setConfirming(false) }} className={inputClass} />
        </div>
      </div>
      {error && <p className="text-red-600 text-xs mt-3">{error}</p>}
      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} disabled={saving}
          className={`px-5 py-2 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors ${confirming ? 'bg-red-700 hover:bg-red-600' : 'bg-red-600 hover:bg-red-500'}`}>
          {saving ? 'Saving...' : confirming ? 'Confirm - this cannot be undone here' : outcome === 'CREDITED' ? 'Cancel this invoice' : 'Write off this invoice'}
        </button>
        <button onClick={() => { setOpen(false); setConfirming(false); setError(null) }}
          className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
          Keep invoice
        </button>
      </div>
    </div>
  )
}

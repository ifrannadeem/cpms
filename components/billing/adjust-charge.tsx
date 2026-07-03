'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)

interface Props {
  chargeId: string
  currentNet: number
}

const inputClass =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function AdjustCharge({ chargeId, currentNet }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [net, setNet] = useState(String(currentNet))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (net.trim() === '' || isNaN(parseFloat(net))) { setError('Enter a new net amount'); return }
    if (reason.trim() === '') { setError('A reason is required'); return }
    setSaving(true); setError(null)
    const { error: e } = await supabase.rpc('fn_adjust_issued_charge', {
      p_charge_id: chargeId,
      p_new_net: parseFloat(net),
      p_reason: reason.trim(),
    })
    setSaving(false)
    if (e) { setError(e.message); return }
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
        Adjust invoice
      </button>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-1">Adjust Invoice</h2>
      <p className="text-xs text-slate-400 mb-4 max-w-xl">
        Sets a new net amount on this already-issued invoice (VAT is recalculated automatically). The change and
        your reason are recorded in the activity log. Use this for one-off changes agreed after issue, such as a
        grace-period reduction.
      </p>
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">New net amount ({POUND})</label>
          <input type="number" step="0.01" min="0" value={net} onChange={e => setNet(e.target.value)}
            className={`${inputClass} w-40`} />
        </div>
        <div className="flex-1 min-w-64">
          <label className="block text-xs text-slate-500 mb-1.5">Reason (required)</label>
          <input type="text" value={reason} placeholder="e.g. Grace period agreed for July"
            onChange={e => setReason(e.target.value)} className={inputClass} />
        </div>
      </div>
      {error && <p className="text-red-600 text-xs mt-3">{error}</p>}
      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} disabled={saving}
          className="px-5 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save adjustment'}
        </button>
        <button onClick={() => { setOpen(false); setError(null) }}
          className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

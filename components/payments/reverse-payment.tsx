'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

interface Props {
  paymentId: string
  amount: number
  tenantName: string
}

/**
 * Reverses (deletes) a wrongly recorded receipt via fn_reverse_payment: the
 * allocations are unwound, affected charges revert to unpaid/part-paid, and the
 * reversal is logged with its reason against the tenant. Re-enter the correct
 * payment afterwards.
 */
export default function ReversePayment({ paymentId, amount, tenantName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (reason.trim() === '') { setError('Reason required'); return }
    setBusy(true); setError(null)
    const { error: e } = await supabase.rpc('fn_reverse_payment', {
      p_payment_id: paymentId,
      p_reason: reason.trim(),
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={`Reverse this ${String.fromCharCode(0xA3)}${amount.toFixed(2)} receipt from ${tenantName}`}
        className="text-xs text-red-600 hover:text-red-800 hover:underline whitespace-nowrap"
      >
        Reverse
      </button>
    )
  }

  return (
    <div className="min-w-52">
      <input
        type="text"
        autoFocus
        value={reason}
        placeholder="Reason (required)"
        onChange={e => setReason(e.target.value)}
        className="w-full border border-red-300 rounded-lg px-2 py-1 text-xs text-slate-700 mb-1.5 focus:outline-none focus:ring-2 focus:ring-red-200"
      />
      {error && <p className="text-[11px] text-red-600 mb-1">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={confirm}
          disabled={busy}
          className="px-2.5 py-1 bg-red-600 text-white text-[11px] font-medium rounded hover:bg-red-500 disabled:opacity-50"
        >
          {busy ? 'Reversing…' : 'Confirm reversal'}
        </button>
        <button
          onClick={() => { setOpen(false); setError(null) }}
          className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800"
        >
          Keep
        </button>
      </div>
    </div>
  )
}

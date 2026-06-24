'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const DASH = String.fromCharCode(0x2014)

export interface LeaseReview {
  lease_id: string
  next_rent_review_date: string | null
  rent_review_basis: string | null
  rent_review_frequency_months: number | null
  last_review_date: string | null
  // read-only computed context
  renewal_due: string
  action_required: string
  action_highlight: boolean
}

const BASIS_OPTIONS = [
  { value: 'OPEN_MARKET',  label: 'Open Market' },
  { value: 'RPI',          label: 'RPI' },
  { value: 'CPI',          label: 'CPI' },
  { value: 'FIXED_UPLIFT', label: 'Fixed Uplift' },
  { value: 'NONE',         label: 'None' },
]

function basisLabel(v: string | null): string {
  if (!v || v === 'NONE') return 'None'
  return BASIS_OPTIONS.find(o => o.value === v)?.label ?? v
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return DASH
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function RentReviewEditor({ review }: { review: LeaseReview }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [form, setForm] = useState({
    nextReview: review.next_rent_review_date ?? '',
    basis: review.rent_review_basis ?? 'NONE',
    frequency: review.rent_review_frequency_months != null ? String(review.rent_review_frequency_months) : '',
    lastReview: review.last_review_date ?? '',
  })

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('fn_update_lease_review', {
      p_lease_id: review.lease_id,
      p_next_rent_review_date: form.nextReview || null,
      p_rent_review_basis: form.basis,
      p_rent_review_frequency_months: form.frequency.trim() === '' ? null : parseInt(form.frequency, 10),
      p_last_review_date: form.lastReview || null,
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setEditing(false)
      router.refresh()
    }
  }

  const freqLabel = review.rent_review_frequency_months != null
    ? `Every ${review.rent_review_frequency_months} months`
    : DASH

  const rows: [string, string, boolean][] = [
    ['Next Rent Review', review.next_rent_review_date ? fmtDate(review.next_rent_review_date) : 'None scheduled', false],
    ['Review Basis', basisLabel(review.rent_review_basis), false],
    ['Review Frequency', freqLabel, false],
    ['Last Reviewed', review.last_review_date ? fmtDate(review.last_review_date) : DASH, false],
    ['Renewal Due', review.renewal_due, false],
    ['Action Required', review.action_required, review.action_highlight],
  ]

  if (!editing) {
    return (
      <div>
        <div className="divide-y divide-slate-100">
          {rows.map(([label, value, highlight]) => (
            <div key={label} className="grid grid-cols-[180px_1fr] gap-4 py-2.5 items-baseline">
              <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
              <div className={`text-sm ${highlight ? 'text-amber-700 font-medium' : 'text-slate-900'}`}>{value}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="mt-4 px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          Edit Review &amp; Renewal
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Next Rent Review</label>
          <input type="date" value={form.nextReview}
            onChange={e => setForm({ ...form, nextReview: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Review Basis</label>
          <select value={form.basis} onChange={e => setForm({ ...form, basis: e.target.value })}
            className={`${inputClass} bg-white`}>
            {BASIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Review Frequency (months)</label>
          <input type="number" min="1" value={form.frequency} placeholder="e.g. 36"
            onChange={e => setForm({ ...form, frequency: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Last Reviewed</label>
          <input type="date" value={form.lastReview}
            onChange={e => setForm({ ...form, lastReview: e.target.value })} className={inputClass} />
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Leave Next Review blank if no review is scheduled. Renewal due date follows the lease expiry,
        edited under Property &amp; Tenancy. Changes are recorded in the activity log.
      </p>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)}
          className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

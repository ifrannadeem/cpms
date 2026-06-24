'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const DASH = String.fromCharCode(0x2014)

export interface LeaseProperty {
  lease_id: string
  lease_type: string | null
  lease_state: string | null
  permitted_use: string | null
  commencement_date: string | null
  expiry_date: string | null
  original_start_date: string | null
  billing_frequency: string | null
  billing_day: number | null
}

const TYPE_OPTIONS = [
  { value: 'FIXED_TERM',      label: 'Fixed Term' },
  { value: 'PERIODIC',        label: 'Periodic' },
  { value: 'TENANCY_AT_WILL', label: 'Tenancy at Will' },
]
const FREQ_OPTIONS = [
  { value: 'MONTHLY',   label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUAL',    label: 'Annual' },
]
const FREQ_LABEL: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUAL: 'Annual' }

function fmtDate(s: string | null | undefined): string {
  if (!s) return DASH
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function durationVerbose(fromIso: string | null, toIso?: string | null): string | null {
  if (!fromIso) return null
  const from = new Date(fromIso)
  const to = toIso ? new Date(toIso) : new Date()
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (months < 0) return null
  const years = Math.floor(months / 12)
  months = months % 12
  const y = years > 0 ? `${years} year${years !== 1 ? 's' : ''}` : ''
  const m = months > 0 ? `${months} month${months !== 1 ? 's' : ''}` : ''
  if (y && m) return `${y}, ${m}`
  return y || m || 'Less than a month'
}

function tenancyTypeLabel(leaseType: string | null, leaseState: string | null): string {
  if (leaseType === 'FIXED_TERM' && leaseState === 'PERIODIC') return 'Fixed Term - now Periodic (holding over)'
  if (leaseType === 'FIXED_TERM') return 'Fixed Term'
  if (leaseType === 'PERIODIC') return 'Periodic'
  if (leaseType === 'TENANCY_AT_WILL') return 'Tenancy at Will'
  return DASH
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function PropertyTenancyEditor({ lease }: { lease: LeaseProperty }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [form, setForm] = useState({
    leaseType: lease.lease_type ?? 'FIXED_TERM',
    permittedUse: lease.permitted_use ?? '',
    commencement: lease.commencement_date ?? '',
    expiry: lease.expiry_date ?? '',
    originalStart: lease.original_start_date ?? '',
    billingFrequency: lease.billing_frequency ?? 'MONTHLY',
    billingDay: lease.billing_day != null ? String(lease.billing_day) : '1',
  })

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('fn_update_lease_property', {
      p_lease_id: lease.lease_id,
      p_lease_type: form.leaseType,
      p_permitted_use: form.permittedUse.trim() || null,
      p_commencement_date: form.commencement || null,
      p_expiry_date: form.expiry || null,
      p_original_start_date: form.originalStart || null,
      p_billing_frequency: form.billingFrequency,
      p_billing_day: form.billingDay.trim() === '' ? null : parseInt(form.billingDay, 10),
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setEditing(false)
      router.refresh()
    }
  }

  const fixedTerm = durationVerbose(lease.commencement_date, lease.expiry_date)
  const totalTerm = durationVerbose(lease.original_start_date)

  const rows: [string, React.ReactNode][] = [
    ['Permitted Use', lease.permitted_use ?? DASH],
    ['Type of Tenancy', tenancyTypeLabel(lease.lease_type, lease.lease_state)],
    ['Commencement & Term', (
      <span key="ld">
        Commencement: <span className="font-medium">{fmtDate(lease.commencement_date)}</span>
        <span className="text-slate-300 mx-2">|</span>
        Term: <span className="font-medium">{fixedTerm ?? DASH}</span>
      </span>
    )],
    ['Occupancy', (
      <span key="o" className="block">
        <span className="block">
          Original: <span className="font-medium">{fmtDate(lease.original_start_date)}</span>
          <span className="text-slate-300 mx-2">|</span>
          Renewal: <span className="font-medium">{fmtDate(lease.commencement_date)}</span>
          <span className="text-slate-300 mx-2">|</span>
          End of fixed term: <span className="font-medium">{fmtDate(lease.expiry_date)}</span>
        </span>
        {totalTerm && (
          <span className="block text-xs text-slate-500 mt-1">
            Total Term: <span className="font-semibold text-slate-700">{totalTerm}</span>
          </span>
        )}
      </span>
    )],
    ['Billing Frequency', (FREQ_LABEL[lease.billing_frequency ?? ''] ?? lease.billing_frequency ?? DASH)
      + (lease.billing_day != null ? ` (day ${lease.billing_day})` : '')],
  ]

  if (!editing) {
    return (
      <div>
        <div className="divide-y divide-slate-100">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[180px_1fr] gap-4 py-2.5 items-baseline">
              <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
              <div className="text-sm text-slate-900">{value}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="mt-4 px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          Edit Property &amp; Tenancy
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Type of Tenancy</label>
          <select value={form.leaseType} onChange={e => setForm({ ...form, leaseType: e.target.value })}
            className={`${inputClass} bg-white`}>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Permitted Use</label>
          <input type="text" value={form.permittedUse} placeholder="e.g. Office use (Class E)"
            onChange={e => setForm({ ...form, permittedUse: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Original Start Date</label>
          <input type="date" value={form.originalStart}
            onChange={e => setForm({ ...form, originalStart: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Commencement Date (current term)</label>
          <input type="date" value={form.commencement}
            onChange={e => setForm({ ...form, commencement: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Expiry Date (end of fixed term)</label>
          <input type="date" value={form.expiry}
            onChange={e => setForm({ ...form, expiry: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Billing Frequency</label>
          <select value={form.billingFrequency} onChange={e => setForm({ ...form, billingFrequency: e.target.value })}
            className={`${inputClass} bg-white`}>
            {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Billing Day (1{DASH}28)</label>
          <input type="number" min="1" max="28" value={form.billingDay}
            onChange={e => setForm({ ...form, billingDay: e.target.value })} className={inputClass} />
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Leave Expiry blank for an open-ended periodic tenancy. Changes are recorded in the activity log.
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

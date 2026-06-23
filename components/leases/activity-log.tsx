'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

export interface ActivityEntry {
  activity_id: string
  activity_type: string
  activity_at: string
  summary: string
}

interface Props {
  tenantId: string
  leaseId: string
  entries: ActivityEntry[]
}

// Auto-logged types (not manually addable)
const AUTO_TYPES: Record<string, { label: string; badge: string }> = {
  RENT_REVIEW: { label: 'Rent Review', badge: 'bg-purple-100 text-purple-700' },
  PAYMENT:     { label: 'Payment',     badge: 'bg-emerald-100 text-emerald-700' },
  SYSTEM:      { label: 'System',      badge: 'bg-slate-200 text-slate-600' },
}

const TYPES: { value: string; label: string; badge: string }[] = [
  { value: 'CALL',        label: 'Call',              badge: 'bg-blue-100 text-blue-700' },
  { value: 'EMAIL',       label: 'Email',             badge: 'bg-sky-100 text-sky-700' },
  { value: 'RENT_DEMAND', label: 'Rent Demand',       badge: 'bg-indigo-100 text-indigo-700' },
  { value: 'COMPLAINT',   label: 'Complaint',         badge: 'bg-red-100 text-red-700' },
  { value: 'MAINTENANCE', label: 'Maintenance Issue', badge: 'bg-amber-100 text-amber-800' },
  { value: 'SITE_VISIT',  label: 'Site Visit',        badge: 'bg-emerald-100 text-emerald-700' },
  { value: 'OTHER',       label: 'Other',             badge: 'bg-slate-100 text-slate-600' },
]

function typeMeta(v: string) {
  if (AUTO_TYPES[v]) return { value: v, ...AUTO_TYPES[v] }
  return TYPES.find(t => t.value === v) ?? TYPES[TYPES.length - 1]
}

function nowLocalISO(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const inputClass =
  'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function ActivityLog({ tenantId, leaseId, entries }: Props) {
  const router = useRouter()
  const [type, setType]       = useState('CALL')
  const [when, setWhen]       = useState(nowLocalISO())
  const [summary, setSummary] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleAdd() {
    if (!summary.trim()) {
      setError('Enter a short summary')
      return
    }
    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('fn_log_tenant_activity', {
      p_tenant_id: tenantId,
      p_activity_type: type,
      p_summary: summary.trim(),
      p_activity_at: new Date(when).toISOString(),
      p_lease_id: leaseId,
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setSummary('')
      setWhen(nowLocalISO())
      router.refresh()
    }
  }

  return (
    <div>
      {/* Add entry */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Type</label>
          <select value={type} onChange={e => setType(e.target.value)} className={`${inputClass} bg-white`}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Date &amp; Time</label>
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className={inputClass} />
        </div>
        <div className="flex-1 min-w-64">
          <label className="block text-xs text-slate-500 mb-1.5">Summary</label>
          <input type="text" value={summary} placeholder="e.g. Called re June rent - promised payment Friday"
            onChange={e => setSummary(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            className={`${inputClass} w-full`} />
        </div>
        <button
          onClick={handleAdd}
          disabled={saving}
          className="px-5 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Adding...' : 'Add Entry'}
        </button>
      </div>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {/* Timeline */}
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400">No activity recorded yet.</p>
      ) : (
        <div className="space-y-0">
          {entries.map(e => {
            const meta = typeMeta(e.activity_type)
            return (
              <div key={e.activity_id} className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 mt-0.5 ${meta.badge}`}>
                  {meta.label}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">{e.summary}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{fmtWhen(e.activity_at)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

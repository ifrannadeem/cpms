'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)

export interface LeaseTerms {
  lease_id: string
  permitted_use: string | null
  vat_treatment: string | null
  insurance_recharge: boolean
  deposit_amount: number | null
  deposit_type: string | null
  electric_recharge: boolean   // derived from meter status, display only
}

const VAT_OPTIONS = [
  { value: 'STANDARD',      label: 'Yes - Standard 20%' },
  { value: 'VAT_DEFERRED',  label: 'Deferred' },
  { value: 'EXEMPT',        label: 'Exempt' },
  { value: 'ZERO_RATED',    label: 'Zero rated' },
  { value: 'OUTSIDE_SCOPE', label: 'Outside scope' },
]

function vatLabel(v: string | null): string {
  return VAT_OPTIONS.find(o => o.value === v)?.label ?? DASH
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function LeaseTermsEditor({ terms }: { terms: LeaseTerms }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [form, setForm] = useState({
    permittedUse: terms.permitted_use ?? '',
    vat: terms.vat_treatment ?? 'EXEMPT',
    insurance: terms.insurance_recharge,
    deposit: terms.deposit_amount != null ? String(terms.deposit_amount) : '',
  })

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('fn_update_lease_terms', {
      p_lease_id: terms.lease_id,
      p_permitted_use: form.permittedUse.trim() || null,
      p_vat_treatment: form.vat,
      p_insurance_recharge: form.insurance,
      p_deposit_amount: form.deposit.trim() === '' ? null : parseFloat(form.deposit),
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setEditing(false)
      router.refresh()
    }
  }

  const rows: [string, string][] = [
    ['VAT Applicable', vatLabel(terms.vat_treatment)],
    ['Insurance Recharge', terms.insurance_recharge ? 'Yes' : 'No'],
    ['Electric Recharge', terms.electric_recharge ? 'Yes - sub-metered' : 'No'],
    ['Deposit Held', terms.deposit_amount != null && terms.deposit_amount > 0
      ? POUND + Number(terms.deposit_amount).toLocaleString('en-GB', { minimumFractionDigits: 2 }) +
        (terms.deposit_type && terms.deposit_type !== 'NONE' ? ` (${terms.deposit_type.toLowerCase()})` : '')
      : 'None'],
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
          Edit Terms
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">VAT Applicable</label>
          <select value={form.vat} onChange={e => setForm({ ...form, vat: e.target.value })}
            className={`${inputClass} bg-white`}>
            {VAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Deposit Held ({POUND})</label>
          <input type="number" step="0.01" min="0" value={form.deposit}
            onChange={e => setForm({ ...form, deposit: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Insurance Recharge</label>
          <select value={form.insurance ? 'YES' : 'NO'}
            onChange={e => setForm({ ...form, insurance: e.target.value === 'YES' })}
            className={`${inputClass} bg-white`}>
            <option value="NO">No</option>
            <option value="YES">Yes</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Permitted Use</label>
          <input type="text" value={form.permittedUse} placeholder="e.g. Office use (Class E)"
            onChange={e => setForm({ ...form, permittedUse: e.target.value })} className={inputClass} />
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Electric recharge is controlled by the meter billing toggle on the Electric page.
        VAT changes apply to future rent charges only.
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

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)

export interface VacantUnit {
  unit_id: string
  unit_reference: string
  unit_label: string
  unit_type: string | null
}

interface Props {
  assetReference: string
  vacantUnits: VacantUnit[]
}

function firstOfNextMonth(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function LetUnitForm({ assetReference, vacantUnits }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    legalName: '',
    tradingName: '',
    tenantType: 'COMPANY',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    leaseType: 'FIXED_TERM',
    commencement: firstOfNextMonth(),
    expiry: '',
    annualRent: '',
    billingFrequency: 'MONTHLY',
    vat: 'EXEMPT',
    deposit: '',
    electric: false,
  })

  function toggle(unitId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }

  async function handleLet() {
    if (selected.size === 0) { setError('Select at least one unit'); return }
    if (!form.legalName.trim()) { setError('Tenant legal name is required'); return }
    if (!form.annualRent) { setError('Annual rent is required'); return }
    if (form.leaseType === 'FIXED_TERM' && !form.expiry) { setError('Fixed term requires an expiry date'); return }
    const unitNames = vacantUnits.filter(u => selected.has(u.unit_id)).map(u => u.unit_label).join(', ')
    if (!confirm(`Let ${unitNames} to ${form.legalName.trim()} from ${form.commencement} at ${POUND}${form.annualRent} pa?`)) return

    setSaving(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('fn_let_unit', {
      p_unit_ids: Array.from(selected),
      p_legal_name: form.legalName.trim(),
      p_commencement: form.commencement,
      p_annual_rent: parseFloat(form.annualRent),
      p_trading_name: form.tradingName.trim() || null,
      p_tenant_type: form.tenantType,
      p_contact_name: form.contactName.trim() || null,
      p_contact_email: form.contactEmail.trim() || null,
      p_contact_phone: form.contactPhone.trim() || null,
      p_lease_type: form.leaseType,
      p_expiry: form.leaseType === 'FIXED_TERM' ? form.expiry : null,
      p_billing_frequency: form.billingFrequency,
      p_vat_treatment: form.vat,
      p_deposit: form.deposit.trim() === '' ? null : parseFloat(form.deposit),
      p_electric_recharge: form.electric,
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else {
      router.push(`/assets/${assetReference}/leases/${data}`)
      router.refresh()
    }
  }

  if (vacantUnits.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Vacant Units
          <span className="ml-2 font-normal normal-case text-slate-400">({vacantUnits.length})</span>
        </h2>
        {!open && (
          <button onClick={() => setOpen(true)}
            className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-500 transition-colors">
            Let Unit(s)
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {vacantUnits.map(u => (
          <label key={u.unit_id}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              selected.has(u.unit_id)
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
            }`}>
            <input type="checkbox" className="accent-emerald-600" checked={selected.has(u.unit_id)}
              onChange={() => { toggle(u.unit_id); setOpen(true) }} />
            {u.unit_label}
            {u.unit_type && <span className="text-slate-400 font-normal">({u.unit_type.toLowerCase()})</span>}
          </label>
        ))}
      </div>

      {open && (
        <div className="mt-5 border-t border-slate-100 pt-4 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New Tenant</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Legal Name *</label>
              <input type="text" value={form.legalName}
                onChange={e => setForm({ ...form, legalName: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Trading Name</label>
              <input type="text" value={form.tradingName}
                onChange={e => setForm({ ...form, tradingName: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tenant Type</label>
              <select value={form.tenantType} onChange={e => setForm({ ...form, tenantType: e.target.value })}
                className={`${inputClass} bg-white`}>
                <option value="COMPANY">Company</option>
                <option value="INDIVIDUAL">Individual</option>
                <option value="PARTNERSHIP">Partnership</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Contact Name</label>
              <input type="text" value={form.contactName}
                onChange={e => setForm({ ...form, contactName: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Contact Email</label>
              <input type="email" value={form.contactEmail}
                onChange={e => setForm({ ...form, contactEmail: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Contact Phone</label>
              <input type="tel" value={form.contactPhone}
                onChange={e => setForm({ ...form, contactPhone: e.target.value })} className={inputClass} />
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Lease Terms</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Type of Tenancy</label>
              <select value={form.leaseType} onChange={e => setForm({ ...form, leaseType: e.target.value })}
                className={`${inputClass} bg-white`}>
                <option value="FIXED_TERM">Fixed Term</option>
                <option value="PERIODIC">Periodic</option>
                <option value="TENANCY_AT_WILL">Tenancy at Will</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Commencement *</label>
              <input type="date" value={form.commencement}
                onChange={e => setForm({ ...form, commencement: e.target.value })} className={inputClass} />
            </div>
            {form.leaseType === 'FIXED_TERM' && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Expiry *</label>
                <input type="date" value={form.expiry}
                  onChange={e => setForm({ ...form, expiry: e.target.value })} className={inputClass} />
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Annual Rent ({POUND} pa) *</label>
              <input type="number" step="0.01" value={form.annualRent}
                onChange={e => setForm({ ...form, annualRent: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Billing Frequency</label>
              <select value={form.billingFrequency} onChange={e => setForm({ ...form, billingFrequency: e.target.value })}
                className={`${inputClass} bg-white`}>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">VAT Applicable</label>
              <select value={form.vat} onChange={e => setForm({ ...form, vat: e.target.value })}
                className={`${inputClass} bg-white`}>
                <option value="EXEMPT">Exempt</option>
                <option value="STANDARD">Yes - Standard 20%</option>
                <option value="VAT_DEFERRED">Deferred</option>
                <option value="ZERO_RATED">Zero rated</option>
                <option value="OUTSIDE_SCOPE">Outside scope</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Deposit ({POUND})</label>
              <input type="number" step="0.01" value={form.deposit}
                onChange={e => setForm({ ...form, deposit: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Electric Recharge</label>
              <select value={form.electric ? 'YES' : 'NO'}
                onChange={e => setForm({ ...form, electric: e.target.value === 'YES' })}
                className={`${inputClass} bg-white`}>
                <option value="NO">No</option>
                <option value="YES">Yes - sub-metered</option>
              </select>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex items-center gap-3">
            <button onClick={handleLet} disabled={saving}
              className="px-5 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors">
              {saving ? 'Creating...' : 'Create Tenancy'}
            </button>
            <button onClick={() => { setOpen(false); setError(null) }}
              className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

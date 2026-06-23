'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const DASH = String.fromCharCode(0x2014)

export interface TenantDetails {
  tenant_id: string
  legal_name: string
  trading_name: string | null
  company_number: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
  primary_contact_phone: string | null
  accounts_contact_name: string | null
  accounts_contact_email: string | null
  accounts_contact_phone: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  director_name: string | null
  correspondence_address: string | null
  preferred_delivery_method: string | null
}

const DELIVERY_METHODS = ['EMAIL', 'WHATSAPP', 'POST']
function methodLabel(m: string | null): string {
  if (!m) return 'Email'
  return m.charAt(0) + m.slice(1).toLowerCase()
}

interface Props {
  tenant: TenantDetails
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-400 mb-0.5">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value || DASH}</dd>
    </div>
  )
}

export default function TenantEditor({ tenant }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [saved, setSaved]     = useState(false)
  const [form, setForm] = useState({
    contact: tenant.primary_contact_name ?? '',
    email: tenant.primary_contact_email ?? '',
    phone: tenant.primary_contact_phone ?? '',
    accountsName: tenant.accounts_contact_name ?? '',
    accountsEmail: tenant.accounts_contact_email ?? '',
    accountsPhone: tenant.accounts_contact_phone ?? '',
    emergencyName: tenant.emergency_contact_name ?? '',
    emergencyPhone: tenant.emergency_contact_phone ?? '',
    director: tenant.director_name ?? '',
    companyNumber: tenant.company_number ?? '',
    address: tenant.correspondence_address ?? '',
    preferredMethod: tenant.preferred_delivery_method ?? 'EMAIL',
  })

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('fn_update_tenant_details', {
      p_tenant_id: tenant.tenant_id,
      p_contact_name: form.contact.trim() || null,
      p_contact_email: form.email.trim() || null,
      p_contact_phone: form.phone.trim() || null,
      p_accounts_name: form.accountsName.trim() || null,
      p_accounts_email: form.accountsEmail.trim() || null,
      p_accounts_phone: form.accountsPhone.trim() || null,
      p_emergency_name: form.emergencyName.trim() || null,
      p_emergency_phone: form.emergencyPhone.trim() || null,
      p_director_name: form.director.trim() || null,
      p_company_number: form.companyNumber.trim() || null,
      p_correspondence_address: form.address.trim() || null,
      p_preferred_delivery_method: form.preferredMethod || null,
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      router.refresh()
    }
  }

  if (!editing) {
    return (
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
          <Group title="Main Operational Contact">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Name" value={tenant.primary_contact_name} />
              <Field label="Phone" value={tenant.primary_contact_phone} />
              <div className="col-span-2"><Field label="Email" value={tenant.primary_contact_email} /></div>
            </div>
          </Group>
          <Group title="Accounts / Invoices Contact">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Name" value={tenant.accounts_contact_name} />
              <Field label="Phone" value={tenant.accounts_contact_phone} />
              <div className="col-span-2"><Field label="Email" value={tenant.accounts_contact_email} /></div>
              <div className="col-span-2"><Field label="Preferred invoice delivery" value={methodLabel(tenant.preferred_delivery_method)} /></div>
            </div>
          </Group>
          <Group title="Emergency Contact">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Name" value={tenant.emergency_contact_name} />
              <Field label="Phone" value={tenant.emergency_contact_phone} />
            </div>
          </Group>
          <Group title="Director / Authorised Signatory">
            <Field label="Name" value={tenant.director_name} />
          </Group>
          <Group title="Company">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Legal Name" value={tenant.legal_name} />
              <Field label="Company Number" value={tenant.company_number} />
            </div>
          </Group>
          <Group title="Company Address">
            <Field label="Correspondence Address" value={tenant.correspondence_address} />
          </Group>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            Edit Details
          </button>
          {saved && <span className="text-xs text-emerald-600 font-medium">Saved.</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
        <Group title="Main Operational Contact">
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="Name" value={form.contact}
              onChange={e => setForm({ ...form, contact: e.target.value })} className={inputClass} />
            <input type="tel" placeholder="Phone" value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })} className={inputClass} />
            <input type="email" placeholder="Email" value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })} className={`${inputClass} col-span-2`} />
          </div>
        </Group>
        <Group title="Accounts / Invoices Contact">
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="Name" value={form.accountsName}
              onChange={e => setForm({ ...form, accountsName: e.target.value })} className={inputClass} />
            <input type="tel" placeholder="Phone" value={form.accountsPhone}
              onChange={e => setForm({ ...form, accountsPhone: e.target.value })} className={inputClass} />
            <input type="email" placeholder="Email" value={form.accountsEmail}
              onChange={e => setForm({ ...form, accountsEmail: e.target.value })} className={`${inputClass} col-span-2`} />
            <label className="col-span-2 text-xs text-slate-500">
              Preferred invoice delivery
              <select value={form.preferredMethod}
                onChange={e => setForm({ ...form, preferredMethod: e.target.value })}
                className={`${inputClass} mt-1`}>
                {DELIVERY_METHODS.map(m => <option key={m} value={m}>{methodLabel(m)}</option>)}
              </select>
            </label>
          </div>
        </Group>
        <Group title="Emergency Contact">
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="Name" value={form.emergencyName}
              onChange={e => setForm({ ...form, emergencyName: e.target.value })} className={inputClass} />
            <input type="tel" placeholder="Phone" value={form.emergencyPhone}
              onChange={e => setForm({ ...form, emergencyPhone: e.target.value })} className={inputClass} />
          </div>
        </Group>
        <Group title="Director / Authorised Signatory">
          <input type="text" placeholder="Name" value={form.director}
            onChange={e => setForm({ ...form, director: e.target.value })} className={inputClass} />
        </Group>
        <Group title="Company Number">
          <input type="text" placeholder="e.g. 12345678" value={form.companyNumber}
            onChange={e => setForm({ ...form, companyNumber: e.target.value })} className={inputClass} />
        </Group>
        <Group title="Company Address">
          <input type="text" placeholder="Comma-separated lines" value={form.address}
            onChange={e => setForm({ ...form, address: e.target.value })} className={inputClass} />
        </Group>
      </div>
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

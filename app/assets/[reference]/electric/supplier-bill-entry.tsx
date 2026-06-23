'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

interface Props {
  assetId: string
  blocks: string[]
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function SupplierBillEntry({ assetId, blocks }: Props) {
  const router = useRouter()
  const [open, setOpen]     = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [form, setForm] = useState({
    block: blocks[0] ?? '',
    month: currentMonth(),
    supplier: '',
    kwh: '',
    net: '',
    vat: '',
    gross: '',
    notes: '',
  })

  const num = (s: string) => (s.trim() === '' ? null : parseFloat(s))

  async function handleSave() {
    if (!form.block) { setMessage({ type: 'error', text: 'Choose a block.' }); return }
    setSaving(true)
    setMessage(null)
    const { error } = await supabase.rpc('fn_upsert_supplier_bill', {
      p_asset_id: assetId,
      p_block_name: form.block,
      p_bill_month: form.month + '-01',
      p_supplier_name: form.supplier.trim() || null,
      p_kwh: num(form.kwh),
      p_net: num(form.net),
      p_vat: num(form.vat),
      p_gross: num(form.gross),
      p_notes: form.notes.trim() || null,
    })
    setSaving(false)
    if (error) { setMessage({ type: 'error', text: 'Error: ' + error.message }); return }
    setMessage({ type: 'success', text: 'Supplier bill saved.' })
    setForm({ ...form, supplier: '', kwh: '', net: '', vat: '', gross: '', notes: '' })
    router.refresh()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="px-4 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors">
        Enter supplier bill
      </button>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Enter supplier bill</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-xs text-slate-500">Block
          <select value={form.block} onChange={e => setForm({ ...form, block: e.target.value })} className={`${inputClass} mt-1`}>
            {blocks.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Bill month
          <input type="month" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-slate-500">Supplier
          <input type="text" placeholder="e.g. British Gas" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-slate-500">kWh
          <input type="number" step="0.01" value={form.kwh} onChange={e => setForm({ ...form, kwh: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-slate-500">Net (£)
          <input type="number" step="0.01" value={form.net} onChange={e => setForm({ ...form, net: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-slate-500">VAT (£)
          <input type="number" step="0.01" value={form.vat} onChange={e => setForm({ ...form, vat: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-slate-500">Gross (£)
          <input type="number" step="0.01" value={form.gross} onChange={e => setForm({ ...form, gross: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-slate-500">Notes
          <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
      </div>
      {message && <p className={`mt-3 text-sm font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save bill'}
        </button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">Close</button>
      </div>
    </div>
  )
}

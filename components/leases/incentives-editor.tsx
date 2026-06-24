'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)

export interface Incentive {
  incentive_id: string
  incentive_type: string
  headline_amount_annual: string | null
  discount_amount_monthly: string | null
  billed_amount_monthly: string | null
  incentive_start_date: string | null
  incentive_end_date: string | null
  active: boolean
}

interface Props {
  leaseId: string
  incentives: Incentive[]
}

const TYPE_LABEL: Record<string, string> = {
  RENT_FREE: 'Rent free', FIXED_DISCOUNT: 'Discount', STEPPED_RENT: 'Stepped rent',
}

function fmt(v: string | number | null): string {
  if (v == null || v === '') return DASH
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return DASH
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(s: string | null): string {
  if (!s) return DASH
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function IncentivesEditor({ leaseId, incentives }: Props) {
  const router = useRouter()
  const [adding, setAdding]     = useState(false)
  const [editingId, setEditing] = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [form, setForm] = useState({
    type: 'FIXED_DISCOUNT',
    headline: '',
    billed: '',
    start: new Date().toISOString().slice(0, 10),
    end: '',
    notes: '',
  })

  const today = new Date().toISOString().slice(0, 10)
  const isCurrent = (i: Incentive) =>
    i.active !== false &&
    (!i.incentive_start_date || i.incentive_start_date <= today) &&
    (!i.incentive_end_date || i.incentive_end_date >= today)

  function resetForm() {
    setForm({ type: 'FIXED_DISCOUNT', headline: '', billed: '', start: today, end: '', notes: '' })
  }

  function startAdd() {
    resetForm()
    setEditing(null)
    setError(null)
    setAdding(true)
  }

  function startEdit(i: Incentive) {
    setForm({
      type: i.incentive_type,
      headline: i.headline_amount_annual ?? '',
      billed: i.billed_amount_monthly ?? '',
      start: i.incentive_start_date ?? today,
      end: i.incentive_end_date ?? '',
      notes: '',
    })
    setEditing(i.incentive_id)
    setError(null)
    setAdding(true)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const common = {
      p_type: form.type,
      p_headline_annual: form.headline.trim() === '' ? null : parseFloat(form.headline),
      p_billed_monthly: form.type === 'RENT_FREE' ? 0 : (form.billed.trim() === '' ? null : parseFloat(form.billed)),
      p_start_date: form.start,
      p_end_date: form.end.trim() === '' ? null : form.end,
    }
    const { error: rpcError } = editingId
      ? await supabase.rpc('fn_update_rent_incentive', { p_incentive_id: editingId, ...common })
      : await supabase.rpc('fn_add_rent_incentive', { p_lease_id: leaseId, ...common, p_notes: form.notes.trim() || null })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setAdding(false)
      setEditing(null)
      resetForm()
      router.refresh()
    }
  }

  async function handleDelete(incentiveId: string) {
    if (!confirm('Delete this arrangement permanently? This cannot be undone.')) return
    const { error: rpcError } = await supabase.rpc('fn_delete_rent_incentive', { p_incentive_id: incentiveId })
    if (rpcError) setError(rpcError.message)
    else router.refresh()
  }

  async function handleEnd(incentiveId: string) {
    const end = prompt('End date for this arrangement (YYYY-MM-DD):', today)
    if (!end) return
    const { error: rpcError } = await supabase.rpc('fn_end_rent_incentive', {
      p_incentive_id: incentiveId,
      p_end_date: end,
    })
    if (rpcError) {
      setError(rpcError.message)
    } else {
      router.refresh()
    }
  }

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-400 uppercase tracking-wide">
          Discounts, Rent Free &amp; Stepped Rent
        </p>
        {!adding && (
          <button
            onClick={startAdd}
            className="px-3 py-1 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            + Add Arrangement
          </button>
        )}
      </div>

      {incentives.length === 0 && !adding && (
        <p className="text-sm text-slate-400">
          None {DASH} rent bills at the headline rate.
        </p>
      )}

      {incentives.length > 0 && (
        <table className="min-w-full text-sm mb-3">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="py-1.5 pr-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
              <th className="py-1.5 pr-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Headline pa</th>
              <th className="py-1.5 pr-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Billed /mo</th>
              <th className="py-1.5 pr-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">From</th>
              <th className="py-1.5 pr-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Until</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {incentives.map(i => {
              const current = isCurrent(i)
              return (
                <tr key={i.incentive_id} className={current ? 'bg-emerald-50/60' : 'opacity-70'}>
                  <td className="py-2 pr-4 text-slate-700">
                    {TYPE_LABEL[i.incentive_type] ?? i.incentive_type}
                    {current && <span className="ml-2 text-xs text-emerald-600 font-medium">current</span>}
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-700">{fmt(i.headline_amount_annual)}</td>
                  <td className="py-2 pr-4 text-right font-medium text-slate-900">{fmt(i.billed_amount_monthly)}</td>
                  <td className="py-2 pr-4 text-slate-600 text-xs whitespace-nowrap">{fmtDate(i.incentive_start_date)}</td>
                  <td className="py-2 pr-4 text-slate-600 text-xs whitespace-nowrap">{fmtDate(i.incentive_end_date)}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => startEdit(i)}
                      className="text-xs font-medium text-blue-600 hover:underline mr-3"
                    >
                      Edit
                    </button>
                    {current && (
                      <button
                        onClick={() => handleEnd(i.incentive_id)}
                        className="text-xs font-medium text-slate-500 hover:text-amber-600 hover:underline mr-3"
                      >
                        End
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(i.incentive_id)}
                      className="text-xs font-medium text-slate-500 hover:text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {adding && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className={`${inputClass} bg-white`}>
                <option value="FIXED_DISCOUNT">Discount</option>
                <option value="RENT_FREE">Rent free</option>
                <option value="STEPPED_RENT">Stepped rent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Headline Rent ({POUND} pa)</label>
              <input type="number" step="0.01" value={form.headline}
                onChange={e => setForm({ ...form, headline: e.target.value })} className={inputClass} />
            </div>
            {form.type !== 'RENT_FREE' && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Billed Rent ({POUND} /mo)</label>
                <input type="number" step="0.01" value={form.billed}
                  onChange={e => setForm({ ...form, billed: e.target.value })} className={inputClass} />
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-500 mb-1">From</label>
              <input type="date" value={form.start}
                onChange={e => setForm({ ...form, start: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Until (blank = open-ended)</label>
              <input type="date" value={form.end}
                onChange={e => setForm({ ...form, end: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <input type="text" value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })} className={inputClass} />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            For stepped rent, add one arrangement per step with consecutive date ranges.
            Future rent charges are billed at the arrangement covering the charge month.
          </p>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add'}
            </button>
            <button onClick={() => { setAdding(false); setEditing(null) }}
              className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && !adding && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </div>
  )
}

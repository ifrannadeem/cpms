'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import type { AssetOpt } from './rent-income-download'

export interface VatPeriod {
  period_id: string
  asset_id: string
  label: string
  period_start: string
  period_end: string
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const inputClass =
  'border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300'

function VatAssetCard({ asset, periods }: { asset: AssetOpt; periods: VatPeriod[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPlaza = asset.ref === 'ASSET-002'

  async function add() {
    if (!start || !end) { setError('Enter both start and end dates'); return }
    setSaving(true); setError(null)
    const { error: e } = await supabase.rpc('fn_add_vat_period', {
      p_asset_id: asset.id,
      p_label: label.trim() || `VAT quarter to ${fmtDate(end)}`,
      p_start: start,
      p_end: end,
    })
    setSaving(false)
    if (e) { setError(e.message); return }
    setAdding(false); setLabel(''); setStart(''); setEnd('')
    router.refresh()
  }

  async function remove(id: string) {
    if (!confirm('Delete this VAT quarter?')) return
    const { error: e } = await supabase.rpc('fn_delete_vat_period', { p_period_id: id })
    if (e) { setError(e.message); return }
    router.refresh()
  }

  return (
    <div className="border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{asset.name}</h3>
          {isPlaza && (
            <p className="text-xs text-amber-600 mt-0.5">No VAT registered {String.fromCharCode(0x2014)} placeholder</p>
          )}
        </div>
        <button onClick={() => setAdding(v => !v)}
          className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
          {adding ? 'Close' : 'Add quarter'}
        </button>
      </div>

      {adding && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Label</label>
              <input type="text" value={label} placeholder="e.g. Q1 2026/27"
                onChange={e => setLabel(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Period start</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Period end</label>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)} className={inputClass} />
            </div>
            <button onClick={add} disabled={saving}
              className="px-4 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Add'}
            </button>
          </div>
          {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
        </div>
      )}

      {periods.length === 0 ? (
        <p className="text-sm text-slate-400">No VAT quarters defined yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {periods.map(p => (
            <div key={p.period_id} className="flex items-center justify-between py-2.5">
              <div>
                <span className="text-sm font-medium text-slate-800">{p.label}</span>
                <span className="block text-xs text-slate-400">{fmtDate(p.period_start)} {String.fromCharCode(0x2192)} {fmtDate(p.period_end)}</span>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/api/reports/vat?periodId=${p.period_id}`} target="_blank"
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-500 transition-colors">
                  Download
                </a>
                <button onClick={() => remove(p.period_id)}
                  className="px-2.5 py-1.5 text-red-500 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function VatManager({ assets, periods }: { assets: AssetOpt[]; periods: VatPeriod[] }) {
  return (
    <div className="space-y-4">
      {assets.map(a => (
        <VatAssetCard key={a.id} asset={a} periods={periods.filter(p => p.asset_id === a.id)} />
      ))}
    </div>
  )
}

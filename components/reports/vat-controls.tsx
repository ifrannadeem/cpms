'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import type { AssetOpt } from './rent-income-download'

interface Props {
  assets: AssetOpt[]
  assetId: string
  year: number
  registered: boolean
  quarterEndMonth: number | null
  yearLabel: string
}

// stagger value = first quarter-END month: 3 = Mar/Jun/Sep/Dec, 4 = Apr/Jul/Oct/Jan, 5 = May/Aug/Nov/Feb
const STAGGERS = [
  { value: 3, label: 'Mar / Jun / Sep / Dec' },
  { value: 4, label: 'Apr / Jul / Oct / Jan' },
  { value: 5, label: 'May / Aug / Nov / Feb' },
]

function startMonth(qe: number | null): number {
  return qe ? (qe % 3) + 1 : 1
}
function vatYearLabel(year: number, qe: number | null): string {
  return startMonth(qe) === 1 ? `${year}` : `${year}/${String(year + 1).slice(2)}`
}

const inputClass =
  'border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function VatControls({ assets, assetId, year, registered, quarterEndMonth, yearLabel }: Props) {
  const router = useRouter()
  const [openSettings, setOpenSettings] = useState(false)
  const [reg, setReg] = useState(registered)
  const [stagger, setStagger] = useState<number | ''>(quarterEndMonth ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const years = [year + 1, year, year - 1, year - 2]

  function pickAsset(id: string) {
    router.push(`/reports?asset=${id}`)   // reset to that property's current VAT year
  }
  function pickYear(y: string) {
    router.push(`/reports?asset=${assetId}&vyear=${y}`)
  }
  function download() {
    window.open(`/api/reports/vat?assetId=${assetId}&year=${year}`, '_blank')
  }

  async function saveSettings() {
    setSaving(true); setError(null)
    const { error: e } = await supabase.rpc('fn_set_vat_config', {
      p_asset_id: assetId,
      p_registered: reg,
      p_quarter_end_month: reg ? (stagger === '' ? null : Number(stagger)) : null,
    })
    setSaving(false)
    if (e) { setError(e.message); return }
    setOpenSettings(false)
    router.refresh()
  }

  const staggerLabel = STAGGERS.find(s => s.value === quarterEndMonth)?.label

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Property</label>
          <select value={assetId} onChange={e => pickAsset(e.target.value)} className={`${inputClass} min-w-56`}>
            {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">VAT year</label>
          <select value={year} onChange={e => pickYear(e.target.value)} className={inputClass}>
            {years.map(y => <option key={y} value={y}>{vatYearLabel(y, quarterEndMonth)}</option>)}
          </select>
        </div>
        <button onClick={download} disabled={!registered}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors">
          Download Excel
        </button>
        <button onClick={() => setOpenSettings(v => !v)}
          className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
          VAT settings
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-2">
        {registered
          ? <>Quarters end <span className="font-medium text-slate-600">{staggerLabel ?? 'not set'}</span> {String.fromCharCode(0x00B7)} VAT year {yearLabel}</>
          : <>Not VAT registered.</>}
      </p>

      {openSettings && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-4 max-w-xl">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">VAT settings {String.fromCharCode(0x2014)} {assets.find(a => a.id === assetId)?.name}</h4>
          <label className="flex items-center gap-2 text-sm text-slate-700 mb-3">
            <input type="checkbox" checked={reg} onChange={e => setReg(e.target.checked)} className="rounded border-slate-300" />
            VAT registered
          </label>
          <div className={reg ? '' : 'opacity-40 pointer-events-none'}>
            <label className="block text-xs text-slate-500 mb-1.5">Quarter cycle (when your VAT quarters end)</label>
            <select value={stagger} onChange={e => setStagger(e.target.value === '' ? '' : Number(e.target.value))}
              className={`${inputClass} bg-white`}>
              <option value="">Select…</option>
              {STAGGERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1.5">Set this once {String.fromCharCode(0x2014)} every quarter after rolls forward automatically.</p>
          </div>
          {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
          <div className="flex items-center gap-3 mt-4">
            <button onClick={saveSettings} disabled={saving}
              className="px-5 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save settings'}
            </button>
            <button onClick={() => setOpenSettings(false)}
              className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'

export interface AssetOpt {
  id: string
  name: string
  ref: string
}

function prevMonth(): string {
  const now = new Date()
  const p = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`
}

const inputClass =
  'border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function RentIncomeDownload({ assets }: { assets: AssetOpt[] }) {
  const [assetId, setAssetId] = useState(assets[0]?.id ?? '')
  const [month, setMonth] = useState(prevMonth())

  function download() {
    if (!assetId || !month) return
    window.open(`/api/reports/rent-income?assetId=${assetId}&month=${month}`, '_blank')
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs text-slate-500 mb-1.5">Property</label>
        <select value={assetId} onChange={e => setAssetId(e.target.value)} className={`${inputClass} min-w-56`}>
          {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1.5">Month</label>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={inputClass} />
      </div>
      <button
        onClick={download}
        disabled={!assetId || !month}
        className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors"
      >
        Download Excel
      </button>
    </div>
  )
}

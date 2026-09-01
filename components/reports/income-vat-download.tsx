'use client'

import { useState } from 'react'
import type { AssetOpt } from './rent-income-download'

/** Opera holds no rent before July 2026 — the system went live that month, so offering
 *  earlier months would only produce empty columns and an awkward conversation with the
 *  accountant. Anything before this has to come from the previous records. */
export const DATA_STARTS = '2026-07'

function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const inputClass =
  'border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function IncomeVatDownload({ assets }: { assets: AssetOpt[] }) {
  const [assetId, setAssetId] = useState(assets[0]?.id ?? '')
  const [from, setFrom] = useState(DATA_STARTS)
  const [to, setTo] = useState(thisMonth())

  const badRange = !!from && !!to && from > to
  const beforeData = !!from && from < DATA_STARTS

  function download() {
    if (!assetId || !from || !to || badRange) return
    window.open(`/api/reports/income-vat?assetId=${assetId}&from=${from}&to=${to}`, '_blank')
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Property</label>
          <select value={assetId} onChange={e => setAssetId(e.target.value)} className={`${inputClass} min-w-56`}>
            {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">From</label>
          <input type="month" min={DATA_STARTS} value={from} onChange={e => setFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">To</label>
          <input type="month" min={DATA_STARTS} value={to} onChange={e => setTo(e.target.value)} className={inputClass} />
        </div>
        <button
          onClick={download}
          disabled={!assetId || !from || !to || badRange}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors"
        >
          Download Excel
        </button>
      </div>
      {badRange && (
        <p className="text-xs text-red-600 mt-2">The start month must not be after the end month.</p>
      )}
      {!badRange && beforeData && (
        <p className="text-xs text-amber-700 mt-2">
          Opera holds no rent before July 2026 — earlier months will come out empty. Records before then are
          outside the system.
        </p>
      )}
    </div>
  )
}

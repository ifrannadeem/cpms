'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const DASH = String.fromCharCode(0x2014)

export interface MeterRow {
  meter_id: string
  meter_reference: string
  unit_label: string
  dial_count: number
  active: boolean
  last_reading: number | null
  last_date: string | null
}

function fmtDate(s: string | null): string {
  if (!s) return DASH
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function todayISO(): string { return new Date().toISOString().slice(0, 10) }

const inputClass =
  'border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function ManageMeters({ rows }: { rows: MeterRow[] }) {
  const router = useRouter()
  const [savingDigits, setSavingDigits] = useState<string | null>(null)
  const [savedDigits, setSavedDigits] = useState<string | null>(null)
  const [error, setError] = useState<Record<string, string>>({})
  const [resetOpen, setResetOpen] = useState<string | null>(null)
  const [resetDate, setResetDate] = useState(todayISO())
  const [resetStart, setResetStart] = useState('0')
  const [resetNote, setResetNote] = useState('')
  const [resetSaving, setResetSaving] = useState(false)

  function setErr(id: string, msg: string | null) {
    setError(prev => { const n = { ...prev }; if (msg) n[id] = msg; else delete n[id]; return n })
  }

  async function changeDigits(row: MeterRow, value: number) {
    setSavingDigits(row.meter_id); setErr(row.meter_id, null)
    const { error: e } = await supabase.rpc('fn_set_meter_digits', { p_meter_id: row.meter_id, p_dial_count: value })
    setSavingDigits(null)
    if (e) { setErr(row.meter_id, e.message); return }
    setSavedDigits(row.meter_id)
    setTimeout(() => setSavedDigits(null), 1500)
    router.refresh()
  }

  async function saveReset(row: MeterRow) {
    if (!resetDate) { setErr(row.meter_id, 'Enter an effective date'); return }
    setResetSaving(true); setErr(row.meter_id, null)
    const { error: e } = await supabase.rpc('fn_reset_meter', {
      p_meter_id: row.meter_id,
      p_effective_date: resetDate,
      p_start_reading: resetStart.trim() === '' ? 0 : parseFloat(resetStart),
      p_note: resetNote.trim() || null,
    })
    setResetSaving(false)
    if (e) { setErr(row.meter_id, e.message); return }
    setResetOpen(null); setResetStart('0'); setResetNote(''); setResetDate(todayISO())
    router.refresh()
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full bg-white text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Meter</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Digits</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Latest Reading</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(row => (
            <tr key={row.meter_id} className="align-top hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`font-medium ${row.active ? 'text-slate-900' : 'text-slate-400'}`}>{row.unit_label}</span>
                {!row.active && <span className="block text-xs text-slate-400">billing off</span>}
                {error[row.meter_id] && <span className="block text-xs text-red-600 mt-1 max-w-xs">{error[row.meter_id]}</span>}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">{row.meter_reference}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <select
                    value={row.dial_count}
                    onChange={e => changeDigits(row, parseInt(e.target.value, 10))}
                    disabled={savingDigits === row.meter_id}
                    className={`${inputClass} w-20`}
                  >
                    {[4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span className="text-xs text-slate-400">
                    rolls at {Number(Math.pow(10, row.dial_count)).toLocaleString('en-GB')}
                  </span>
                  {savedDigits === row.meter_id && <span className="text-xs text-emerald-600">{String.fromCharCode(0x2713)} saved</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {row.last_reading != null ? (
                  <>
                    <span className="font-medium text-slate-700">{row.last_reading.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                    <span className="block text-xs text-slate-400">{fmtDate(row.last_date)}</span>
                  </>
                ) : <span className="text-xs text-amber-600">No reads yet</span>}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <button
                  onClick={() => setResetOpen(resetOpen === row.meter_id ? null : row.meter_id)}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {resetOpen === row.meter_id ? 'Close' : 'Reset / replace'}
                </button>
                {resetOpen === row.meter_id && (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-left inline-block">
                    <p className="text-xs text-slate-500 mb-2 max-w-xs">
                      Records a new starting reading from an effective date (use when a meter is replaced or wound back).
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Effective date</label>
                        <input type="date" value={resetDate} onChange={e => setResetDate(e.target.value)} className={inputClass} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Start reading</label>
                        <input type="number" step="0.001" min="0" value={resetStart} onChange={e => setResetStart(e.target.value)} className={`${inputClass} w-28`} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Note</label>
                        <input type="text" value={resetNote} placeholder="e.g. new meter" onChange={e => setResetNote(e.target.value)} className={inputClass} />
                      </div>
                      <button onClick={() => saveReset(row)} disabled={resetSaving}
                        className="px-4 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
                        {resetSaving ? 'Saving...' : 'Save reset'}
                      </button>
                    </div>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="p-12 text-center text-slate-400 text-sm">No meters registered for this asset.</div>
      )}
    </div>
  )
}

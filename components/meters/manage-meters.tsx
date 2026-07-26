'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase-browser'

const DASH = String.fromCharCode(0x2014)
const TICK = String.fromCharCode(0x2713)

export interface MeterRow {
  meter_id: string
  meter_reference: string
  serial_number: string | null
  unit_label: string
  dial_count: number
  active: boolean
  last_reading: number | null
  last_date: string | null
}

export interface AvailableUnit {
  unit_id: string
  unit_label: string
}

function fmtDate(s: string | null): string {
  if (!s) return DASH
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function todayISO(): string { return new Date().toISOString().slice(0, 10) }

const inputClass =
  'border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300'

interface Props {
  rows: MeterRow[]
  availableUnits: AvailableUnit[]
}

export default function ManageMeters({ rows, availableUnits }: Props) {
  const router = useRouter()
  const [savingDigits, setSavingDigits] = useState<string | null>(null)
  const [savedDigits, setSavedDigits] = useState<string | null>(null)
  const [error, setError] = useState<Record<string, string>>({})
  const [resetOpen, setResetOpen] = useState<string | null>(null)
  const [resetDate, setResetDate] = useState(todayISO())
  const [resetStart, setResetStart] = useState('0')
  const [resetNote, setResetNote] = useState('')
  const [resetSaving, setResetSaving] = useState(false)

  // Inline edit of reference / serial
  const [editOpen, setEditOpen] = useState<string | null>(null)
  const [editRef, setEditRef] = useState('')
  const [editSerial, setEditSerial] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Add a meter
  const [addOpen, setAddOpen] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [add, setAdd] = useState({
    unitId: '', reference: '', serial: '', digits: '6', reading: '', date: todayISO(),
  })

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

  function openEdit(row: MeterRow) {
    setEditOpen(row.meter_id)
    setEditRef(row.meter_reference)
    setEditSerial(row.serial_number ?? '')
    setResetOpen(null)
    setErr(row.meter_id, null)
  }

  async function saveEdit(row: MeterRow) {
    if (editRef.trim() === '') { setErr(row.meter_id, 'Meter reference cannot be empty'); return }
    setEditSaving(true); setErr(row.meter_id, null)
    const { error: e } = await supabase.rpc('fn_update_meter', {
      p_meter_id: row.meter_id,
      p_meter_reference: editRef.trim(),
      // '' clears the serial; the function treats null as "leave unchanged"
      p_serial_number: editSerial.trim(),
    })
    setEditSaving(false)
    if (e) { setErr(row.meter_id, e.message); return }
    setEditOpen(null)
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

  async function saveAdd() {
    if (!add.unitId) { setAddError('Choose a unit'); return }
    if (add.reference.trim() === '') { setAddError('Enter a meter reference'); return }
    if (add.reading.trim() === '' || isNaN(parseFloat(add.reading))) { setAddError('Enter the current meter reading'); return }
    if (!add.date) { setAddError('Enter the date the reading was taken'); return }
    setAddSaving(true); setAddError(null)
    const { error: e } = await supabase.rpc('fn_add_meter', {
      p_unit_id: add.unitId,
      p_meter_reference: add.reference.trim(),
      p_baseline_reading: parseFloat(add.reading),
      p_baseline_date: add.date,
      p_dial_count: parseInt(add.digits, 10),
      p_serial_number: add.serial.trim() || null,
    })
    setAddSaving(false)
    if (e) { setAddError(e.message); return }
    setAdd({ unitId: '', reference: '', serial: '', digits: '6', reading: '', date: todayISO() })
    setAddOpen(false)
    router.refresh()
  }

  return (
    <div>
      {/* Add a meter */}
      <div className="mb-4">
        {!addOpen ? (
          <button
            onClick={() => setAddOpen(true)}
            disabled={availableUnits.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add a meter
          </button>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-1">Add a meter</h2>
            <p className="text-xs text-slate-400 mb-4 max-w-2xl">
              Registers a meter against a unit and records its current reading as the starting point.
              The baseline raises no charge {DASH} billing begins from the next reading you enter.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Unit</label>
                <select value={add.unitId} onChange={e => setAdd({ ...add, unitId: e.target.value })}
                  className={`${inputClass} w-full`}>
                  <option value="">Choose{String.fromCharCode(0x2026)}</option>
                  {availableUnits.map(u => <option key={u.unit_id} value={u.unit_id}>{u.unit_label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Meter reference</label>
                <input type="text" value={add.reference} placeholder="e.g. MTR-SGP-2.5"
                  onChange={e => setAdd({ ...add, reference: e.target.value })} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Serial number (optional)</label>
                <input type="text" value={add.serial} placeholder="code on the meter"
                  onChange={e => setAdd({ ...add, serial: e.target.value })} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Digits on display</label>
                <select value={add.digits} onChange={e => setAdd({ ...add, digits: e.target.value })}
                  className={`${inputClass} w-full`}>
                  {[4, 5, 6, 7, 8].map(n => <option key={n} value={String(n)}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Current reading (kWh)</label>
                <input type="number" step="0.01" min="0" value={add.reading} placeholder="0"
                  onChange={e => setAdd({ ...add, reading: e.target.value })} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Reading taken on</label>
                <input type="date" value={add.date}
                  onChange={e => setAdd({ ...add, date: e.target.value })} className={`${inputClass} w-full`} />
              </div>
            </div>
            {addError && <p className="text-red-600 text-xs mt-3">{addError}</p>}
            <div className="flex items-center gap-3 mt-4">
              <button onClick={saveAdd} disabled={addSaving}
                className="px-5 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                {addSaving ? 'Adding...' : 'Add meter'}
              </button>
              <button onClick={() => { setAddOpen(false); setAddError(null) }}
                className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
        {availableUnits.length === 0 && !addOpen && (
          <p className="text-xs text-slate-400 mt-2">Every unit at this asset already has an active meter.</p>
        )}
      </div>

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
                <td className="px-4 py-3 whitespace-nowrap">
                  {editOpen === row.meter_id ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Reference</label>
                        <input type="text" value={editRef} onChange={e => setEditRef(e.target.value)} className={`${inputClass} w-40`} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Serial number</label>
                        <input type="text" value={editSerial} placeholder="optional"
                          onChange={e => setEditSerial(e.target.value)} className={`${inputClass} w-44`} />
                      </div>
                      <button onClick={() => saveEdit(row)} disabled={editSaving}
                        className="px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
                        {editSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditOpen(null)}
                        className="px-2 py-1.5 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs text-slate-600 font-mono">{row.meter_reference}</span>
                      <span className="block text-xs text-slate-400 font-mono">
                        {row.serial_number ? `Serial ${row.serial_number}` : 'no serial recorded'}
                      </span>
                    </>
                  )}
                </td>
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
                    {savedDigits === row.meter_id && <span className="text-xs text-emerald-600">{TICK} saved</span>}
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
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => (editOpen === row.meter_id ? setEditOpen(null) : openEdit(row))}
                      className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      {editOpen === row.meter_id ? 'Close' : 'Edit'}
                    </button>
                    <button
                      onClick={() => { setResetOpen(resetOpen === row.meter_id ? null : row.meter_id); setEditOpen(null) }}
                      className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      {resetOpen === row.meter_id ? 'Close' : 'Reset / replace'}
                    </button>
                  </div>
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
    </div>
  )
}

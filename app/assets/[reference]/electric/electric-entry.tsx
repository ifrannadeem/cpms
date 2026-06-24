'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)
const CHECK = String.fromCharCode(0x2713)
const ARROW = String.fromCharCode(0x2192)

export interface CycleRead {
  read_id: string
  date: string
  value: number
  consumption: number | null
  editable: boolean   // charge still DRAFT or no charge raised
}

export interface MeterRow {
  meter_id: string
  meter_reference: string
  unit_label: string
  tenant_name: string | null
  last_date: string | null
  last_value: number | null
  rate: number | null
  active: boolean
  reads: CycleRead[]   // newest first
}

interface Props {
  rows: MeterRow[]
}

interface RowState {
  date: string
  reading: string
  saving: boolean
  error: string | null
  editingReadId: string | null   // set when correcting an existing reading
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function blank(date: string): RowState {
  return { date, reading: '', saving: false, error: null, editingReadId: null }
}

function gbp(n: number): string {
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(s: string | null): string {
  if (!s) return DASH
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthLabel(iso: string): string {
  return new Date(iso.slice(0, 7) + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function ElectricEntry({ rows }: Props) {
  const router = useRouter()
  const [topDate, setTopDate] = useState(todayISO())
  const [states, setStates] = useState<Record<string, RowState>>(
    () => Object.fromEntries(rows.map(r => [r.meter_id, blank(todayISO())]))
  )

  function update(id: string, patch: Partial<RowState>) {
    setStates(prev => ({ ...prev, [id]: { ...(prev[id] ?? blank(topDate)), ...patch } }))
  }

  // Top read-date defaults every row; rows mid-edit are left alone.
  function applyTopDate(d: string) {
    setTopDate(d)
    setStates(prev => {
      const next = { ...prev }
      for (const r of rows) {
        const cur = next[r.meter_id] ?? blank(d)
        if (cur.editingReadId) continue
        next[r.meter_id] = { ...cur, date: d }
      }
      return next
    })
  }

  // Latest reading strictly before `date` (optionally ignoring the read being edited)
  function prevValueFor(row: MeterRow, date: string, excludeReadId?: string | null): number | null {
    const prior = row.reads
      .filter(r => r.date < date && r.read_id !== excludeReadId)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    return prior ? prior.value : null
  }

  async function handleSave(row: MeterRow) {
    const s = states[row.meter_id] ?? blank(topDate)
    const reading = parseFloat(s.reading)
    if (isNaN(reading)) {
      update(row.meter_id, { error: 'Enter a reading' })
      return
    }
    update(row.meter_id, { saving: true, error: null })
    const { error } = s.editingReadId
      ? await supabase.rpc('fn_update_meter_reading', {
          p_read_id: s.editingReadId, p_read_date: s.date, p_reading: reading,
        })
      : await supabase.rpc('fn_record_meter_reading', {
          p_meter_id: row.meter_id, p_read_date: s.date, p_reading: reading,
        })
    if (error) {
      update(row.meter_id, { saving: false, error: error.message })
    } else {
      update(row.meter_id, { saving: false, reading: '', editingReadId: null })
      router.refresh()
    }
  }

  async function handleClear(row: MeterRow, readId: string) {
    if (!confirm('Clear this reading? This removes the draft electric charge it raised so you can re-enter it.')) return
    update(row.meter_id, { error: null })
    const { error } = await supabase.rpc('fn_delete_meter_reading', { p_read_id: readId })
    if (error) {
      update(row.meter_id, { error: error.message })
    } else {
      router.refresh()
    }
  }

  function startEdit(row: MeterRow, cr: CycleRead) {
    update(row.meter_id, { editingReadId: cr.read_id, date: cr.date, reading: String(cr.value), error: null })
  }

  function cancelEdit(row: MeterRow) {
    update(row.meter_id, { editingReadId: null, reading: '', date: topDate, error: null })
  }

  async function handleToggle(row: MeterRow) {
    const { error } = await supabase.rpc('fn_set_meter_active', {
      p_meter_id: row.meter_id, p_active: !row.active,
    })
    if (error) update(row.meter_id, { error: error.message })
    else router.refresh()
  }

  return (
    <div className="mb-6">
      {/* Top control: one read date defaults every row */}
      <div className="flex flex-wrap items-end gap-3 mb-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Reading date {DASH} applies to all meters</label>
          <input type="date" value={topDate} onChange={e => applyTopDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </div>
        <p className="text-xs text-slate-400 pb-1.5">
          Cycle: <span className="font-medium text-slate-600">{monthLabel(topDate)}</span>.
          {' '}Meters already read this cycle are greyed out. You can still change a single date per line.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenant</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Reading</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Read Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">New Reading (kWh)</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Est. Charge</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Billing</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(row => {
              const s = states[row.meter_id] ?? blank(topDate)
              const editing = s.editingReadId != null
              const cycleMonth = s.date.slice(0, 7)
              const cycleRead = row.reads.find(r => r.date.slice(0, 7) === cycleMonth)
              const isLatestRead = !!cycleRead && row.reads.length > 0 && row.reads[0].read_id === cycleRead.read_id
              const showRecorded = !!cycleRead && !editing

              const reading = parseFloat(s.reading)
              const prevVal = prevValueFor(row, s.date, s.editingReadId)
              const consumption = !isNaN(reading) && prevVal != null && reading >= prevVal ? reading - prevVal : null
              const estNet = consumption != null && row.rate != null
                ? Math.round(consumption * row.rate * 100) / 100 : null

              return (
                <tr key={row.meter_id}
                  className={`transition-colors align-top ${showRecorded ? 'bg-slate-50/70' : row.active ? 'hover:bg-slate-50' : 'bg-slate-50'}`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`font-medium ${showRecorded ? 'text-slate-500' : 'text-slate-900'}`}>{row.unit_label}</span>
                    <span className="block text-xs text-slate-400 font-mono">{row.meter_reference}</span>
                  </td>

                  <td className="px-4 py-3 text-slate-800">
                    {row.tenant_name ?? <span className="text-slate-400">Vacant</span>}
                    {showRecorded && (
                      <span className="block text-xs text-emerald-600 mt-1">
                        {CHECK}{' '}
                        {cycleRead!.consumption != null
                          ? `${cycleRead!.consumption.toLocaleString('en-GB')} kWh this cycle`
                          : 'Opening reading'}
                        {' '}{DASH} read {fmtDate(cycleRead!.date)}
                      </span>
                    )}
                    {showRecorded && !cycleRead!.editable && (
                      <span className="block text-xs text-slate-400 mt-0.5">Invoiced {DASH} locked</span>
                    )}
                    {s.error && <span className="block text-xs text-red-600 mt-1">{s.error}</span>}
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {row.last_value != null ? (
                      <>
                        <span className="font-medium text-slate-700">{row.last_value.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                        <span className="block text-xs text-slate-400">{fmtDate(row.last_date)}</span>
                      </>
                    ) : (
                      <span className="text-xs text-amber-600">No reads yet</span>
                    )}
                  </td>

                  {showRecorded ? (
                    <>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">{fmtDate(cycleRead!.date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                        {cycleRead!.value.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-xs text-slate-400">
                        {cycleRead!.consumption != null ? `${cycleRead!.consumption.toLocaleString('en-GB')} kWh` : DASH}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 w-36">
                        <input type="date" value={s.date}
                          onChange={e => update(row.meter_id, { date: e.target.value })}
                          className={inputClass} />
                      </td>
                      <td className="px-4 py-3 w-36">
                        <input type="number" step="0.001" min="0" placeholder="0.000" value={s.reading}
                          onChange={e => update(row.meter_id, { reading: e.target.value })}
                          className={inputClass} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-xs text-slate-500">
                        {consumption != null && estNet != null && row.active ? (
                          <>
                            <span className="block">{consumption.toLocaleString('en-GB')} kWh</span>
                            <span className="font-semibold text-slate-700">{gbp(Math.round(estNet * 1.2 * 100) / 100)}</span>
                          </>
                        ) : consumption != null && !row.active ? (
                          <span className="block">{consumption.toLocaleString('en-GB')} kWh (not billed)</span>
                        ) : DASH}
                      </td>
                    </>
                  )}

                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(row)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        row.active
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                      }`}
                    >
                      {row.active ? 'On' : 'Off'}
                    </button>
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {showRecorded ? (
                      cycleRead!.editable && isLatestRead ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => startEdit(row, cycleRead!)}
                            className="px-3 py-1.5 border border-slate-300 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors">
                            Edit
                          </button>
                          <button onClick={() => handleClear(row, cycleRead!.read_id)}
                            className="px-2.5 py-1.5 text-red-500 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors">
                            Clear
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">{CHECK} Recorded</span>
                      )
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        {editing && (
                          <button onClick={() => cancelEdit(row)}
                            className="px-2.5 py-1.5 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleSave(row)}
                          disabled={s.saving || !s.reading || (!editing && row.last_value == null)}
                          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors"
                        >
                          {s.saving ? 'Saving...' : editing ? 'Save fix' : 'Record'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm">
            No meters registered for this asset yet.
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-2">
        One reading per meter per cycle. Once recorded a meter greys out with its usage shown; use
        {' '}<span className="font-medium">Edit</span> to fix a mistake or <span className="font-medium">Clear</span> to
        re-enter, available while the electric charge is still a draft. The {ARROW} estimate includes VAT.
      </p>
    </div>
  )
}

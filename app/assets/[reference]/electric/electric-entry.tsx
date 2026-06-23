'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)

export interface MeterRow {
  meter_id: string
  meter_reference: string
  unit_label: string
  tenant_name: string | null
  last_date: string | null
  last_value: number | null
  rate: number | null
  active: boolean
}

interface Props {
  rows: MeterRow[]
}

interface RowState {
  date: string
  reading: string
  saving: boolean
  error: string | null
  result: { billed: boolean; consumption: number; net?: number; vat?: number; gross?: number } | null
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function blank(): RowState {
  return { date: todayISO(), reading: '', saving: false, error: null, result: null }
}

function gbp(n: number): string {
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(s: string | null): string {
  if (!s) return DASH
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function ElectricEntry({ rows }: Props) {
  const router = useRouter()
  const [states, setStates] = useState<Record<string, RowState>>(
    () => Object.fromEntries(rows.map(r => [r.meter_id, blank()]))
  )

  function update(id: string, patch: Partial<RowState>) {
    setStates(prev => ({ ...prev, [id]: { ...(prev[id] ?? blank()), ...patch } }))
  }

  async function handleRecord(row: MeterRow) {
    const s = states[row.meter_id] ?? blank()
    const reading = parseFloat(s.reading)
    if (isNaN(reading)) {
      update(row.meter_id, { error: 'Enter a reading' })
      return
    }
    update(row.meter_id, { saving: true, error: null, result: null })
    const { data, error } = await supabase.rpc('fn_record_meter_reading', {
      p_meter_id:  row.meter_id,
      p_read_date: s.date,
      p_reading:   reading,
    })
    if (error) {
      update(row.meter_id, { saving: false, error: error.message })
    } else {
      update(row.meter_id, { saving: false, reading: '', result: data })
      router.refresh()
    }
  }

  async function handleToggle(row: MeterRow) {
    const { error } = await supabase.rpc('fn_set_meter_active', {
      p_meter_id: row.meter_id,
      p_active: !row.active,
    })
    if (error) {
      update(row.meter_id, { error: error.message })
    } else {
      router.refresh()
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 mb-6">
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
            const s = states[row.meter_id] ?? blank()
            const reading = parseFloat(s.reading)
            const consumption = !isNaN(reading) && row.last_value != null && reading >= row.last_value
              ? reading - row.last_value
              : null
            const estNet = consumption != null && row.rate != null
              ? Math.round(consumption * row.rate * 100) / 100
              : null
            return (
              <tr key={row.meter_id} className={`transition-colors align-top hover:bg-slate-50 ${row.active ? '' : 'bg-slate-50'}`}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-medium text-slate-900">{row.unit_label}</span>
                  <span className="block text-xs text-slate-400 font-mono">{row.meter_reference}</span>
                </td>
                <td className="px-4 py-3 text-slate-800">
                  {row.tenant_name ?? <span className="text-slate-400">Vacant</span>}
                  {s.result && s.result.billed && (
                    <span className="block text-xs text-emerald-600 mt-1">
                      {s.result.consumption.toLocaleString('en-GB')} kWh {String.fromCharCode(0x2192)} {gbp(s.result.gross ?? 0)} (incl. VAT) charged
                    </span>
                  )}
                  {s.result && !s.result.billed && (
                    <span className="block text-xs text-slate-500 mt-1">
                      {s.result.consumption.toLocaleString('en-GB')} kWh recorded {DASH} billing off, no invoice raised
                    </span>
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
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRecord(row)}
                    disabled={s.saving || !s.reading || row.last_value == null}
                    className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {s.saving ? 'Saving...' : 'Record'}
                  </button>
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
  )
}

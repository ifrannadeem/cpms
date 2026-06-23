'use client'

import { useState } from 'react'
import Link from 'next/link'

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)

export interface MatrixCell {
  kwh: number | null
  billed: number | null
  paid: number | null
  outstanding: number | null
}

export interface MatrixRow {
  unit_label: string
  unit_ref: string
  tenant_name: string | null
  billing_on: boolean
  cells: Record<string, MatrixCell>
}

export interface MatrixMonth {
  key: string
  label: string
}

interface Props {
  months: MatrixMonth[]
  rows: MatrixRow[]
  reference: string
}

type Metric = 'kwh' | 'billed' | 'paid' | 'outstanding'

const METRICS: { value: Metric; label: string }[] = [
  { value: 'kwh', label: 'Consumption (kWh)' },
  { value: 'billed', label: `Billed (${POUND})` },
  { value: 'paid', label: `Paid (${POUND})` },
  { value: 'outstanding', label: `Outstanding (${POUND})` },
]

function fmtVal(metric: Metric, v: number | null): string {
  if (v == null) return DASH
  if (metric === 'kwh') {
    return v.toLocaleString('en-GB', { maximumFractionDigits: 1 })
  }
  return POUND + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ElectricMatrix({ months, rows, reference }: Props) {
  const [metric, setMetric] = useState<Metric>('kwh')

  const colTotals: Record<string, number> = {}
  let grandTotal = 0
  for (const m of months) {
    let t = 0
    for (const r of rows) {
      const v = r.cells[m.key]?.[metric]
      if (v != null) t += v
    }
    colTotals[m.key] = t
    grandTotal += t
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {METRICS.map(m => (
          <button
            key={m.value}
            onClick={() => setMetric(m.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              metric === m.value
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50">Unit</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenant</th>
              {months.map(m => (
                <th key={m.key} className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                  {m.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wide">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => {
              let rowTotal = 0
              let hasAny = false
              for (const m of months) {
                const v = r.cells[m.key]?.[metric]
                if (v != null) { rowTotal += v; hasAny = true }
              }
              return (
                <tr key={r.unit_label} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap sticky left-0 bg-white">
                    <Link href={`/assets/${reference}/electric/unit/${encodeURIComponent(r.unit_ref)}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline">
                      {r.unit_label}
                    </Link>
                    {!r.billing_on && <span className="ml-1.5 text-xs text-slate-400">(off)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs max-w-44 truncate">{r.tenant_name ?? DASH}</td>
                  {months.map(m => {
                    const v = r.cells[m.key]?.[metric] ?? null
                    const isOut = metric === 'outstanding' && v != null && v > 0
                    return (
                      <td key={m.key} className={`px-3 py-2.5 text-right whitespace-nowrap text-xs ${isOut ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>
                        {fmtVal(metric, v)}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap text-xs">
                    {hasAny ? fmtVal(metric, rowTotal) : DASH}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-300">
            <tr>
              <td className="px-4 py-3 font-bold text-slate-900 sticky left-0 bg-slate-50">TOTAL</td>
              <td className="px-4 py-3"></td>
              {months.map(m => (
                <td key={m.key} className="px-3 py-3 text-right font-bold text-slate-900 whitespace-nowrap text-xs">
                  {fmtVal(metric, colTotals[m.key])}
                </td>
              ))}
              <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap text-xs">
                {fmtVal(metric, grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

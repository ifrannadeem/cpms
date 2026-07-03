'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)

export interface GridRow {
  lease_id: string
  tenant_id: string
  tenant_name: string
  unit_references: string
  outstanding: number
}

interface Props {
  assetId: string
  rows: GridRow[]
  chargeType: 'RENT' | 'ELECTRIC'
}

interface AllocationDetail {
  charge_id: string
  charge_label: string
  allocated: number
  fully_paid: boolean
}

interface AllocationResult {
  payment_id: string
  amount: number
  allocated: number
  unallocated: number
  allocations: AllocationDetail[]
}

interface RowState {
  date: string
  amount: string
  method: string
  notes: string
  saving: boolean
  error: string | null
  result: AllocationResult | null
}

const METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'STANDING_ORDER', label: 'Standing Order' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
]

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function blankRow(): RowState {
  return { date: todayISO(), amount: '', method: 'BANK_TRANSFER', notes: '', saving: false, error: null, result: null }
}

function fmt(v: number): string {
  return POUND + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatUnit(ref: string): string {
  // "RBC-001-010, RBC-001-011" -> "Unit 010, 011"
  const parts = ref.split(',').map(s => {
    const bits = s.trim().split('-')
    return bits[bits.length - 1]
  })
  return 'Unit ' + parts.join(', ')
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function PaymentGrid({ assetId, rows, chargeType }: Props) {
  const router = useRouter()
  const [states, setStates] = useState<Record<string, RowState>>(
    () => Object.fromEntries(rows.map(r => [r.lease_id, blankRow()]))
  )

  function update(leaseId: string, patch: Partial<RowState>) {
    setStates(prev => ({ ...prev, [leaseId]: { ...(prev[leaseId] ?? blankRow()), ...patch } }))
  }

  async function handleRecord(row: GridRow) {
    const s = states[row.lease_id] ?? blankRow()
    const amount = parseFloat(s.amount)
    if (isNaN(amount) || amount <= 0) {
      update(row.lease_id, { error: 'Enter an amount' })
      return
    }
    update(row.lease_id, { saving: true, error: null, result: null })
    // Scope the payment to THIS lease so a tenant's independent units stay separate.
    const { data, error } = await supabase.rpc('fn_record_lease_payment', {
      p_lease_id:     row.lease_id,
      p_amount:       amount,
      p_payment_date: s.date,
      p_method:       s.method,
      p_notes:        s.notes.trim() || null,
      p_charge_type:  chargeType,
    })
    if (error) {
      update(row.lease_id, { saving: false, error: error.message })
    } else {
      update(row.lease_id, {
        saving: false,
        amount: '',
        notes: '',
        result: data as AllocationResult,
      })
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
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Date</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount ({POUND})</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Method</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(row => {
            const s = states[row.lease_id] ?? blankRow()
            return (
              <tr key={row.lease_id} className="hover:bg-slate-50 transition-colors align-top">
                <td className="px-4 py-3 max-w-44">
                  <span className="font-medium text-slate-900">{formatUnit(row.unit_references)}</span>
                  <span className="block text-xs text-slate-400 font-mono break-words">{row.unit_references}</span>
                </td>
                <td className="px-4 py-3 text-slate-800 font-medium">
                  {row.tenant_name}
                  {s.result && (
                    <span className="block text-xs text-emerald-600 font-normal mt-1">
                      {fmt(s.result.amount)} recorded{' '}
                      {s.result.allocations.length > 0 &&
                        `${String.fromCharCode(0x2192)} ${s.result.allocations
                          .map(a => `${a.charge_label}${a.fully_paid ? '' : ' (part)'}`)
                          .join(', ')}`}
                      {s.result.unallocated > 0 && (
                        <span className="text-amber-600"> ({fmt(s.result.unallocated)} unallocated)</span>
                      )}
                    </span>
                  )}
                  {s.error && (
                    <span className="block text-xs text-red-600 font-normal mt-1">{s.error}</span>
                  )}
                </td>
                <td className={`px-4 py-3 text-right whitespace-nowrap font-semibold ${row.outstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {row.outstanding > 0 ? fmt(row.outstanding) : DASH}
                </td>
                <td className="px-4 py-3 w-36">
                  <input
                    type="date"
                    value={s.date}
                    onChange={e => update(row.lease_id, { date: e.target.value })}
                    className={inputClass}
                  />
                </td>
                <td className="px-4 py-3 w-40">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    style={{ minWidth: '8rem' }}
                    value={s.amount}
                    onChange={e => update(row.lease_id, { amount: e.target.value })}
                    className={inputClass}
                  />
                </td>
                <td className="px-4 py-3 w-40">
                  <select
                    value={s.method}
                    onChange={e => update(row.lease_id, { method: e.target.value })}
                    className={`${inputClass} bg-white`}
                  >
                    {METHODS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 min-w-44">
                  <input
                    type="text"
                    placeholder="Optional"
                    value={s.notes}
                    onChange={e => update(row.lease_id, { notes: e.target.value })}
                    className={inputClass}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRecord(row)}
                    disabled={s.saving || !s.amount}
                    className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-40 transition-colors whitespace-nowrap"
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
          No billable tenancies found for this asset.
        </div>
      )}
    </div>
  )
}

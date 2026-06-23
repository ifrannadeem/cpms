'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'

interface Lease {
  lease_id: string
  lease_reference: string
  tenant_name: string
  unit_references: string | null
  unit_types: string | null
  lease_state: string
  annual_rent: number
  commencement_date: string | null
  expiry_date: string | null
  next_rent_review_date: string | null
  active_alert_types: string | null
}

interface Props {
  leases: Lease[]
  assetReference: string
}

type SortKey = 'unit' | 'type' | 'state' | 'rent' | 'expiry'
type SortDir = 'asc' | 'desc'

const UNIT_TYPE_LABEL: Record<string, string> = {
  OFFICE: 'Office',
  RETAIL: 'Retail',
  WORKSHOP: 'Workshop',
}

const STATE_BADGE: Record<string, string> = {
  ACTIVE:   'bg-emerald-100 text-emerald-700',
  PERIODIC: 'bg-amber-100 text-amber-700',
  EXPIRED:  'bg-red-100 text-red-700',
  PENDING:  'bg-blue-100 text-blue-700',
}

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)

function fmt(v: number | null | undefined): string {
  if (v == null) return DASH
  return POUND + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return DASH
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatUnit(ref: string | null | undefined): string {
  if (!ref) return DASH
  return ref.split(', ').map(r => {
    const parts = r.trim().split('-')
    return 'Unit ' + parts[parts.length - 1]
  }).join(', ')
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-slate-300 ml-1">{String.fromCharCode(0x2195)}</span>
  return <span className="text-slate-700 ml-1">{dir === 'asc' ? String.fromCharCode(0x2191) : String.fromCharCode(0x2193)}</span>
}

export default function LeaseTable({ leases, assetReference }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('unit')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterType, setFilterType] = useState<string>('ALL')

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const unitTypes = useMemo(() => {
    const types = new Set<string>()
    leases.forEach(l => {
      const t = l.unit_types?.split(', ')[0]
      if (t) types.add(t)
    })
    return Array.from(types).sort()
  }, [leases])

  const filtered = useMemo(() => {
    return leases.filter(l => {
      if (filterType === 'ALL') return true
      const t = l.unit_types?.split(', ')[0]
      return t === filterType
    })
  }, [leases, filterType])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (sortKey === 'unit')   { av = a.unit_references ?? ''; bv = b.unit_references ?? '' }
      if (sortKey === 'type')   { av = a.unit_types?.split(', ')[0] ?? ''; bv = b.unit_types?.split(', ')[0] ?? '' }
      if (sortKey === 'state')  { av = a.lease_state ?? ''; bv = b.lease_state ?? '' }
      if (sortKey === 'rent')   { av = a.annual_rent ?? 0; bv = b.annual_rent ?? 0 }
      if (sortKey === 'expiry') { av = a.expiry_date ?? '9999'; bv = b.expiry_date ?? '9999' }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-800 whitespace-nowrap"

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-slate-500">Filter by type:</span>
        {['ALL', ...unitTypes].map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterType === t
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {t === 'ALL' ? 'All' : UNIT_TYPE_LABEL[t] ?? t}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">{sorted.length} lease{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className={thClass} onClick={() => toggleSort('unit')}>Unit <SortIcon active={sortKey==='unit'} dir={sortDir} /></th>
              <th className={thClass} onClick={() => toggleSort('type')}>Type <SortIcon active={sortKey==='type'} dir={sortDir} /></th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tenant</th>
              <th className={thClass} onClick={() => toggleSort('state')}>State <SortIcon active={sortKey==='state'} dir={sortDir} /></th>
              <th className={thClass} onClick={() => toggleSort('rent')}>Monthly <SortIcon active={sortKey==='rent'} dir={sortDir} /></th>
              <th className={thClass} onClick={() => toggleSort('rent')}>Annual <SortIcon active={sortKey==='rent'} dir={sortDir} /></th>
              <th className={thClass} onClick={() => toggleSort('expiry')}>Expiry <SortIcon active={sortKey==='expiry'} dir={sortDir} /></th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map(l => {
              const unitType = l.unit_types?.split(', ')[0] ?? ''
              const hasAlert = !!l.active_alert_types
              const unitDisplay = formatUnit(l.unit_references)
              return (
                <tr key={l.lease_id} className={`hover:bg-slate-50 transition-colors ${hasAlert ? 'border-l-2 border-l-amber-400' : ''}`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-slate-900 font-medium text-sm">{unitDisplay}</span>
                    <span className="block text-xs text-slate-400 font-mono">{l.unit_references ?? ''}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{UNIT_TYPE_LABEL[unitType] ?? unitType ?? DASH}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium">{l.tenant_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATE_BADGE[l.lease_state] ?? 'bg-gray-100 text-gray-700'}`}>
                      {l.lease_state.charAt(0) + l.lease_state.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">{fmt(l.annual_rent ? l.annual_rent / 12 : null)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmt(l.annual_rent)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(l.expiry_date)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/assets/${assetReference}/leases/${l.lease_id}`}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline whitespace-nowrap"
                    >
                      View {String.fromCharCode(0x2192)}
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

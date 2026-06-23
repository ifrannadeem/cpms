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
  asset_name: string | null
  asset_reference: string | null
}

interface AssetMeta {
  ref: string
  name: string
  income_owned: boolean
}

interface Props {
  leases: Lease[]
  assets: AssetMeta[]
}

type SortKey = 'unit' | 'tenant' | 'asset' | 'state' | 'rent' | 'expiry'
type SortDir = 'asc' | 'desc'

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

export default function LeaseRegisterClient({ leases, assets }: Props) {
  // Default: income_owned assets only (excludes Southgate which is managed, not owned)
  const defaultSelected = assets.filter(a => a.income_owned).map(a => a.ref)
  const [selectedAssets, setSelectedAssets] = useState<string[]>(defaultSelected)
  const [sortKey, setSortKey] = useState<SortKey>('asset')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleAsset(ref: string) {
    setSelectedAssets(prev =>
      prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]
    )
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() =>
    leases.filter(l => selectedAssets.includes(l.asset_reference ?? ''))
  , [leases, selectedAssets])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (sortKey === 'unit')   { av = a.unit_references ?? ''; bv = b.unit_references ?? '' }
      if (sortKey === 'tenant') { av = a.tenant_name ?? ''; bv = b.tenant_name ?? '' }
      if (sortKey === 'asset')  { av = a.asset_name ?? ''; bv = b.asset_name ?? '' }
      if (sortKey === 'state')  { av = a.lease_state ?? ''; bv = b.lease_state ?? '' }
      if (sortKey === 'rent')   { av = a.annual_rent ?? 0; bv = b.annual_rent ?? 0 }
      if (sortKey === 'expiry') { av = a.expiry_date ?? '9999'; bv = b.expiry_date ?? '9999' }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  const totalRent = filtered.reduce((s, l) => s + Number(l.annual_rent ?? 0), 0)

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-800 whitespace-nowrap"

  return (
    <div>
      {/* Asset filter chips */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-slate-500 font-medium mr-1">Show:</span>
        {assets.map(a => (
          <button
            key={a.ref}
            onClick={() => toggleAsset(a.ref)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selectedAssets.includes(a.ref)
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}
          >
            {a.name}
            {!a.income_owned && (
              <span className="ml-1 opacity-60 text-[10px]">(managed)</span>
            )}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">
          {sorted.length} lease{sorted.length !== 1 ? 's' : ''}
          {' '}{DASH}{' '}
          {POUND}{totalRent.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} p.a.
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className={thClass} onClick={() => toggleSort('asset')}>
                Asset <SortIcon active={sortKey === 'asset'} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => toggleSort('unit')}>
                Unit <SortIcon active={sortKey === 'unit'} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => toggleSort('tenant')}>
                Tenant <SortIcon active={sortKey === 'tenant'} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => toggleSort('state')}>
                Status <SortIcon active={sortKey === 'state'} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => toggleSort('rent')}>
                Annual Rent <SortIcon active={sortKey === 'rent'} dir={sortDir} />
              </th>
              <th className={thClass} onClick={() => toggleSort('expiry')}>
                Expiry <SortIcon active={sortKey === 'expiry'} dir={sortDir} />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                Next Review
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map(l => {
              const hasAlert = !!l.active_alert_types
              const unitDisplay = formatUnit(l.unit_references)
              return (
                <tr
                  key={l.lease_id}
                  className={`hover:bg-slate-50 transition-colors ${hasAlert ? 'border-l-2 border-l-amber-400' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-slate-500">{l.asset_name}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-medium text-slate-900">{unitDisplay}</span>
                    <span className="block text-xs text-slate-400 font-mono">{l.unit_references}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{l.tenant_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATE_BADGE[l.lease_state] ?? 'bg-gray-100 text-gray-700'}`}>
                      {l.lease_state.charAt(0) + l.lease_state.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{fmt(l.annual_rent)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(l.expiry_date)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(l.next_rent_review_date)}</td>
                  <td className="px-4 py-3 text-right">
                    {l.asset_reference && (
                      <Link
                        href={`/assets/${l.asset_reference}/leases/${l.lease_id}`}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline whitespace-nowrap"
                      >
                        View {String.fromCharCode(0x2192)}
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="p-10 text-center text-slate-400 text-sm">
            No leases match the selected assets.
          </div>
        )}
      </div>
    </div>
  )
}

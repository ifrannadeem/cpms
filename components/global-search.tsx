'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase-browser'
import { unitLabels } from '@/lib/format'

interface Hit {
  lease_id: string
  tenant_name: string
  trading_name: string | null
  unit_references: string | null
  asset_reference: string
  asset_name: string
  lease_state: string
}

/**
 * Portfolio-wide tenant / unit search (council review 5.2): type a tenant or unit,
 * jump straight to the tenancy without knowing which asset it belongs to.
 */
export function GlobalSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // PostgREST or() syntax uses , ( ) as structure; strip them plus % from input
    const term = q.trim().replace(/[,()%]/g, '')
    if (term.length < 2) {
      setHits([])
      setOpen(false)
      return
    }
    const t = setTimeout(async () => {
      setBusy(true)
      const pat = `%${term}%`
      // v_lease_history so ended tenancies are findable too (marked "ended")
      const { data, error } = await supabase
        .from('v_lease_history')
        .select('lease_id, tenant_name, trading_name, unit_references, asset_reference, asset_name, lease_state')
        .or(`tenant_name.ilike.${pat},trading_name.ilike.${pat},unit_references.ilike.${pat}`)
        .order('lease_state', { ascending: true })
        .limit(8)
      setBusy(false)
      if (!error) {
        setHits((data as Hit[]) ?? [])
        setOpen(true)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  function go(hit: Hit) {
    setQ('')
    setHits([])
    setOpen(false)
    router.push(`/assets/${hit.asset_reference}/leases/${hit.lease_id}`)
  }

  return (
    <div ref={boxRef} className="relative px-3 pt-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          placeholder="Tenant or unit…"
          className="w-full bg-slate-800 border border-slate-700 rounded-md pl-8 pr-2 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      {open && (
        <div className="absolute left-3 right-3 z-50 mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-xl overflow-hidden">
          {hits.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">{busy ? 'Searching…' : 'No matches'}</p>
          ) : (
            hits.map(h => (
              <button
                key={h.lease_id}
                onClick={() => go(h)}
                className="w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors"
              >
                <span className="block text-xs font-medium text-slate-100 truncate">
                  {h.trading_name ?? h.tenant_name}
                  {h.lease_state === 'TERMINATED' && (
                    <span className="ml-1.5 text-[10px] font-normal text-amber-400">(ended)</span>
                  )}
                </span>
                <span className="block text-[11px] text-slate-400 truncate">
                  {unitLabels(h.unit_references)} · {h.asset_name}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

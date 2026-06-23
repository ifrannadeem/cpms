import Link from "next/link"
import type { PortfolioHealth } from "@/lib/types"

function OccupancyBar({ occupied, total }: { occupied: number; total: number }) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0
  const colour = pct === 100 ? "bg-emerald-500" : pct >= 80 ? "bg-blue-500" : "bg-amber-500"
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
        <span>{occupied} of {total} units occupied</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function PortfolioTiles({ data }: { data: PortfolioHealth[] }) {
  if (!data.length) return null
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {data.map((a) => (
        <Link
          key={a.asset_id}
          href={`/assets/${a.asset_reference}`}
          className="block bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 hover:border-blue-300 hover:shadow-md transition-all group"
        >
          <div>
            <p className="text-xs font-mono text-slate-400">{a.asset_reference}</p>
            <h3 className="font-semibold text-slate-900 text-base leading-tight group-hover:text-blue-600 transition-colors">
              {a.asset_name}
            </h3>
          </div>

          <OccupancyBar occupied={a.occupied_units} total={a.total_units} />

          <div className="grid grid-cols-2 gap-3 text-sm pt-1">
            <div>
              <p className="text-xs text-slate-400">Monthly Rent</p>
              <p className="font-semibold text-slate-900">{fmt(a.total_annual_rent / 12)}</p>
              <p className="text-xs text-slate-400">{fmt(a.total_annual_rent)} p.a.</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Leases</p>
              <p className="font-semibold text-slate-900">{a.active_leases} active</p>
              {a.vacant_units > 0 && (
                <p className="text-xs text-slate-400">{a.vacant_units} vacant</p>
              )}
            </div>
          </div>

          {a.periodic_leases > 0 && (
            <p className="text-xs text-slate-400">{a.periodic_leases} periodic tenancies</p>
          )}

          <p className="text-xs text-blue-500 group-hover:text-blue-600 font-medium">
            Open asset →
          </p>
        </Link>
      ))}
    </div>
  )
}

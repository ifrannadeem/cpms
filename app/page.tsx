import { supabase } from "@/lib/supabase"
import { PortfolioTiles } from "@/components/dashboard/portfolio-tiles"
import { AlertsPanel } from "@/components/dashboard/alerts-panel"
import type { PortfolioHealth, LeaseAlert } from "@/lib/types"

// Always render live: this page drives chasing/payment decisions, and ISR meant
// figures could lag mutations by up to 5 minutes (router.refresh() does not bust ISR).
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [
    { data: portfolioHealth },
    { data: expiryAlerts },
    { data: reviewAlerts },
    { data: assetFlags },
    { data: outstandingCharges },
    { data: arrears },
  ] =
    await Promise.all([
      supabase.from("v_portfolio_health").select("*"),
      // Lease expiry within 6 months — needs active re-letting or renewal decision
      supabase
        .from("v_lease_alerts")
        .select("*")
        .eq("alert_type", "LEASE_EXPIRY")
        .lte("days_until", 180)
        .order("days_until", { ascending: true }),
      // Rent reviews and break clauses within 90 days
      supabase
        .from("v_lease_alerts")
        .select("*")
        .in("alert_type", ["RENT_REVIEW", "BREAK_CLAUSE"])
        .lte("days_until", 90)
        .order("days_until", { ascending: true }),
      supabase.from("assets").select("asset_id, asset_reference, income_owned"),
      supabase
        .from("v_charge_ledger")
        .select("asset_id, charge_type, outstanding_amount, status")
        .in("status", ["ISSUED", "OVERDUE", "PART_PAID"]),
      supabase.from("v_arrears_summary").select("tenant_id, asset_id, total_outstanding"),
    ])

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

  const assets = portfolioHealth as PortfolioHealth[] ?? []
  const expiry = expiryAlerts as LeaseAlert[] ?? []
  const reviews = reviewAlerts as LeaseAlert[] ?? []
  const allActions = [...expiry, ...reviews]

  // Financial summary — owned assets only (Southgate is managed, income not 2i's)
  const ownedAssetIds = new Set(
    (assetFlags ?? []).filter(a => a.income_owned !== false).map(a => a.asset_id)
  )
  const ownedRentRoll = assets
    .filter(a => ownedAssetIds.has(a.asset_id))
    .reduce((s, a) => s + (a.total_annual_rent ?? 0), 0)
  const ownedCharges = (outstandingCharges ?? []).filter(c => ownedAssetIds.has(c.asset_id))
  const rentOutstanding = ownedCharges
    .filter(c => c.charge_type === "RENT")
    .reduce((s, c) => s + parseFloat(c.outstanding_amount ?? "0"), 0)
  const electricOutstanding = ownedCharges
    .filter(c => c.charge_type === "ELECTRIC")
    .reduce((s, c) => s + parseFloat(c.outstanding_amount ?? "0"), 0)
  const arrearsTenants = (arrears ?? []).filter(a => ownedAssetIds.has(a.asset_id)).length

  const gbp = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n)

  return (
    <div className="p-8 max-w-screen-xl space-y-7">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Portfolio Overview</h1>
        <p className="text-sm text-slate-400 mt-0.5">{today}</p>
      </div>

      {allActions.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
          <span>&#9889;</span>
          <span>
            {expiry.length > 0 && `${expiry.length} lease${expiry.length !== 1 ? "s" : ""} expiring within 6 months`}
            {expiry.length > 0 && reviews.length > 0 && " · "}
            {reviews.length > 0 && `${reviews.length} rent review${reviews.length !== 1 ? "s" : ""} / break clause${reviews.length !== 1 ? "s" : ""} due within 90 days`}
          </span>
        </div>
      )}

      {/* Financial summary — owned portfolio */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Rent Roll (Owned)</p>
          <p className="text-2xl font-bold text-slate-900">{gbp(ownedRentRoll)}</p>
          <p className="text-xs text-slate-400 mt-1">{gbp(ownedRentRoll / 12)} / month {String.fromCharCode(0x00B7)} contracted</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Rent Outstanding</p>
          <p className={`text-2xl font-bold ${rentOutstanding > 0 ? "text-red-600" : "text-slate-400"}`}>
            {gbp(rentOutstanding)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Owned assets only</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Electric Outstanding</p>
          <p className={`text-2xl font-bold ${electricOutstanding > 0 ? "text-red-600" : "text-slate-400"}`}>
            {gbp(electricOutstanding)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Owned assets only</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Tenants in Arrears</p>
          <p className={`text-2xl font-bold ${arrearsTenants > 0 ? "text-amber-600" : "text-slate-400"}`}>
            {arrearsTenants}
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
          Assets &#8212; click to open
        </h2>
        <PortfolioTiles data={assets} />
      </div>

      {expiry.length > 0 && (
        <AlertsPanel title="Leases Expiring Within 6 Months" alerts={expiry} variant="critical" />
      )}
      {reviews.length > 0 && (
        <AlertsPanel title="Rent Reviews & Break Clauses — Next 90 Days" alerts={reviews} variant="review" />
      )}
    </div>
  )
}

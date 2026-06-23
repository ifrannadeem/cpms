import type { LeaseAlert, AlertType } from "@/lib/types"

const TYPE_LABEL: Record<AlertType, string> = {
  LEASE_EXPIRY:      "Lease Expiry",
  RENT_REVIEW:       "Rent Review",
  BREAK_CLAUSE:      "Break Clause",
  PERIODIC_TENANCY:  "Periodic",
  RENT_FREE_EXPIRY:  "Rent Free Ends",
  INCENTIVE_EXPIRY:  "Discount Ends",
}

const TYPE_COLOUR: Record<AlertType, string> = {
  LEASE_EXPIRY:      "bg-red-100 text-red-700",
  RENT_REVIEW:       "bg-blue-100 text-blue-700",
  BREAK_CLAUSE:      "bg-purple-100 text-purple-700",
  PERIODIC_TENANCY:  "bg-slate-100 text-slate-600",
  RENT_FREE_EXPIRY:  "bg-emerald-100 text-emerald-700",
  INCENTIVE_EXPIRY:  "bg-amber-100 text-amber-700",
}

interface Props { title: string; alerts: LeaseAlert[]; variant: "critical" | "review" }

export function AlertsPanel({ title, alerts, variant }: Props) {
  if (!alerts.length) return null
  const headerBg = variant === "critical" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
  const headerText = variant === "critical" ? "text-red-800" : "text-amber-800"

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`px-5 py-3 border-b ${headerBg}`}>
        <h2 className={`font-semibold text-sm ${headerText}`}>
          {title} <span className="font-normal opacity-70">({alerts.length})</span>
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="text-left px-5 py-2 font-medium">Type</th>
              <th className="text-left px-4 py-2 font-medium">Lease</th>
              <th className="text-left px-4 py-2 font-medium">Tenant</th>
              <th className="text-left px-4 py-2 font-medium">Asset</th>
              <th className="text-left px-4 py-2 font-medium">Date</th>
              <th className="text-left px-4 py-2 font-medium">Days</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-5 py-2.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOUR[a.alert_type]}`}>
                    {TYPE_LABEL[a.alert_type]}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{a.lease_reference}</td>
                <td className="px-4 py-2.5 text-slate-700">{a.tenant_name}</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{a.asset_name}</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">
                  {a.event_date ? new Date(a.event_date).toLocaleDateString("en-GB") : "—"}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {a.days_until === null ? (
                    <span className="text-slate-400">—</span>
                  ) : a.days_until <= 30 ? (
                    <span className="text-red-600 font-semibold">{a.days_until}d</span>
                  ) : a.days_until <= 60 ? (
                    <span className="text-amber-600 font-medium">{a.days_until}d</span>
                  ) : (
                    <span className="text-slate-500">{a.days_until}d</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

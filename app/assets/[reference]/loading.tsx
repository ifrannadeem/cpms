// Route-level loading skeleton: server components render on demand, so heavier
// pages briefly showed a blank main area during navigation (council review 5.4).
export default function Loading() {
  return (
    <div className="p-8 max-w-screen-xl space-y-6 animate-pulse">
      <div className="h-7 w-64 bg-slate-200 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl p-5">
            <div className="h-3 w-20 bg-slate-100 rounded mb-3" />
            <div className="h-6 w-28 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
      <div className="h-80 bg-white border border-slate-200 rounded-xl" />
    </div>
  )
}

import Link from 'next/link'

type Group = 'rent' | 'electric' | undefined

const TABS: { key: string; label: string; path: string; group?: Group }[] = [
  { key: 'overview', label: 'Overview', path: '' },
  { key: 'leases', label: 'Leases', path: '/leases' },
  { key: 'billing', label: 'Billing', path: '/billing' },
  { key: 'invoicing', label: 'Rent: Invoicing', path: '/invoicing', group: 'rent' },
  { key: 'payments', label: 'Rent: Payments', path: '/payments', group: 'rent' },
  { key: 'rent-collection', label: 'Rent: Collection', path: '/rent-collection', group: 'rent' },
  { key: 'electric', label: 'Meter Readings', path: '/electric', group: 'electric' },
  { key: 'invoicing-electric', label: 'Electric: Invoicing', path: '/invoicing-electric', group: 'electric' },
  { key: 'payments-electric', label: 'Electric: Payments', path: '/payments-electric', group: 'electric' },
  { key: 'electric-collection', label: 'Electric: Collection', path: '/electric-collection', group: 'electric' },
  { key: 'arrears', label: 'Arrears', path: '/arrears' },
  { key: 'dispatch', label: 'Email Invoices', path: '/dispatch' },
]

function tabClasses(group: Group, active: boolean): string {
  const base = 'px-4 py-2.5 text-sm rounded-t-lg transition-colors whitespace-nowrap '
  if (group === 'rent') {
    return base + (active
      ? 'bg-slate-200 text-slate-900 font-semibold border-b-2 border-slate-700 -mb-px'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
  }
  if (group === 'electric') {
    return base + (active
      ? 'bg-sky-100 text-sky-900 font-semibold border-b-2 border-sky-600 -mb-px'
      : 'bg-sky-50 text-sky-700 hover:bg-sky-100')
  }
  return base + (active
    ? 'text-slate-900 font-semibold border-b-2 border-slate-900 -mb-px'
    : 'text-slate-500 hover:text-slate-800')
}

export default function AssetTabs({ reference, active }: { reference: string; active: string }) {
  return (
    <div className="flex items-end gap-1 mb-8 border-b border-slate-200 overflow-x-auto">
      {TABS.map((t, i) => {
        const groupChanged = i > 0 && TABS[i - 1].group !== t.group
        const isActive = t.key === active
        const cls = tabClasses(t.group, isActive) + (groupChanged ? ' ml-3' : '')
        return isActive ? (
          <div key={t.key} className={cls}>{t.label}</div>
        ) : (
          <Link key={t.key} href={`/assets/${reference}${t.path}`} className={cls}>{t.label}</Link>
        )
      })}
    </div>
  )
}

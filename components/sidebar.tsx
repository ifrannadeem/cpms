'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, FileText, Building2, FileSpreadsheet, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase-browser'
import { GlobalSearch } from '@/components/global-search'

const navigation = [
  { name: 'Dashboard',      href: '/',         icon: LayoutDashboard },
  { name: 'Lease Register', href: '/leases',   icon: FileText },
  { name: 'Reports',        href: '/reports',  icon: FileSpreadsheet },
  { name: 'Settings',       href: '/settings', icon: Settings },
]

const assets = [
  { name: 'Rosehill Business Centre', ref: 'ASSET-001' },
  { name: 'Peartree Plaza',           ref: 'ASSET-002' },
  { name: 'Southgate Retail Park',    ref: 'ASSET-003' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  // The login screen renders full-screen without the app chrome.
  if (pathname === '/login') return null

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <aside className="w-60 bg-slate-900 flex flex-col shrink-0 h-screen overflow-y-auto">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700/60 shrink-0">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Opera%20Logo.png" alt="Opera" className="h-9 w-9 rounded-lg object-cover shrink-0" />
          <div>
            <div className="text-white font-semibold text-sm leading-tight">Opera</div>
            <div className="text-slate-400 text-[11px] leading-tight">Property Management</div>
          </div>
        </div>
      </div>

      <GlobalSearch />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Operations
        </p>
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.name}
            </Link>
          )
        })}

        {/* Assets section */}
        <div className="pt-4">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Assets
          </p>
          {assets.map((a) => {
            const href = `/assets/${a.ref}`
            const isActive = pathname.startsWith(href)
            const sections: { label: string; href: string; exact: boolean; group?: 'rent' | 'electric' }[] = [
              { label: 'Overview',            href: href,                          exact: true },
              { label: 'Leases',              href: `${href}/leases`,              exact: false },
              { label: 'Billing',             href: `${href}/billing`,             exact: false },
              { label: 'Rent: Invoicing',     href: `${href}/invoicing`,           exact: false, group: 'rent' },
              { label: 'Rent: Payments',      href: `${href}/payments`,            exact: false, group: 'rent' },
              { label: 'Rent: Collection',    href: `${href}/rent-collection`,     exact: false, group: 'rent' },
              { label: 'Meter Readings',      href: `${href}/electric`,            exact: false, group: 'electric' },
              { label: 'Electric: Invoicing', href: `${href}/invoicing-electric`,  exact: false, group: 'electric' },
              { label: 'Electric: Payments',  href: `${href}/payments-electric`,   exact: false, group: 'electric' },
              { label: 'Arrears',             href: `${href}/arrears`,             exact: false },
            ]
            return (
              <div key={a.ref}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  )}
                >
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="leading-tight truncate">{a.name}</span>
                </Link>
                {isActive && (
                  <div className="pl-8 space-y-0.5 pb-1">
                    {sections.map((s, i) => {
                      const onSection = s.exact
                        ? pathname === s.href
                        : pathname === s.href || pathname.startsWith(s.href + '/')
                      const groupChanged = i > 0 && sections[i - 1].group !== s.group
                      const accent = s.group === 'electric'
                        ? 'border-l-2 border-sky-500'
                        : s.group === 'rent'
                          ? 'border-l-2 border-slate-500'
                          : 'border-l-2 border-transparent'
                      return (
                        <Link
                          key={s.label}
                          href={s.href}
                          className={cn(
                            'block pl-3 pr-3 py-1.5 rounded-r-md text-xs font-medium transition-colors',
                            accent,
                            groupChanged ? 'mt-2' : '',
                            onSection
                              ? 'text-white bg-blue-600/30'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800'
                          )}
                        >
                          {s.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-slate-700/60 shrink-0">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
        <p className="text-slate-500 text-[11px] font-medium px-3 mt-2">2i Investments Limited</p>
      </div>
    </aside>
  )
}
import { BackupButton } from '@/components/settings/backup-button'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-3xl space-y-7">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Data backup</h2>
        <p className="text-sm text-slate-500 mb-4 max-w-xl">
          Downloads a ZIP containing every table (leases, tenants, charges, payments,
          meter readings…) as JSON, with a row-count manifest. Take one <span className="font-medium text-slate-700">weekly</span> and
          <span className="font-medium text-slate-700"> before every invoicing run</span>, and keep it off this device.
          The backup contains tenant personal data — store it as carefully as the ledger itself.
        </p>
        <BackupButton />
      </section>
    </div>
  )
}

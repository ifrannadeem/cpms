import { supabase } from '@/lib/supabase'
import LeaseRegisterClient from '@/components/leases/lease-register-client'

// Always render live (was ISR with a 5-minute lag; stale after edits).
export const dynamic = 'force-dynamic'

export default async function LeasesPage() {
  const [{ data: leases }, { data: assets }] = await Promise.all([
    supabase
      .from('v_lease_register')
      .select('lease_id, lease_reference, tenant_name, unit_references, unit_types, lease_state, annual_rent, commencement_date, expiry_date, next_rent_review_date, active_alert_types, asset_name, asset_reference')
      .order('asset_reference')
      .order('unit_references'),
    supabase
      .from('assets')
      .select('asset_id, asset_name, asset_reference, income_owned')
      .order('asset_name'),
  ])

  const rows = leases ?? []
  const assetMeta = (assets ?? []).map((a: {
    asset_id: string
    asset_name: string
    asset_reference: string
    income_owned: boolean
  }) => ({
    ref:          a.asset_reference,
    name:         a.asset_name,
    income_owned: a.income_owned ?? true,
  }))

  return (
    <div className="p-8 max-w-screen-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Lease Register</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Active leases across the portfolio. Southgate is a managed asset (2i acts as agent, not landlord) and is excluded by default.
        </p>
      </div>

      <LeaseRegisterClient leases={rows} assets={assetMeta} />
    </div>
  )
}

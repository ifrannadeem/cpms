import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import LeaseTable from '@/components/leases/lease-table'
import LetUnitForm, { type VacantUnit } from '@/components/leases/let-unit-form'
import AssetTabs from '@/components/asset-tabs'

interface Props {
  params: Promise<{ reference: string }>
}

export default async function AssetLeasesPage({ params }: Props) {
  const { reference } = await params

  const { data: asset } = await supabase
    .from('assets')
    .select('asset_id, asset_name, asset_reference')
    .eq('asset_reference', reference)
    .single()

  if (!asset) {
    return (
      <div className="p-8">
        <p className="text-red-500 mb-4">Asset not found: {reference}</p>
        <Link href="/" className="text-blue-600 hover:underline text-sm">
          {String.fromCharCode(0x2190)} Back to dashboard
        </Link>
      </div>
    )
  }

  const [{ data: leases }, { data: assetUnits }, { data: assetLeaseUnits }, { data: assetLeases }] = await Promise.all([
    supabase
      .from('v_lease_register')
      .select('lease_id, lease_reference, tenant_name, unit_references, unit_types, lease_state, annual_rent, commencement_date, expiry_date, next_rent_review_date, active_alert_types')
      .eq('asset_reference', reference)
      .order('lease_reference'),
    supabase
      .from('units')
      .select('unit_id, unit_reference, unit_type, active')
      .eq('asset_id', asset.asset_id),
    supabase.from('lease_units').select('unit_id, lease_id'),
    supabase
      .from('leases')
      .select('lease_id, lease_state')
      .eq('asset_id', asset.asset_id)
      .neq('lease_state', 'TERMINATED'),
  ])

  const safeLeases = leases ?? []

  const liveLeaseIds = new Set((assetLeases ?? []).map(l => l.lease_id))
  const occupiedUnitIds = new Set(
    (assetLeaseUnits ?? []).filter(lu => liveLeaseIds.has(lu.lease_id)).map(lu => lu.unit_id)
  )
  function vacantLabel(ref: string): string {
    if (ref.startsWith('SGP-I-')) return 'Suite ' + ref.replace('SGP-I-', '')
    const last = ref.split('-').pop() ?? ref
    const m = last.match(/^0*(\d.*)$/)
    return 'Unit ' + (m ? m[1] : last)
  }
  const vacantUnits: VacantUnit[] = (assetUnits ?? [])
    .filter(u => u.active !== false && !occupiedUnitIds.has(u.unit_id))
    .map(u => ({
      unit_id: u.unit_id,
      unit_reference: u.unit_reference,
      unit_label: vacantLabel(u.unit_reference),
      unit_type: u.unit_type,
    }))
    .sort((a, b) => a.unit_label.localeCompare(b.unit_label, undefined, { numeric: true }))

  const totalUnits = (assetUnits ?? []).filter(u => u.active !== false).length
  const periodicCount = safeLeases.filter(l => l.lease_state === 'PERIODIC').length

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset.asset_name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Leases</span>
      </nav>

      <AssetTabs reference={reference} active="leases" />

      <h1 className="text-2xl font-bold text-slate-900 mb-6">
        {asset.asset_name} {String.fromCharCode(0x2014)} Leases
      </h1>

      {/* Quick composition strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Units</p>
          <p className="text-xl font-bold text-slate-900">{totalUnits}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Leases</p>
          <p className="text-xl font-bold text-slate-900">{safeLeases.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Vacancies</p>
          <p className={`text-xl font-bold ${vacantUnits.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{vacantUnits.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Periodic</p>
          <p className="text-xl font-bold text-slate-900">{periodicCount}</p>
        </div>
      </div>

      {/* Vacant units / new lettings */}
      <LetUnitForm assetReference={reference} vacantUnits={vacantUnits} />

      {/* Lease table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Tenancies</h2>
        <LeaseTable leases={safeLeases} assetReference={reference} />
      </div>
    </div>
  )
}

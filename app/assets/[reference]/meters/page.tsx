import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AssetTabs from '@/components/asset-tabs'
import ManageMeters, { type MeterRow } from '@/components/meters/manage-meters'

interface Props {
  params: Promise<{ reference: string }>
}

const DASH = String.fromCharCode(0x2014)

function unitLabel(ref: string): string {
  if (ref.startsWith('SGP-I-')) return 'Suite ' + ref.replace('SGP-I-', '')
  const last = ref.split('-').pop() ?? ref
  const m = last.match(/^0*(\d.*)$/)
  return 'Unit ' + (m ? m[1] : last)
}

export default async function ManageMetersPage({ params }: Props) {
  const { reference } = await params

  const { data: asset } = await supabase
    .from('assets').select('asset_id, asset_name').eq('asset_reference', reference).single()

  if (!asset) {
    return (
      <div className="p-8">
        <p className="text-red-500 mb-4">Asset not found: {reference}</p>
        <Link href="/" className="text-blue-600 hover:underline text-sm">{String.fromCharCode(0x2190)} Back to dashboard</Link>
      </div>
    )
  }

  const [{ data: meters }, { data: units }] = await Promise.all([
    supabase.from('meters').select('meter_id, meter_reference, unit_id, active, dial_count').eq('asset_id', asset.asset_id),
    supabase.from('units').select('unit_id, unit_reference').eq('asset_id', asset.asset_id),
  ])

  const meterIds = (meters ?? []).map(m => m.meter_id)
  const { data: reads } = meterIds.length > 0
    ? await supabase.from('meter_reads').select('meter_id, read_date, reading_value').in('meter_id', meterIds).order('read_date', { ascending: false })
    : { data: [] }

  const unitById = new Map((units ?? []).map(u => [u.unit_id, u.unit_reference]))
  const lastRead = new Map<string, { read_date: string; reading_value: string }>()
  for (const r of reads ?? []) if (!lastRead.has(r.meter_id)) lastRead.set(r.meter_id, r)

  const rows: MeterRow[] = (meters ?? [])
    .map(m => {
      const ref = unitById.get(m.unit_id) ?? ''
      const last = lastRead.get(m.meter_id)
      return {
        meter_id: m.meter_id,
        meter_reference: m.meter_reference,
        unit_label: ref ? unitLabel(ref) : DASH,
        dial_count: m.dial_count ?? 6,
        active: m.active !== false,
        last_reading: last ? parseFloat(last.reading_value) : null,
        last_date: last?.read_date ?? null,
      }
    })
    .sort((a, b) => a.unit_label.localeCompare(b.unit_label, undefined, { numeric: true }))

  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset.asset_name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Manage Meters</span>
      </nav>

      <AssetTabs reference={reference} active="electric" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{asset.asset_name} {DASH} Manage Meters</h1>
        <p className="text-sm text-slate-500 mt-1">
          Set each meter{String.fromCharCode(0x2019)}s digit count so rollovers are handled automatically, and reset a
          meter when it is physically replaced or wound back.
        </p>
      </div>

      <ManageMeters rows={rows} />

      <div className="mt-6">
        <Link href={`/assets/${reference}/electric`} className="text-sm text-blue-600 hover:underline">
          {String.fromCharCode(0x2190)} Back to Meter Readings
        </Link>
      </div>
    </div>
  )
}

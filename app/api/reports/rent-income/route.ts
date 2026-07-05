import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSessionUser, unauthorised } from '@/lib/auth'
import { buildRentIncomeWorkbook, type RentRow } from '@/lib/reports'
import { unitLabel } from '@/lib/format'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OPEN = ['ISSUED', 'OVERDUE', 'PART_PAID']
const ISSUED_PLUS = ['ISSUED', 'OVERDUE', 'PART_PAID', 'PAID']

/** GET /api/reports/rent-income?assetId=...&month=YYYY-MM -> xlsx */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser())) return unauthorised()

  const { searchParams } = new URL(req.url)
  const assetId = searchParams.get('assetId')
  const month = searchParams.get('month')
  if (!assetId || !month) {
    return NextResponse.json({ error: 'Provide assetId and month (YYYY-MM)' }, { status: 400 })
  }

  const monthStart = `${month}-01`
  const d = new Date(monthStart)
  const monthEndExcl = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)
  const monthLabel = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const { data: asset } = await supabase
    .from('assets').select('asset_name').eq('asset_id', assetId).single()

  const [{ data: monthCharges }, { data: openCharges }, { data: monthPayments }, { data: units }, { data: tenants }, { data: leases }, { data: leaseUnits }] =
    await Promise.all([
      supabase.from('charge_records')
        .select('unit_id, tenant_id, gross_amount, period_start')
        .eq('asset_id', assetId).eq('charge_type', 'RENT')
        .in('status', ISSUED_PLUS)
        .gte('period_start', monthStart).lt('period_start', monthEndExcl),
      supabase.from('charge_records')
        .select('tenant_id, gross_amount, payment_amount')
        .eq('asset_id', assetId).eq('charge_type', 'RENT')
        .in('status', OPEN),
      supabase.from('payments')
        .select('tenant_id, amount')
        .eq('asset_id', assetId).eq('charge_type', 'RENT')
        .gte('payment_date', monthStart).lt('payment_date', monthEndExcl),
      supabase.from('units').select('unit_id, unit_reference').eq('asset_id', assetId),
      supabase.from('tenants').select('tenant_id, legal_name, trading_name'),
      supabase.from('leases').select('lease_id, tenant_id').eq('asset_id', assetId).neq('lease_state', 'TERMINATED'),
      supabase.from('lease_units').select('lease_id, unit_id'),
    ])

  const unitRefById = new Map((units ?? []).map(u => [u.unit_id, u.unit_reference]))
  const tenantName = (id: string) => {
    const t = (tenants ?? []).find(x => x.tenant_id === id)
    return t ? (t.trading_name ?? t.legal_name) : '—'
  }
  // tenant -> a representative unit_id (from lease_units), for payment-only rows
  const leaseUnitByLease = new Map<string, string>()
  for (const lu of leaseUnits ?? []) if (!leaseUnitByLease.has(lu.lease_id)) leaseUnitByLease.set(lu.lease_id, lu.unit_id)
  const tenantUnit = new Map<string, string>()
  for (const l of leases ?? []) {
    const u = leaseUnitByLease.get(l.lease_id)
    if (u && !tenantUnit.has(l.tenant_id)) tenantUnit.set(l.tenant_id, u)
  }

  const grossByTenant = new Map<string, number>()
  const unitByTenant = new Map<string, string>()
  for (const c of monthCharges ?? []) {
    grossByTenant.set(c.tenant_id, (grossByTenant.get(c.tenant_id) ?? 0) + parseFloat(c.gross_amount ?? '0'))
    if (c.unit_id) unitByTenant.set(c.tenant_id, c.unit_id)
  }
  const recvByTenant = new Map<string, number>()
  let totalReceivedAll = 0
  for (const p of monthPayments ?? []) {
    const amt = parseFloat(p.amount ?? '0')
    recvByTenant.set(p.tenant_id, (recvByTenant.get(p.tenant_id) ?? 0) + amt)
    totalReceivedAll += amt
  }
  const outByTenant = new Map<string, number>()
  for (const c of openCharges ?? []) {
    const bal = parseFloat(c.gross_amount ?? '0') - parseFloat(c.payment_amount ?? '0')
    outByTenant.set(c.tenant_id, (outByTenant.get(c.tenant_id) ?? 0) + (bal > 0 ? bal : 0))
  }

  const tenantIds = new Set<string>([...grossByTenant.keys(), ...recvByTenant.keys()])
  const rows: RentRow[] = Array.from(tenantIds).map(tid => {
    const unitId = unitByTenant.get(tid) ?? tenantUnit.get(tid)
    return {
      unit: unitLabel(unitId ? unitRefById.get(unitId) : null),
      tenant: tenantName(tid),
      grossBilled: grossByTenant.get(tid) ?? 0,
      received: recvByTenant.get(tid) ?? 0,
      outstanding: outByTenant.get(tid) ?? 0,
    }
  }).sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }))

  const buf = await buildRentIncomeWorkbook({
    assetName: asset?.asset_name ?? 'Asset',
    monthLabel,
    generatedAt: new Date().toLocaleString('en-GB'),
    rows,
    totalReceivedAll,
  })

  const yymm = month.slice(2, 4) + month.slice(5, 7)
  const filename = `${yymm} Rent Report - ${(asset?.asset_name ?? 'Asset').replace(/[\\/:*?"<>|]/g, '')} (${monthLabel}).xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

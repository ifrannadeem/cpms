import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { buildVatWorkbook, type VatRow } from '@/lib/reports'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ISSUED_PLUS = ['ISSUED', 'OVERDUE', 'PART_PAID', 'PAID']

function unitLabel(ref: string | null | undefined): string {
  if (!ref) return '—'
  if (ref.startsWith('SGP-I-')) return 'Suite ' + ref.replace('SGP-I-', '')
  const last = ref.split('-').pop() ?? ref
  const m = last.match(/^0*(\d.*)$/)
  return 'Unit ' + (m ? m[1] : last)
}

/** GET /api/reports/vat?periodId=...  (or assetId&start&end) -> xlsx */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const periodId = searchParams.get('periodId')
  let assetId = searchParams.get('assetId')
  let start = searchParams.get('start')
  let end = searchParams.get('end')
  let label = searchParams.get('label') ?? 'VAT period'

  if (periodId) {
    const { data: period } = await supabase
      .from('vat_periods').select('asset_id, label, period_start, period_end')
      .eq('period_id', periodId).single()
    if (!period) return NextResponse.json({ error: 'VAT period not found' }, { status: 404 })
    assetId = period.asset_id
    start = period.period_start
    end = period.period_end
    label = period.label
  }
  if (!assetId || !start || !end) {
    return NextResponse.json({ error: 'Provide periodId, or assetId, start and end' }, { status: 400 })
  }

  const { data: asset } = await supabase
    .from('assets').select('asset_name').eq('asset_id', assetId).single()

  const [{ data: charges }, { data: units }, { data: tenants }] = await Promise.all([
    supabase.from('charge_records')
      .select('charge_type, unit_id, tenant_id, issued_date, net_amount, vat_amount, gross_amount, payment_amount')
      .eq('asset_id', assetId)
      .in('status', ISSUED_PLUS)
      .gte('issued_date', start).lte('issued_date', end),
    supabase.from('units').select('unit_id, unit_reference').eq('asset_id', assetId),
    supabase.from('tenants').select('tenant_id, legal_name, trading_name'),
  ])

  const unitRefById = new Map((units ?? []).map(u => [u.unit_id, u.unit_reference]))
  const tenantName = (id: string) => {
    const t = (tenants ?? []).find(x => x.tenant_id === id)
    return t ? (t.trading_name ?? t.legal_name) : '—'
  }

  const rows: VatRow[] = (charges ?? []).map(c => {
    const gross = parseFloat(c.gross_amount ?? '0')
    const vat = parseFloat(c.vat_amount ?? '0')
    const paid = parseFloat(c.payment_amount ?? '0')
    const paidFrac = gross > 0 ? Math.min(paid / gross, 1) : 0
    return {
      issued: c.issued_date,
      unit: unitLabel(c.unit_id ? unitRefById.get(c.unit_id) : null),
      tenant: tenantName(c.tenant_id),
      type: c.charge_type === 'ELECTRIC' ? 'Electric' : 'Rent',
      net: parseFloat(c.net_amount ?? '0'),
      vat,
      gross,
      vatReceived: Math.round(vat * paidFrac * 100) / 100,
    }
  }).sort((a, b) =>
    (a.issued ?? '').localeCompare(b.issued ?? '') || a.type.localeCompare(b.type) || a.unit.localeCompare(b.unit, undefined, { numeric: true })
  )

  const buf = await buildVatWorkbook({
    assetName: asset?.asset_name ?? 'Asset',
    periodLabel: label,
    periodStart: new Date(start).toLocaleDateString('en-GB'),
    periodEnd: new Date(end).toLocaleDateString('en-GB'),
    generatedAt: new Date().toLocaleString('en-GB'),
    rows,
  })

  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '')
  const filename = `VAT Report - ${safe(asset?.asset_name ?? 'Asset')} - ${safe(label)}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

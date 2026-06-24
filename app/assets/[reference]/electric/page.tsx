import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import ElectricEntry, { type MeterRow, type CycleRead } from './electric-entry'
import ElectricMatrix, { type MatrixMonth, type MatrixRow, type MatrixCell } from './electric-matrix'
import SupplierBillEntry from './supplier-bill-entry'
import BulkReadingUpload from './bulk-reading-upload'
import AssetTabs from '@/components/asset-tabs'

interface Props {
  params: Promise<{ reference: string }>
}

const POUND = String.fromCharCode(0xA3)
const DASH  = String.fromCharCode(0x2014)

function unitLabel(ref: string): string {
  if (ref.startsWith('SGP-I-')) return 'Suite ' + ref.replace('SGP-I-', '')
  const last = ref.split('-').pop() ?? ref
  const m = last.match(/^0*(\d.*)$/)
  return 'Unit ' + (m ? m[1] : last)
}

function gbp(n: number): string {
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default async function AssetElectricPage({ params }: Props) {
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

  const [metersRes, { data: units }, { data: rates }, { data: usage }, { data: meterUsage }, { data: supplierBills }] =
    await Promise.all([
      supabase
        .from('meters')
        .select('meter_id, meter_reference, unit_id, active')
        .eq('asset_id', asset.asset_id),
      supabase
        .from('units')
        .select('unit_id, unit_reference, block_id')
        .eq('asset_id', asset.asset_id),
      supabase
        .from('utility_rates')
        .select('block_id, rate_per_kwh, effective_from, effective_to')
        .eq('asset_id', asset.asset_id)
        .eq('utility_type', 'ELECTRICITY'),
      supabase
        .from('v_electric_usage')
        .select('bill_month, bill_month_label, block_name, unit_reference, tenant_name, consumption_kwh, net_amount, vat_amount, gross_amount, payment_amount, outstanding')
        .eq('asset_id', asset.asset_id),
      supabase
        .from('v_meter_usage')
        .select('unit_reference, tenant_name, billing_on, read_month, read_date, consumption_kwh')
        .eq('asset_id', asset.asset_id)
        .not('consumption_kwh', 'is', null),
      supabase
        .from('supplier_bills')
        .select('block_name, bill_month, supplier_name, consumption_kwh, gross_amount')
        .eq('asset_id', asset.asset_id),
    ])

  // ---------- Meter reading entry rows ----------
  if (metersRes.error) console.error('meters query failed:', metersRes.error.message)
  const meterList = metersRes.data ?? []
  const unitById = new Map((units ?? []).map(u => [u.unit_id, u]))
  const meterIds = meterList.map(m => m.meter_id)
  const unitIds  = meterList.map(m => m.unit_id)

  const [{ data: reads }, { data: leaseUnits }, { data: allLeases }, { data: allTenants }] = await Promise.all([
    meterIds.length > 0
      ? supabase
          .from('meter_reads')
          .select('read_id, meter_id, read_date, reading_value, consumption_kwh, charge_id')
          .in('meter_id', meterIds)
          .order('read_date', { ascending: false })
      : Promise.resolve({ data: [] }),
    unitIds.length > 0
      ? supabase.from('lease_units').select('unit_id, lease_id').in('unit_id', unitIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('leases')
      .select('lease_id, tenant_id, lease_state, commencement_date')
      .eq('asset_id', asset.asset_id)
      .neq('lease_state', 'TERMINATED'),
    supabase.from('tenants').select('tenant_id, legal_name, trading_name'),
  ])

  const lastRead = new Map<string, { read_date: string; reading_value: string }>()
  for (const r of reads ?? []) {
    if (!lastRead.has(r.meter_id)) lastRead.set(r.meter_id, r)
  }

  // Per-meter cycle reads (read_id, date, value, consumption, whether still editable).
  // A read is editable if it raised no charge (billing-off / opening) or its charge is still DRAFT.
  const chargeIdsForReads = Array.from(
    new Set((reads ?? []).map(r => r.charge_id).filter((id): id is string => !!id))
  )
  const chargeStatusById = new Map<string, string>()
  if (chargeIdsForReads.length > 0) {
    const { data: chgStatuses } = await supabase
      .from('charge_records')
      .select('charge_id, status')
      .in('charge_id', chargeIdsForReads)
    for (const c of chgStatuses ?? []) chargeStatusById.set(c.charge_id, c.status)
  }
  const readsByMeter = new Map<string, CycleRead[]>()
  for (const r of reads ?? []) {
    const arr = readsByMeter.get(r.meter_id) ?? []
    const editable = !r.charge_id || chargeStatusById.get(r.charge_id) === 'DRAFT'
    arr.push({
      read_id: r.read_id,
      date: r.read_date,
      value: parseFloat(r.reading_value),
      consumption: r.consumption_kwh != null ? parseFloat(r.consumption_kwh) : null,
      editable,
    })
    readsByMeter.set(r.meter_id, arr)
  }

  const leaseById  = new Map((allLeases ?? []).map(l => [l.lease_id, l]))
  const tenantById = new Map((allTenants ?? []).map(t => [t.tenant_id, t]))
  const tenantByUnit = new Map<string, string>()
  for (const lu of leaseUnits ?? []) {
    const lease = leaseById.get(lu.lease_id)
    if (!lease) continue
    const tenant = tenantById.get(lease.tenant_id)
    if (tenant) tenantByUnit.set(lu.unit_id, tenant.trading_name ?? tenant.legal_name)
  }

  const today = new Date().toISOString().slice(0, 10)
  function rateFor(blockId: string | null): number | null {
    const live = (rates ?? []).filter(r =>
      r.effective_from <= today && (!r.effective_to || r.effective_to >= today))
    const block = live.find(r => r.block_id && r.block_id === blockId)
    const fallback = live.find(r => !r.block_id)
    const hit = block ?? fallback
    return hit ? parseFloat(hit.rate_per_kwh) : null
  }

  const meterRows: MeterRow[] = meterList
    .map(m => {
      const unit = unitById.get(m.unit_id) ?? null
      const last = lastRead.get(m.meter_id)
      return {
        meter_id: m.meter_id,
        meter_reference: m.meter_reference,
        unit_label: unit ? unitLabel(unit.unit_reference) : DASH,
        tenant_name: tenantByUnit.get(m.unit_id) ?? null,
        last_date: last?.read_date ?? null,
        last_value: last ? parseFloat(last.reading_value) : null,
        rate: rateFor(unit?.block_id ?? null),
        active: m.active !== false,
        reads: readsByMeter.get(m.meter_id) ?? [],
      }
    })
    .sort((a, b) => a.unit_label.localeCompare(b.unit_label, undefined, { numeric: true }))

  // ---------- Matrix: unit x month, kWh + financials ----------
  const monthSet = new Set<string>()
  const matrixMap = new Map<string, MatrixRow>()

  function rowFor(unitRef: string, tenant: string | null, billingOn: boolean): MatrixRow {
    const label = unitLabel(unitRef)
    let row = matrixMap.get(label)
    if (!row) {
      row = { unit_label: label, unit_ref: unitRef, tenant_name: tenant, billing_on: billingOn, cells: {} }
      matrixMap.set(label, row)
    }
    if (tenant && !row.tenant_name) row.tenant_name = tenant
    return row
  }
  function cellFor(row: MatrixRow, month: string): MatrixCell {
    if (!row.cells[month]) row.cells[month] = { kwh: null, billed: null, paid: null, outstanding: null }
    return row.cells[month]
  }

  // kWh from all meter reads (includes billing-off meters)
  for (const r of meterUsage ?? []) {
    monthSet.add(r.read_month)
    const row = rowFor(r.unit_reference, r.tenant_name, r.billing_on !== false)
    const cell = cellFor(row, r.read_month)
    cell.kwh = (cell.kwh ?? 0) + parseFloat(r.consumption_kwh ?? '0')
  }
  // Financials from billed charges
  for (const u of usage ?? []) {
    monthSet.add(u.bill_month)
    const row = rowFor(u.unit_reference, u.tenant_name, true)
    const cell = cellFor(row, u.bill_month)
    cell.billed = (cell.billed ?? 0) + parseFloat(u.gross_amount ?? '0')
    cell.paid = (cell.paid ?? 0) + parseFloat(u.payment_amount ?? '0')
    cell.outstanding = (cell.outstanding ?? 0) + parseFloat(u.outstanding ?? '0')
  }

  const months: MatrixMonth[] = Array.from(monthSet).sort().map(key => ({
    key,
    label: new Date(key + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
  }))
  const matrixRows = Array.from(matrixMap.values())
    .sort((a, b) => a.unit_label.localeCompare(b.unit_label, undefined, { numeric: true }))

  // ---------- Per-block dashboard: latest bill month vs prior, split by block ----------
  // Each block is a separate supplier account, so usage/cost is shown per block.
  const billMonths = Array.from(new Set((usage ?? []).map(u => u.bill_month))).sort()
  const latest = billMonths[billMonths.length - 1]
  const prior  = billMonths[billMonths.length - 2]

  function blockMonthTotals(block: string, month: string | undefined) {
    if (!month) return null
    const rows = (usage ?? []).filter(u => u.block_name === block && u.bill_month === month)
    if (rows.length === 0) return null
    return {
      label: rows[0].bill_month_label,
      kwh: rows.reduce((s, r) => s + parseFloat(r.consumption_kwh ?? '0'), 0),
      billed: rows.reduce((s, r) => s + parseFloat(r.gross_amount ?? '0'), 0),
      paid: rows.reduce((s, r) => s + parseFloat(r.payment_amount ?? '0'), 0),
      outstanding: rows.reduce((s, r) => s + parseFloat(r.outstanding ?? '0'), 0),
    }
  }

  function delta(curr: number, prev: number | undefined): string | null {
    if (prev == null || prev === 0) return null
    const pct = ((curr - prev) / prev) * 100
    return (pct >= 0 ? '+' : '') + pct.toFixed(0) + '% vs prior month'
  }

  const blockNames = Array.from(new Set((usage ?? []).map(u => u.block_name))).sort()
  const blockCards = blockNames
    .map(b => ({ block: b, latest: blockMonthTotals(b, latest), prior: blockMonthTotals(b, prior) }))
    .filter(bc => bc.latest)

  // ---------- Block history ----------
  interface UsageAgg {
    month: string; label: string; block: string
    invoices: number; kwh: number; net: number; vat: number; gross: number; outstanding: number
  }
  const usageAgg = new Map<string, UsageAgg>()
  for (const r of usage ?? []) {
    const key = `${r.bill_month}|${r.block_name}`
    const agg = usageAgg.get(key) ?? {
      month: r.bill_month, label: r.bill_month_label, block: r.block_name,
      invoices: 0, kwh: 0, net: 0, vat: 0, gross: 0, outstanding: 0,
    }
    agg.invoices += 1
    agg.kwh += parseFloat(r.consumption_kwh ?? '0')
    agg.net += parseFloat(r.net_amount ?? '0')
    agg.vat += parseFloat(r.vat_amount ?? '0')
    agg.gross += parseFloat(r.gross_amount ?? '0')
    agg.outstanding += parseFloat(r.outstanding ?? '0')
    usageAgg.set(key, agg)
  }
  const blockRows = Array.from(usageAgg.values())
    .sort((a, b) => b.month.localeCompare(a.month) || a.block.localeCompare(b.block))

  // ---------- Supplier reconciliation: recovery (tenant billed) vs cost (supplier bill) ----------
  const supplierByKey = new Map<string, { gross: number; kwh: number; supplier: string | null }>()
  for (const b of supplierBills ?? []) {
    const month = String(b.bill_month).slice(0, 7)
    supplierByKey.set(`${month}|${b.block_name}`, {
      gross: parseFloat(b.gross_amount ?? '0'),
      kwh: parseFloat(b.consumption_kwh ?? '0'),
      supplier: b.supplier_name,
    })
  }
  const reconKeys = new Set<string>([...usageAgg.keys(), ...supplierByKey.keys()])
  const reconRows = Array.from(reconKeys).map(key => {
    const [month, block] = key.split('|')
    const tenant = usageAgg.get(key)
    const supplier = supplierByKey.get(key)
    const recovered = tenant?.gross ?? 0
    const cost = supplier?.gross ?? 0
    return {
      month, block,
      label: tenant?.label ?? new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      tenantKwh: tenant?.kwh ?? null,
      supplierKwh: supplier ? supplier.kwh : null,
      supplierName: supplier?.supplier ?? null,
      recovered, cost,
      recoveryPct: cost > 0 ? (recovered / cost) * 100 : null,
      hasSupplier: !!supplier,
    }
  }).sort((a, b) => b.month.localeCompare(a.month) || a.block.localeCompare(b.block))

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset.asset_name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Meter Readings</span>
      </nav>

      <AssetTabs reference={reference} active="electric" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {asset.asset_name} {DASH} Meter Readings
        </h1>
        <p className="text-sm text-slate-500 mt-1">Enter readings, then review usage and cost. Record electric payments on the Electric: Payments tab.</p>
      </div>

      {/* Per-block dashboard — each block is a separate supplier account */}
      {blockCards.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {blockCards.map(bc => (
            <div key={bc.block} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">{bc.block}</h3>
                <span className="text-xs text-slate-400">{bc.latest!.label}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide">kWh</p>
                  <p className="text-xl font-bold text-slate-900">{bc.latest!.kwh.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</p>
                  {bc.prior && <p className="text-[11px] text-slate-400 mt-0.5">{delta(bc.latest!.kwh, bc.prior.kwh)}</p>}
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide">Billed</p>
                  <p className="text-xl font-bold text-slate-900">{gbp(bc.latest!.billed)}</p>
                  {bc.prior && <p className="text-[11px] text-slate-400 mt-0.5">{delta(bc.latest!.billed, bc.prior.billed)}</p>}
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide">Outstanding</p>
                  <p className={`text-xl font-bold ${bc.latest!.outstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>{gbp(bc.latest!.outstanding)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 1. Enter readings */}
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
        1. Enter Meter Readings
      </h2>
      <p className="text-xs text-slate-400 mb-3 max-w-3xl">
        At the end of each billing cycle (24th/25th of the month), enter the closing reading for each meter.
        Each reading creates a DRAFT charge automatically {DASH} review, approve and issue them on the
        {' '}<Link href={`/assets/${reference}/invoicing-electric`} className="text-blue-600 hover:underline">Electric: Invoicing tab</Link>.
        {' '}Meters set to billing {String.fromCharCode(0x201C)}Off{String.fromCharCode(0x201D)} record
        usage without raising an invoice.
      </p>
      <div className="mb-3">
        <BulkReadingUpload meters={meterRows.map(m => ({
          meter_id: m.meter_id, meter_reference: m.meter_reference, unit_label: m.unit_label, last_value: m.last_value,
        }))} />
      </div>
      <ElectricEntry rows={meterRows} />

      {/* 2. Multi-dimensional matrix */}
      {matrixRows.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 mt-8">
            2. Usage &amp; Cost by Unit
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Switch between consumption and financial views. Each cell is one unit{String.fromCharCode(0x2019)}s month;
            totals run along the bottom and right.
          </p>
          <ElectricMatrix months={months} rows={matrixRows} reference={reference} />
        </>
      )}

      {/* 4. Block / month history */}
      {blockRows.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 mt-8">
            3. Block Totals by Month
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Reconcile these totals against supplier bills (Block A, Block B and Southgate are always billed at separate rates).
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Billing Month</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Block</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoices</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">kWh</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Net</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">VAT</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Gross</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {blockRows.map(r => (
                  <tr key={r.month + r.block} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{r.label}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/assets/${reference}/electric/block/${encodeURIComponent(r.block)}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline">{r.block}</Link>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{r.invoices}</td>
                    <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                      {r.kwh.toLocaleString('en-GB', { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{gbp(r.net)}</td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs whitespace-nowrap">{gbp(r.vat)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{gbp(r.gross)}</td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${r.outstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {r.outstanding > 0 ? gbp(r.outstanding) : DASH}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 4. Supplier bill reconciliation */}
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 mt-8">
        4. Supplier Bill Reconciliation
      </h2>
      <p className="text-xs text-slate-400 mb-3 max-w-3xl">
        Enter the actual supplier bill per block/month to compare what you recovered from tenants against what the
        supplier charged. These will rarely match exactly {DASH} supplier bills run calendar months (1st{DASH}end),
        while tenant cycles run ~24th/25th {DASH} so read this as a recovery ratio, not a zero-variance reconciliation.
      </p>
      {blockNames.length > 0 && (
        <div className="mb-4">
          <SupplierBillEntry assetId={asset.asset_id} blocks={blockNames} />
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Month</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Block</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Supplier</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Recovered</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Supplier Cost</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Recovery %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reconRows.map(r => (
              <tr key={r.month + r.block} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{r.label}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.block}</td>
                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{r.supplierName ?? DASH}</td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{gbp(r.recovered)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {r.hasSupplier ? gbp(r.cost) : <span className="text-slate-300">not entered</span>}
                </td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                  {r.recoveryPct == null
                    ? DASH
                    : <span className={r.recoveryPct >= 100 ? 'text-emerald-600' : r.recoveryPct >= 90 ? 'text-amber-600' : 'text-red-600'}>
                        {r.recoveryPct.toFixed(0)}%
                      </span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {reconRows.length === 0 && (
          <div className="p-10 text-center text-slate-400 text-sm">
            No data yet. Generate electric bills from readings, then enter the matching supplier bill above.
          </div>
        )}
      </div>
    </div>
  )
}

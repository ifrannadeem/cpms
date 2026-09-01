import ExcelJS from 'exceljs'
import { unitLabel } from './format'
import { supabase } from './supabase'

/**
 * Monthly rent income and VAT, invoiced against received, for one asset.
 *
 * Built for the accountant's request (2026-08-26). Deliberately narrow:
 *
 *  - **Rent only.** Electricity is excluded, on instruction.
 *  - **Figures sit in the month the rent relates to** (`period_start`), not the month the
 *    invoice was raised. Rent is billed in advance, so September's rent invoiced in August
 *    belongs to September here. The older "VAT on Rent" report anchors on `issued_date`
 *    instead, so the two will not agree — this one answers "what did each month earn".
 *  - **Invoiced and received sit side by side.** They match except where a tenant has not
 *    paid, so the gap between them is the arrears rather than a discrepancy to chase.
 *  - **One asset at a time, never merged.** Rosehill (2i Investments) and Southgate
 *    (Noblestone Partners, as agent) are separate legal entities with separate VAT
 *    registrations filing separate returns. A combined figure would be meaningless.
 *
 * VAT on a receipt is apportioned from the invoice it paid — allocated ÷ gross × VAT — so a
 * part payment splits proportionately instead of being treated as all net or all VAT.
 * Receipts come from `payment_allocations`, not `payments.amount`: only allocated money has
 * been set against an invoice, and only then is its VAT identifiable.
 */

const MONEY = '"£"#,##0.00'
const NAVY = 'FF1E293B'
const LIGHT = 'FFF1F5F9'
const BAND = 'FFE2E8F0'
const WHITE = 'FFFFFFFF'
const MUTED = 'FF475569'
const FAINT = 'FF94A3B8'
const AMBER = 'FFB45309'

function pad(n: number): string { return String(n).padStart(2, '0') }
const round2 = (n: number) => Math.round(n * 100) / 100

export interface IncomeVatCell {
  netInvoiced: number
  vatInvoiced: number
  grossInvoiced: number
  netReceived: number
  vatReceived: number
  grossReceived: number
}

export interface IncomeVatRow {
  unit: string
  tenant: string
  byMonth: Record<string, IncomeVatCell>
  total: IncomeVatCell
}

export interface IncomeVatReport {
  assetName: string
  entityName: string | null
  vatNumber: string | null
  registered: boolean
  fromMonth: string
  toMonth: string
  months: { key: string; label: string }[]
  rows: IncomeVatRow[]
  monthTotals: Record<string, IncomeVatCell>
  total: IncomeVatCell
  /** Gross of invoices credited or written off, per month. Excluded from the figures above
   *  but surfaced, so nothing disappears silently — a written-off debt may carry bad debt
   *  relief the accountant needs to know about. */
  cancelledByMonth: Record<string, number>
  cancelledTotal: number
  generatedAt: string
}

export function emptyCell(): IncomeVatCell {
  return { netInvoiced: 0, vatInvoiced: 0, grossInvoiced: 0, netReceived: 0, vatReceived: 0, grossReceived: 0 }
}

function addCell(a: IncomeVatCell, b: IncomeVatCell): void {
  a.netInvoiced += b.netInvoiced
  a.vatInvoiced += b.vatInvoiced
  a.grossInvoiced += b.grossInvoiced
  a.netReceived += b.netReceived
  a.vatReceived += b.vatReceived
  a.grossReceived += b.grossReceived
}

/** Months from YYYY-MM to YYYY-MM inclusive. */
export function monthRange(fromMonth: string, toMonth: string): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  const [fy, fm] = fromMonth.split('-').map(Number)
  const [ty, tm] = toMonth.split('-').map(Number)
  if (!fy || !fm || !ty || !tm) return out
  if (ty < fy || (ty === fy && tm < fm)) return out
  let y = fy, m = fm
  // Hard stop at ten years: a malformed range must not spin, and nobody wants that many
  // columns in one sheet.
  for (let guard = 0; guard < 120; guard++) {
    const key = `${y}-${pad(m)}`
    out.push({ key, label: new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) })
    if (y === ty && m === tm) break
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

const COUNTED = ['ISSUED', 'OVERDUE', 'PART_PAID', 'PAID']
const CANCELLED = ['CREDITED', 'WRITTEN_OFF']

export async function computeIncomeVat(
  assetId: string,
  fromMonth: string,
  toMonth: string,
): Promise<IncomeVatReport> {
  const months = monthRange(fromMonth, toMonth)
  if (months.length === 0) throw new Error('Invalid period: the start month must not be after the end month.')

  const windowStart = `${months[0].key}-01`
  const [ly, lm] = months[months.length - 1].key.split('-').map(Number)
  const windowEndExcl = `${lm === 12 ? ly + 1 : ly}-${pad(lm === 12 ? 1 : lm + 1)}-01`

  const [{ data: asset }, { data: entity }, { data: cfg }, { data: charges }, { data: units }, { data: tenants }] =
    await Promise.all([
      supabase.from('assets').select('asset_name').eq('asset_id', assetId).single(),
      supabase.from('issuing_entities').select('entity_name, vat_number').eq('asset_id', assetId).maybeSingle(),
      supabase.from('vat_config').select('registered').eq('asset_id', assetId).maybeSingle(),
      supabase.from('charge_records')
        .select('charge_id, unit_id, tenant_id, period_start, net_amount, vat_amount, gross_amount, status')
        .eq('asset_id', assetId).eq('charge_type', 'RENT')
        .in('status', [...COUNTED, ...CANCELLED])
        .gte('period_start', windowStart).lt('period_start', windowEndExcl),
      supabase.from('units').select('unit_id, unit_reference').eq('asset_id', assetId),
      supabase.from('tenants').select('tenant_id, legal_name, trading_name'),
    ])

  const chargeIds = (charges ?? []).map(c => c.charge_id)
  const { data: allocations } = chargeIds.length
    ? await supabase.from('payment_allocations').select('charge_id, allocated_amount').in('charge_id', chargeIds)
    : { data: [] as { charge_id: string; allocated_amount: string }[] }

  const receivedByCharge = new Map<string, number>()
  for (const a of allocations ?? []) {
    receivedByCharge.set(a.charge_id, (receivedByCharge.get(a.charge_id) ?? 0) + parseFloat(a.allocated_amount ?? '0'))
  }

  const unitRefById = new Map((units ?? []).map(u => [u.unit_id, u.unit_reference]))
  const tenantById = new Map((tenants ?? []).map(t => [t.tenant_id, t]))
  const nameOf = (id: string) => {
    const t = tenantById.get(id)
    return t ? (t.trading_name ?? t.legal_name) : String.fromCharCode(0x2014)
  }

  const monthSet = new Set(months.map(m => m.key))
  const rowMap = new Map<string, IncomeVatRow>()
  const monthTotals: Record<string, IncomeVatCell> = {}
  const cancelledByMonth: Record<string, number> = {}
  for (const m of months) { monthTotals[m.key] = emptyCell(); cancelledByMonth[m.key] = 0 }
  const total = emptyCell()
  let cancelledTotal = 0

  for (const c of charges ?? []) {
    const mk = (c.period_start ?? '').slice(0, 7)
    if (!monthSet.has(mk)) continue

    const gross = parseFloat(c.gross_amount ?? '0')

    if (CANCELLED.includes(c.status)) {
      cancelledByMonth[mk] += gross
      cancelledTotal += gross
      continue
    }

    const net = parseFloat(c.net_amount ?? '0')
    const vat = parseFloat(c.vat_amount ?? '0')
    const received = receivedByCharge.get(c.charge_id) ?? 0
    const vatReceived = gross > 0 ? round2((received * vat) / gross) : 0
    const netReceived = round2(received - vatReceived)

    const key = c.unit_id ?? c.tenant_id
    let row = rowMap.get(key)
    if (!row) {
      row = {
        unit: unitLabel(c.unit_id ? unitRefById.get(c.unit_id) : null),
        tenant: nameOf(c.tenant_id),
        byMonth: {},
        total: emptyCell(),
      }
      rowMap.set(key, row)
    }
    if (!row.byMonth[mk]) row.byMonth[mk] = emptyCell()

    const cell: IncomeVatCell = {
      netInvoiced: net, vatInvoiced: vat, grossInvoiced: gross,
      netReceived, vatReceived, grossReceived: received,
    }
    addCell(row.byMonth[mk], cell)
    addCell(row.total, cell)
    addCell(monthTotals[mk], cell)
    addCell(total, cell)
  }

  const rows = Array.from(rowMap.values())
    .sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }))

  return {
    assetName: asset?.asset_name ?? 'Asset',
    entityName: entity?.entity_name ?? null,
    vatNumber: entity?.vat_number ?? null,
    registered: cfg?.registered !== false,
    fromMonth, toMonth, months, rows, monthTotals, total,
    cancelledByMonth, cancelledTotal,
    generatedAt: new Date().toLocaleString('en-GB'),
  }
}

// ---------- Workbook ----------

function colLetter(n: number): string {
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}

/** Three sheets: a summary the accountant can read straight off, then VAT and net rent
 *  broken down per tenant per month, each showing invoiced against received. */
export async function buildIncomeVatWorkbook(r: IncomeVatReport): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Opera'
  wb.created = new Date()

  const periodLabel = `${r.months[0].label} to ${r.months[r.months.length - 1].label}`
  const entityLine = [r.entityName, r.vatNumber ? `VAT ${r.vatNumber}` : (r.registered ? null : 'not VAT registered')]
    .filter(Boolean).join('  ·  ')

  // ----- Sheet 1: Summary -----
  const s = wb.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 8 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
  })
  s.columns = [{ width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 4 },
               { width: 14 }, { width: 14 }, { width: 14 }, { width: 4 }, { width: 15 }]

  s.mergeCells('A1:J1')
  s.getCell('A1').value = `${r.assetName} — Rent Income & VAT`
  s.getCell('A1').font = { bold: true, size: 15, color: { argb: NAVY } }
  s.mergeCells('A2:J2')
  s.getCell('A2').value = entityLine
  s.getCell('A2').font = { size: 11, color: { argb: MUTED } }
  s.mergeCells('A3:J3')
  s.getCell('A3').value = periodLabel
  s.getCell('A3').font = { size: 12, color: { argb: MUTED } }
  s.mergeCells('A4:J4')
  s.getCell('A4').value =
    'Rent only — excludes electricity. Figures sit in the month the rent relates to, not the month the invoice was raised. '
    + 'Received is money actually allocated to those invoices; VAT on a part payment is apportioned from the invoice.'
  s.getCell('A4').font = { size: 9, italic: true, color: { argb: FAINT } }
  s.getCell('A4').alignment = { wrapText: true }
  s.getRow(4).height = 24
  if (!r.registered) {
    s.mergeCells('A5:J5')
    s.getCell('A5').value = 'This property is marked as NOT VAT registered — VAT columns will be nil.'
    s.getCell('A5').font = { size: 10, italic: true, color: { argb: AMBER } }
  }
  s.getRow(6).height = 4

  const band = s.getRow(7)
  s.mergeCells('B7:D7'); band.getCell(2).value = 'Invoiced'
  s.mergeCells('F7:H7'); band.getCell(6).value = 'Received'
  for (const c of [2, 6]) {
    const cell = band.getCell(c)
    cell.alignment = { horizontal: 'center' }
    cell.font = { bold: true, size: 10, color: { argb: NAVY } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }
  }

  const head = s.getRow(8)
  const heads = ['Month', 'Net', 'VAT', 'Gross', '', 'Net', 'VAT', 'Gross', '', 'Outstanding']
  heads.forEach((h, i) => {
    const cell = head.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: WHITE }, size: 9 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    cell.alignment = { horizontal: i === 0 ? 'left' : 'right' }
  })
  head.height = 18

  let row = 9
  for (const m of r.months) {
    const t = r.monthTotals[m.key]
    const xr = s.getRow(row)
    xr.getCell(1).value = m.label
    xr.getCell(2).value = t.netInvoiced
    xr.getCell(3).value = t.vatInvoiced
    xr.getCell(4).value = t.grossInvoiced
    xr.getCell(6).value = t.netReceived
    xr.getCell(7).value = t.vatReceived
    xr.getCell(8).value = t.grossReceived
    xr.getCell(10).value = round2(t.grossInvoiced - t.grossReceived)
    for (const c of [2, 3, 4, 6, 7, 8, 10]) xr.getCell(c).numFmt = MONEY
    const out = xr.getCell(10)
    if (round2(t.grossInvoiced - t.grossReceived) > 0) out.font = { color: { argb: AMBER } }
    row++
  }

  const tr = s.getRow(row)
  tr.getCell(1).value = 'Total'
  tr.getCell(2).value = r.total.netInvoiced
  tr.getCell(3).value = r.total.vatInvoiced
  tr.getCell(4).value = r.total.grossInvoiced
  tr.getCell(6).value = r.total.netReceived
  tr.getCell(7).value = r.total.vatReceived
  tr.getCell(8).value = r.total.grossReceived
  tr.getCell(10).value = round2(r.total.grossInvoiced - r.total.grossReceived)
  for (const c of [2, 3, 4, 6, 7, 8, 10]) tr.getCell(c).numFmt = MONEY
  for (let c = 1; c <= 10; c++) {
    const cell = tr.getCell(c)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
    cell.font = { bold: true, color: { argb: NAVY } }
    cell.border = { top: { style: 'thin', color: { argb: FAINT } } }
  }
  row += 2

  if (r.cancelledTotal > 0) {
    s.getCell(`A${row}`).value = 'Credited or written off (excluded above)'
    s.getCell(`A${row}`).font = { bold: true, color: { argb: AMBER } }
    s.getCell(`D${row}`).value = r.cancelledTotal
    s.getCell(`D${row}`).numFmt = MONEY
    s.getCell(`D${row}`).font = { bold: true, color: { argb: AMBER } }
    row++
    s.mergeCells(`A${row}:J${row}`)
    s.getCell(`A${row}`).value = 'A written-off debt may carry VAT bad debt relief — worth raising with the accountant.'
    s.getCell(`A${row}`).font = { size: 9, italic: true, color: { argb: FAINT } }
    row += 2
  }

  s.getCell(`A${row}`).value = `Generated ${r.generatedAt} from Opera.`
  s.getCell(`A${row}`).font = { size: 9, italic: true, color: { argb: FAINT } }

  // ----- Sheets 2 and 3: per tenant, per month -----
  const detail = (
    title: string,
    sheetName: string,
    pick: (c: IncomeVatCell) => { invoiced: number; received: number },
  ) => {
    const ws = wb.addWorksheet(sheetName, {
      views: [{ state: 'frozen', xSplit: 2, ySplit: 7 }],
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
    })
    const cols: Partial<ExcelJS.Column>[] = [{ width: 16 }, { width: 30 }]
    for (let i = 0; i < r.months.length; i++) { cols.push({ width: 12 }, { width: 12 }) }
    cols.push({ width: 13 }, { width: 13 })
    ws.columns = cols
    const lastCol = 2 + r.months.length * 2 + 2

    ws.mergeCells(`A1:${colLetter(lastCol)}1`)
    ws.getCell('A1').value = `${r.assetName} — ${title}`
    ws.getCell('A1').font = { bold: true, size: 15, color: { argb: NAVY } }
    ws.mergeCells(`A2:${colLetter(lastCol)}2`)
    ws.getCell('A2').value = `${entityLine}  ·  ${periodLabel}`
    ws.getCell('A2').font = { size: 11, color: { argb: MUTED } }
    ws.mergeCells(`A3:${colLetter(lastCol)}3`)
    ws.getCell('A3').value =
      'Each month shows what was invoiced and what has been received against it. The two match unless a tenant has not paid.'
    ws.getCell('A3').font = { size: 9, italic: true, color: { argb: FAINT } }
    ws.getRow(4).height = 4

    const mBand = ws.getRow(6)
    const mHead = ws.getRow(7)
    mHead.getCell(1).value = 'Unit'
    mHead.getCell(2).value = 'Tenant'
    let c = 3
    r.months.forEach((m, mi) => {
      ws.mergeCells(`${colLetter(c)}6:${colLetter(c + 1)}6`)
      const bc = mBand.getCell(c)
      bc.value = m.label
      bc.alignment = { horizontal: 'center' }
      bc.font = { bold: true, size: 10, color: { argb: NAVY } }
      bc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mi % 2 === 0 ? BAND : LIGHT } }
      mHead.getCell(c).value = 'Invoiced'
      mHead.getCell(c + 1).value = 'Received'
      c += 2
    })
    ws.mergeCells(`${colLetter(c)}6:${colLetter(c + 1)}6`)
    const tc = mBand.getCell(c)
    tc.value = 'Total'
    tc.alignment = { horizontal: 'center' }
    tc.font = { bold: true, size: 10, color: { argb: NAVY } }
    tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }
    mHead.getCell(c).value = 'Invoiced'
    mHead.getCell(c + 1).value = 'Received'

    for (let i = 1; i <= lastCol; i++) {
      const hc = mHead.getCell(i)
      hc.font = { bold: true, color: { argb: WHITE }, size: 9 }
      hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
      hc.alignment = { vertical: 'middle', horizontal: i <= 2 ? 'left' : 'right' }
    }
    mHead.height = 18

    let rr = 8
    for (const dataRow of r.rows) {
      const xr = ws.getRow(rr)
      xr.getCell(1).value = dataRow.unit
      xr.getCell(2).value = dataRow.tenant
      let cc = 3
      for (const m of r.months) {
        const v = pick(dataRow.byMonth[m.key] ?? emptyCell())
        xr.getCell(cc).value = v.invoiced || null
        xr.getCell(cc).numFmt = MONEY
        xr.getCell(cc + 1).value = v.received || null
        xr.getCell(cc + 1).numFmt = MONEY
        // Flag where money is still owed for that month, which is the whole point of
        // showing the two side by side.
        if (round2(v.invoiced - v.received) > 0) {
          xr.getCell(cc + 1).font = { color: { argb: AMBER } }
        }
        cc += 2
      }
      const t = pick(dataRow.total)
      xr.getCell(cc).value = t.invoiced || null
      xr.getCell(cc).numFmt = MONEY
      xr.getCell(cc).font = { bold: true, color: { argb: NAVY } }
      xr.getCell(cc + 1).value = t.received || null
      xr.getCell(cc + 1).numFmt = MONEY
      xr.getCell(cc + 1).font = { bold: true, color: { argb: NAVY } }
      rr++
    }

    if (r.rows.length === 0) {
      ws.mergeCells(`A${rr}:${colLetter(lastCol)}${rr}`)
      ws.getCell(`A${rr}`).value = 'No rent invoices in this period.'
      ws.getCell(`A${rr}`).font = { italic: true, color: { argb: FAINT } }
      rr++
    }

    const totRow = ws.getRow(rr)
    totRow.getCell(1).value = 'Total'
    let tcc = 3
    for (const m of r.months) {
      const v = pick(r.monthTotals[m.key])
      totRow.getCell(tcc).value = v.invoiced || null
      totRow.getCell(tcc).numFmt = MONEY
      totRow.getCell(tcc + 1).value = v.received || null
      totRow.getCell(tcc + 1).numFmt = MONEY
      tcc += 2
    }
    const gt = pick(r.total)
    totRow.getCell(tcc).value = gt.invoiced
    totRow.getCell(tcc).numFmt = MONEY
    totRow.getCell(tcc + 1).value = gt.received
    totRow.getCell(tcc + 1).numFmt = MONEY
    for (let i = 1; i <= lastCol; i++) {
      const cell = totRow.getCell(i)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
      cell.font = { bold: true, color: { argb: NAVY } }
      cell.border = { top: { style: 'thin', color: { argb: FAINT } } }
    }
  }

  detail('VAT on Rent', 'VAT by tenant', c => ({ invoiced: c.vatInvoiced, received: c.vatReceived }))
  detail('Rent (net of VAT)', 'Rent by tenant', c => ({ invoiced: c.netInvoiced, received: c.netReceived }))

  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

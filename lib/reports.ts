import ExcelJS from 'exceljs'
import { unitLabel } from './format'
import { supabase } from '@/lib/supabase'

const MONEY = '"£"#,##0.00'

const NAVY = 'FF1E293B'
const LIGHT = 'FFF1F5F9'
const QBAND = 'FFE2E8F0'
const WHITE = 'FFFFFFFF'

function pad(n: number): string { return String(n).padStart(2, '0') }

// ---------- Monthly rent income ----------

export interface RentRow {
  unit: string
  tenant: string
  grossBilled: number
  received: number
  outstanding: number
}

export interface RentIncomeData {
  assetName: string
  monthLabel: string
  generatedAt: string
  rows: RentRow[]
  totalReceivedAll: number
}

export async function buildRentIncomeWorkbook(data: RentIncomeData): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Opera'
  wb.created = new Date()
  const ws = wb.addWorksheet('Rent Income', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'portrait' },
  })

  ws.columns = [
    { key: 'unit', width: 18 },
    { key: 'tenant', width: 34 },
    { key: 'gross', width: 16 },
    { key: 'received', width: 16 },
    { key: 'outstanding', width: 16 },
  ]

  ws.mergeCells('A1:E1')
  ws.getCell('A1').value = `${data.assetName} — Monthly Rent Report`
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: NAVY } }
  ws.mergeCells('A2:E2')
  ws.getCell('A2').value = data.monthLabel
  ws.getCell('A2').font = { size: 12, color: { argb: 'FF475569' } }
  ws.mergeCells('A3:E3')
  ws.getCell('A3').value = `Generated ${data.generatedAt}`
  ws.getCell('A3').font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } }
  ws.getRow(4).height = 6

  const headers = ['Unit', 'Tenant', 'Gross Rent Billed', 'Received This Month', 'Balance Outstanding']
  const hr = ws.getRow(5)
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1)
    c.value = h
    c.font = { bold: true, color: { argb: WHITE }, size: 10 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle', horizontal: i < 2 ? 'left' : 'right', wrapText: true }
  })
  hr.height = 26

  let r = 6
  let tGross = 0, tRecv = 0, tOut = 0
  for (const row of data.rows) {
    const xr = ws.getRow(r)
    xr.getCell(1).value = row.unit
    xr.getCell(2).value = row.tenant
    xr.getCell(3).value = row.grossBilled
    xr.getCell(4).value = row.received
    xr.getCell(5).value = row.outstanding
    for (let c = 3; c <= 5; c++) xr.getCell(c).numFmt = MONEY
    xr.getCell(5).font = { color: { argb: row.outstanding > 0 ? 'FFB91C1C' : 'FF334155' } }
    if (r % 2 === 1) for (let c = 1; c <= 5; c++) xr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    tGross += row.grossBilled; tRecv += row.received; tOut += row.outstanding
    r++
  }

  const tr = ws.getRow(r)
  tr.getCell(1).value = 'Total'
  tr.getCell(3).value = tGross
  tr.getCell(4).value = tRecv
  tr.getCell(5).value = tOut
  for (let c = 1; c <= 5; c++) {
    const c2 = tr.getCell(c)
    c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
    c2.font = { bold: true, color: { argb: c === 5 && tOut > 0 ? 'FFB91C1C' : NAVY } }
    c2.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }
    if (c >= 3) c2.numFmt = MONEY
  }
  r += 2

  ws.mergeCells(`A${r}:E${r}`)
  ws.getCell(`A${r}`).value =
    `Total rent received in ${data.monthLabel} (all payments, incl. arrears): £${data.totalReceivedAll.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  ws.getCell(`A${r}`).font = { italic: true, size: 10, color: { argb: 'FF475569' } }

  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

// ---------- VAT position: by unit, by month, grouped into quarters (Rent only) ----------

export interface VatMonth { key: string; mLabel: string; yShort: string; quarter: number }
export interface VatQuarter { q: number; label: string; range: string; monthKeys: string[] }
export interface VatUnitRow { unit: string; tenant: string; byMonth: Record<string, number>; total: number }

export interface VatMatrix {
  assetName: string
  yearLabel: string
  registered: boolean
  hasScheme: boolean
  year: number
  months: VatMonth[]
  quarters: VatQuarter[]
  rows: VatUnitRow[]
  monthTotals: Record<string, number>
  quarterTotals: number[]
  grandTotal: number
}

/** The calendar month (1-12) a VAT year begins, from the stagger's first quarter-end month. */
export function vatYearStartMonth(quarterEndMonth: number): number {
  return (quarterEndMonth % 3) + 1   // 3->1(Jan), 4->2(Feb), 5->3(Mar)
}

/** The VAT year (start calendar year) that contains today, for a given stagger. */
export function currentVatYear(quarterEndMonth: number | null): number {
  const now = new Date()
  const startM = quarterEndMonth ? vatYearStartMonth(quarterEndMonth) : 1
  return (now.getMonth() + 1) >= startM ? now.getFullYear() : now.getFullYear() - 1
}

export async function computeVatMatrix(assetId: string, year: number): Promise<VatMatrix> {
  const [{ data: asset }, { data: cfg }] = await Promise.all([
    supabase.from('assets').select('asset_name').eq('asset_id', assetId).single(),
    supabase.from('vat_config').select('registered, quarter_end_month').eq('asset_id', assetId).maybeSingle(),
  ])
  const registered = cfg?.registered !== false
  const anchorEnd: number | null = cfg?.quarter_end_month ?? null
  const hasScheme = anchorEnd != null
  const startM = anchorEnd != null ? vatYearStartMonth(anchorEnd) : 1

  // Build the 12-month window
  const months: VatMonth[] = []
  for (let i = 0; i < 12; i++) {
    const idx = (startM - 1) + i
    const y = year + Math.floor(idx / 12)
    const m = (idx % 12) + 1
    const d = new Date(y, m - 1, 1)
    months.push({
      key: `${y}-${pad(m)}`,
      mLabel: d.toLocaleString('en-GB', { month: 'short' }),
      yShort: String(y).slice(2),
      quarter: Math.floor(i / 3) + 1,
    })
  }
  const quarters: VatQuarter[] = [1, 2, 3, 4].map(q => {
    const ms = months.filter(m => m.quarter === q)
    return {
      q, label: `Q${q}`,
      range: `${ms[0].mLabel}–${ms[2].mLabel} ${ms[2].yShort}`,
      monthKeys: ms.map(m => m.key),
    }
  })

  const windowStart = `${months[0].key}-01`
  const lastM = months[11]
  const [ly, lm] = lastM.key.split('-').map(Number)
  const windowEndExcl = `${lm === 12 ? ly + 1 : ly}-${pad(lm === 12 ? 1 : lm + 1)}-01`

  const [{ data: charges }, { data: units }, { data: tenants }] = await Promise.all([
    supabase.from('charge_records')
      .select('unit_id, tenant_id, issued_date, vat_amount')
      .eq('asset_id', assetId).eq('charge_type', 'RENT')
      .in('status', ['ISSUED', 'OVERDUE', 'PART_PAID', 'PAID'])
      .gte('issued_date', windowStart).lt('issued_date', windowEndExcl),
    supabase.from('units').select('unit_id, unit_reference').eq('asset_id', assetId),
    supabase.from('tenants').select('tenant_id, legal_name, trading_name'),
  ])

  const unitRefById = new Map((units ?? []).map(u => [u.unit_id, u.unit_reference]))
  const tenantName = (id: string) => {
    const t = (tenants ?? []).find(x => x.tenant_id === id)
    return t ? (t.trading_name ?? t.legal_name) : '—'
  }
  const monthSet = new Set(months.map(m => m.key))

  const rowMap = new Map<string, VatUnitRow>()
  for (const c of charges ?? []) {
    const mk = (c.issued_date ?? '').slice(0, 7)
    if (!monthSet.has(mk)) continue
    const key = c.unit_id ?? c.tenant_id
    let row = rowMap.get(key)
    if (!row) {
      row = { unit: unitLabel(c.unit_id ? unitRefById.get(c.unit_id) : null), tenant: tenantName(c.tenant_id), byMonth: {}, total: 0 }
      rowMap.set(key, row)
    }
    const vat = parseFloat(c.vat_amount ?? '0')
    row.byMonth[mk] = (row.byMonth[mk] ?? 0) + vat
    row.total += vat
  }

  const rows = Array.from(rowMap.values())
    .sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }))

  const monthTotals: Record<string, number> = {}
  for (const m of months) monthTotals[m.key] = rows.reduce((s, r) => s + (r.byMonth[m.key] ?? 0), 0)
  const quarterTotals = quarters.map(q => q.monthKeys.reduce((s, k) => s + (monthTotals[k] ?? 0), 0))
  const grandTotal = rows.reduce((s, r) => s + r.total, 0)

  const yearLabel = startM === 1 ? `${year}` : `${year}/${String(year + 1).slice(2)}`

  return {
    assetName: asset?.asset_name ?? 'Asset',
    yearLabel, registered, hasScheme, year,
    months, quarters, rows, monthTotals, quarterTotals, grandTotal,
  }
}

export async function buildVatWorkbook(matrix: VatMatrix): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Opera'
  wb.created = new Date()
  const ws = wb.addWorksheet('VAT - Rent', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 7 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
  })

  // Columns: Unit, Tenant, then per quarter (3 months + subtotal), then Year Total
  const cols: Partial<ExcelJS.Column>[] = [{ width: 14 }, { width: 28 }]
  for (let q = 0; q < 4; q++) { cols.push({ width: 11 }, { width: 11 }, { width: 11 }, { width: 12 }) }
  cols.push({ width: 13 })
  ws.columns = cols
  const lastCol = 2 + 4 * 4 + 1   // 19

  function colLetter(n: number): string {
    let s = ''
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
    return s
  }

  ws.mergeCells(`A1:${colLetter(lastCol)}1`)
  ws.getCell('A1').value = `${matrix.assetName} — VAT on Rent`
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: NAVY } }
  ws.mergeCells(`A2:${colLetter(lastCol)}2`)
  ws.getCell('A2').value = `VAT year ${matrix.yearLabel}${matrix.hasScheme ? '' : ' (no quarter scheme set — calendar months shown)'}`
  ws.getCell('A2').font = { size: 12, color: { argb: 'FF475569' } }
  ws.mergeCells(`A3:${colLetter(lastCol)}3`)
  ws.getCell('A3').value = 'Output VAT on rent invoices, accrual basis (by invoice issue date). Rent only — excludes electricity.'
  ws.getCell('A3').font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } }
  if (!matrix.registered) {
    ws.mergeCells(`A4:${colLetter(lastCol)}4`)
    ws.getCell('A4').value = 'This property is marked as NOT VAT registered — shown as a placeholder.'
    ws.getCell('A4').font = { size: 10, italic: true, color: { argb: 'FFB45309' } }
  }
  ws.getRow(5).height = 4

  // Quarter band header (row 6) + column header (row 7)
  const qRow = ws.getRow(6)
  const hRow = ws.getRow(7)
  qRow.getCell(1).value = ''
  hRow.getCell(1).value = 'Unit'
  hRow.getCell(2).value = 'Tenant'
  let col = 3
  matrix.quarters.forEach((q, qi) => {
    const startC = col
    // month headers
    q.monthKeys.forEach(k => {
      const m = matrix.months.find(mm => mm.key === k)!
      hRow.getCell(col).value = `${m.mLabel} ${m.yShort}`
      col++
    })
    hRow.getCell(col).value = q.label  // subtotal column
    const endC = col
    ws.mergeCells(`${colLetter(startC)}6:${colLetter(endC)}6`)
    const qc = qRow.getCell(startC)
    qc.value = `${q.label}  ${q.range}`
    qc.alignment = { horizontal: 'center' }
    qc.font = { bold: true, size: 10, color: { argb: NAVY } }
    qc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: qi % 2 === 0 ? QBAND : LIGHT } }
    col++
  })
  hRow.getCell(col).value = 'Year Total'

  for (let c = 1; c <= lastCol; c++) {
    const hc = hRow.getCell(c)
    hc.font = { bold: true, color: { argb: WHITE }, size: 9 }
    hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    hc.alignment = { vertical: 'middle', horizontal: c <= 2 ? 'left' : 'right', wrapText: true }
  }
  hRow.height = 24

  // Data rows
  let r = 8
  for (const row of matrix.rows) {
    const xr = ws.getRow(r)
    xr.getCell(1).value = row.unit
    xr.getCell(2).value = row.tenant
    let c = 3
    matrix.quarters.forEach(q => {
      let qSum = 0
      q.monthKeys.forEach(k => {
        const v = row.byMonth[k] ?? 0
        xr.getCell(c).value = v || null
        xr.getCell(c).numFmt = MONEY
        qSum += v; c++
      })
      const sc = xr.getCell(c)
      sc.value = qSum || null
      sc.numFmt = MONEY
      sc.font = { bold: true, color: { argb: NAVY } }
      sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      c++
    })
    const tc = xr.getCell(c)
    tc.value = row.total
    tc.numFmt = MONEY
    tc.font = { bold: true, color: { argb: NAVY } }
    r++
  }

  if (matrix.rows.length === 0) {
    ws.mergeCells(`A${r}:${colLetter(lastCol)}${r}`)
    ws.getCell(`A${r}`).value = matrix.registered ? 'No rent invoices issued in this VAT year.' : 'Not VAT registered.'
    ws.getCell(`A${r}`).font = { italic: true, color: { argb: 'FF94A3B8' } }
    r++
  }

  // Totals row
  const tr = ws.getRow(r)
  tr.getCell(1).value = 'Total'
  let c2 = 3
  matrix.quarters.forEach((q, qi) => {
    q.monthKeys.forEach(k => { tr.getCell(c2).value = matrix.monthTotals[k] || null; tr.getCell(c2).numFmt = MONEY; c2++ })
    tr.getCell(c2).value = matrix.quarterTotals[qi] || null; tr.getCell(c2).numFmt = MONEY; c2++
  })
  tr.getCell(c2).value = matrix.grandTotal
  tr.getCell(c2).numFmt = MONEY
  for (let c = 1; c <= lastCol; c++) {
    const cc = tr.getCell(c)
    cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
    cc.font = { bold: true, color: { argb: NAVY } }
    cc.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }
  }
  r += 2

  // Quarter summary (Box 1 per quarter)
  ws.getCell(`A${r}`).value = 'Output VAT due by quarter (Box 1)'
  ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: NAVY } }
  r++
  matrix.quarters.forEach((q, qi) => {
    ws.getCell(`A${r}`).value = `${q.label}  ${q.range}`
    ws.getCell(`A${r}`).font = { color: { argb: 'FF475569' } }
    ws.getCell(`C${r}`).value = matrix.quarterTotals[qi]
    ws.getCell(`C${r}`).numFmt = MONEY
    ws.getCell(`C${r}`).font = { bold: true, color: { argb: NAVY } }
    r++
  })

  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

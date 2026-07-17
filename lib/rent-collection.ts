import ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { unitLabels } from '@/lib/format'

/**
 * Rent-collection matrix assembly, shared by the Rent: Collection page and the
 * Excel export so the two can never disagree. Cells are anchored to the invoice
 * month (rent received FOR July), matching how arrears are judged.
 */

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const CANCELLED = new Set(['CREDITED', 'WRITTEN_OFF'])

export interface MatrixCell {
  billed: number
  received: number
  status: string
}

export interface MatrixRow {
  leaseId: string
  unitLabel: string
  occupant: string
  ended: boolean
  monthlyRent: number
  cells: (MatrixCell | null)[]
  yearReceived: number
}

export interface RentCollectionData {
  assetName: string
  year: number
  rows: MatrixRow[]
  monthlyTotals: number[]
  cumulative: number[]
  payerCounts: number[]
  rentRoll: number
  yearBilled: number
  yearReceived: number
}

export function isCancelled(status: string): boolean {
  return CANCELLED.has(status)
}

export async function buildRentCollectionData(
  assetId: string,
  assetReference: string,
  assetName: string,
  year: number,
): Promise<RentCollectionData> {
  const [{ data: charges }, { data: leaseInfo }] = await Promise.all([
    supabase
      .from('v_charge_ledger')
      .select('lease_id, unit_reference, tenant_name, period_start, gross_amount, payment_amount, status')
      .eq('asset_id', assetId)
      .eq('charge_type', 'RENT')
      .gte('period_start', `${year}-01-01`)
      .lt('period_start', `${year + 1}-01-01`),
    supabase
      .from('v_lease_history')
      .select('lease_id, unit_references, tenant_name, trading_name, lease_state')
      .eq('asset_reference', assetReference),
  ])

  const leaseById = new Map((leaseInfo ?? []).map(l => [l.lease_id, l]))

  const rowsByLease = new Map<string, MatrixRow>()
  for (const c of charges ?? []) {
    const info = leaseById.get(c.lease_id)
    let row = rowsByLease.get(c.lease_id)
    if (!row) {
      row = {
        leaseId: c.lease_id,
        unitLabel: unitLabels(info?.unit_references ?? c.unit_reference),
        occupant: info?.trading_name ?? info?.tenant_name ?? c.tenant_name,
        ended: info?.lease_state === 'TERMINATED',
        monthlyRent: 0,
        cells: Array(12).fill(null) as (MatrixCell | null)[],
        yearReceived: 0,
      }
      rowsByLease.set(c.lease_id, row)
    }
    const m = new Date(c.period_start).getMonth()
    const billed = parseFloat(c.gross_amount ?? '0')
    const received = CANCELLED.has(c.status) ? 0 : parseFloat(c.payment_amount ?? '0')
    const cell = row.cells[m] ?? { billed: 0, received: 0, status: c.status }
    cell.billed += billed
    cell.received += received
    // A live charge takes precedence over a cancelled one in the same month
    if (!CANCELLED.has(c.status)) cell.status = c.status
    row.cells[m] = cell
    row.yearReceived += received
  }
  for (const row of rowsByLease.values()) {
    for (let m = 11; m >= 0; m--) {
      const cell = row.cells[m]
      if (cell && !CANCELLED.has(cell.status) && cell.billed > 0) { row.monthlyRent = cell.billed; break }
    }
  }

  const rows = Array.from(rowsByLease.values())
    .sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, undefined, { numeric: true }))

  const monthlyTotals = MONTHS.map((_, m) => rows.reduce((s, r) => s + (r.cells[m]?.received ?? 0), 0))
  const cumulative: number[] = []
  monthlyTotals.reduce((s, v, i) => { cumulative[i] = s + v; return s + v }, 0)
  const payerCounts = MONTHS.map((_, m) => rows.filter(r => (r.cells[m]?.received ?? 0) > 0).length)
  const rentRoll = rows.filter(r => !r.ended).reduce((s, r) => s + r.monthlyRent, 0)
  const yearReceived = rows.reduce((s, r) => s + r.yearReceived, 0)
  const yearBilled = rows.reduce((s, r) =>
    s + r.cells.reduce((cs, c) => cs + (c && !CANCELLED.has(c.status) ? c.billed : 0), 0), 0)

  return { assetName, year, rows, monthlyTotals, cumulative, payerCounts, rentRoll, yearBilled, yearReceived }
}

// ---------- Excel export ----------

const MONEY = '"£"#,##0.00'
const NAVY = 'FF1E293B'
const WHITE = 'FFFFFFFF'
// Classic Excel conditional-format palette, matching the page's colour language
const GREEN_FILL = 'FFC6EFCE'; const GREEN_FONT = 'FF006100'
const AMBER_FILL = 'FFFFEB9C'; const AMBER_FONT = 'FF9C6500'
const RED_FILL   = 'FFFFC7CE'; const RED_FONT   = 'FF9C0006'
const GREY_FONT  = 'FF94A3B8'

export async function buildRentCollectionWorkbook(data: RentCollectionData): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Opera'
  wb.created = new Date()
  const ws = wb.addWorksheet('Rent Collection', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 4 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
  })

  ws.columns = [
    { width: 16 }, { width: 30 }, { width: 11 },
    ...MONTHS.map(() => ({ width: 10.5 })),
    { width: 12 },
  ]

  const lastCol = 16 // A..P: Unit, Occupant, Rent, 12 months, Year
  ws.mergeCells(1, 1, 1, lastCol)
  ws.getCell(1, 1).value = `${data.assetName} — Rent Collection ${data.year}`
  ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: NAVY } }
  ws.mergeCells(2, 1, 2, lastCol)
  ws.getCell(2, 1).value =
    `Received against each month's invoice · Generated ${new Date().toLocaleString('en-GB')}`
  ws.getCell(2, 1).font = { size: 9, italic: true, color: { argb: GREY_FONT } }
  ws.getRow(3).height = 4

  const header = ['Unit', 'Occupant', 'Rent', ...MONTHS, 'Year']
  const hr = ws.getRow(4)
  header.forEach((h, i) => {
    const c = hr.getCell(i + 1)
    c.value = h
    c.font = { bold: true, color: { argb: WHITE }, size: 10 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle', horizontal: i < 2 ? 'left' : 'right' }
  })
  hr.height = 22

  let r = 5
  for (const row of data.rows) {
    const xr = ws.getRow(r)
    xr.getCell(1).value = row.unitLabel
    xr.getCell(2).value = row.occupant + (row.ended ? ' (ended)' : '')
    if (row.ended) xr.getCell(2).font = { color: { argb: AMBER_FONT } }
    xr.getCell(3).value = row.monthlyRent || null
    xr.getCell(3).numFmt = MONEY
    row.cells.forEach((cell, m) => {
      const c = xr.getCell(4 + m)
      if (!cell) { c.value = null; return }
      c.numFmt = MONEY
      if (isCancelled(cell.status)) {
        c.value = cell.billed
        c.font = { strike: true, color: { argb: GREY_FONT } }
      } else if (cell.status === 'DRAFT' || cell.status === 'APPROVED') {
        c.value = cell.billed
        c.font = { italic: true, color: { argb: GREY_FONT } }
      } else if (cell.received >= cell.billed && cell.billed > 0) {
        c.value = cell.received
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_FILL } }
        c.font = { color: { argb: GREEN_FONT } }
      } else if (cell.received > 0) {
        c.value = cell.received
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_FILL } }
        c.font = { color: { argb: AMBER_FONT } }
        c.note = `Received of £${cell.billed.toFixed(2)} billed`
      } else {
        c.value = 0
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_FILL } }
        c.font = { color: { argb: RED_FONT } }
      }
    })
    const yc = xr.getCell(16)
    yc.value = row.yearReceived
    yc.numFmt = MONEY
    yc.font = { bold: true }
    r++
  }

  const footer: [string, (number | null)[], boolean][] = [
    ['Received', data.monthlyTotals, true],
    ['Cumulative', data.cumulative, false],
    ['# Payers', data.payerCounts, false],
  ]
  for (const [label, values, bold] of footer) {
    const xr = ws.getRow(r)
    xr.getCell(1).value = label
    xr.getCell(1).font = { bold: true, size: 9, color: { argb: NAVY } }
    values.forEach((v, i) => {
      const c = xr.getCell(4 + i)
      c.value = v
      if (label !== '# Payers') c.numFmt = MONEY
      c.font = { bold, size: 9, color: { argb: NAVY } }
    })
    if (label === 'Received') {
      const yc = xr.getCell(16)
      yc.value = data.yearReceived
      yc.numFmt = MONEY
      yc.font = { bold: true, color: { argb: NAVY } }
      xr.eachCell(c => { c.border = { top: { style: 'medium', color: { argb: NAVY } } } })
    }
    r++
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}

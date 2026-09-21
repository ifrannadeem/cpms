import ExcelJS from 'exceljs'
import { shortDate, type OtherIncomeCollection } from './other-income'

/**
 * Excel export of the Other Income: Collection grid, laid out like the rent and electric
 * collection exports: sources down, the twelve months across, a year total, then the
 * monthly totals, running total and number of sources that paid.
 */

const MONEY = '"£"#,##0.00'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const NAVY = 'FF1E293B'
const LIGHT = 'FFF1F5F9'
const WHITE = 'FFFFFFFF'
const MUTED = 'FF475569'
const FAINT = 'FF94A3B8'
const RED_BG = 'FFFEE2E2'
const RED = 'FFB91C1C'
const GREEN = 'FF047857'

export function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function buildOtherIncomeCollectionWorkbook(
  assetName: string,
  grid: OtherIncomeCollection,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Opera'
  wb.created = new Date()
  const ws = wb.addWorksheet(`Other Income ${grid.year}`, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
  })

  const lastCol = 2 + 12 + 2 // source, payer, 12 months, year, of which VAT
  ws.columns = [{ width: 24 }, { width: 32 }, ...MONTHS.map(() => ({ width: 11 })), { width: 13 }, { width: 13 }]

  ws.mergeCells(1, 1, 1, lastCol)
  ws.getCell('A1').value = `${assetName}: Other Income Collection ${grid.year}`
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: NAVY } }
  ws.mergeCells(2, 1, 2, lastCol)
  ws.getCell('A2').value =
    'Money received for each month, in the month it belongs to. Red: a regular source paid nothing for a month now past.'
  ws.getCell('A2').font = { size: 9, italic: true, color: { argb: FAINT } }
  ws.mergeCells(3, 1, 3, lastCol)
  ws.getCell('A3').value = `Generated ${new Date().toLocaleString('en-GB')} from Opera.`
  ws.getCell('A3').font = { size: 9, italic: true, color: { argb: FAINT } }

  const head = ws.getRow(5)
  ;['Source', 'Payer', ...MONTHS, 'Year', 'of which VAT'].forEach((h, i) => {
    const c = head.getCell(i + 1)
    c.value = h
    c.font = { bold: true, color: { argb: WHITE }, size: 9 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { horizontal: i < 2 ? 'left' : 'right' }
  })
  head.height = 18

  let r = 6
  for (const row of grid.rows) {
    const xr = ws.getRow(r)
    xr.getCell(1).value = row.source + (row.recurring ? '' : ' (one-off)') + (row.active ? '' : ' (retired)')
    xr.getCell(2).value = row.payer || null
    row.cells.forEach((cell, i) => {
      const c = xr.getCell(3 + i)
      if (cell.state === 'received') {
        c.value = cell.gross
        c.numFmt = MONEY
        c.font = { color: { argb: GREEN } }
        c.note = `Received ${cell.receivedDates.map(shortDate).join(', ')}. Net ${cell.net.toFixed(2)}, VAT ${cell.vat.toFixed(2)}.`
      } else if (cell.state === 'missed') {
        c.value = 0
        c.numFmt = MONEY
        c.font = { color: { argb: RED } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_BG } }
      }
    })
    xr.getCell(15).value = row.yearGross
    xr.getCell(15).numFmt = MONEY
    xr.getCell(15).font = { bold: true, color: { argb: NAVY } }
    xr.getCell(16).value = row.yearVat
    xr.getCell(16).numFmt = MONEY
    xr.getCell(16).font = { color: { argb: MUTED } }
    r++
  }

  if (grid.rows.length === 0) {
    ws.mergeCells(r, 1, r, lastCol)
    ws.getCell(r, 1).value = `No other income recorded for ${grid.year}.`
    ws.getCell(r, 1).font = { italic: true, color: { argb: FAINT } }
    r++
  }

  const foot = (label: string, values: (number | null)[], total: number | null, fmt: string | null, bold: boolean) => {
    const xr = ws.getRow(r)
    xr.getCell(1).value = label
    values.forEach((v, i) => {
      const c = xr.getCell(3 + i)
      c.value = v || null
      if (fmt) c.numFmt = fmt
    })
    if (total != null) { xr.getCell(15).value = total; if (fmt) xr.getCell(15).numFmt = fmt }
    for (let c = 1; c <= lastCol; c++) {
      const cell = xr.getCell(c)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
      cell.font = { bold, color: { argb: bold ? NAVY : MUTED } }
    }
    r++
  }
  ws.getRow(r).getCell(1).border = { top: { style: 'thin', color: { argb: FAINT } } }
  foot('Received', grid.monthlyTotals, grid.yearGross, MONEY, true)
  foot('Cumulative', grid.cumulative, null, MONEY, false)
  foot('Sources paid', grid.payerCounts, null, '0', false)

  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

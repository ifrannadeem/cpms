import ExcelJS from 'exceljs'

const MONEY = '"£"#,##0.00'

const NAVY = 'FF1E293B'      // slate-800 header band
const LIGHT = 'FFF1F5F9'     // slate-100 subtotal band
const WHITE = 'FFFFFFFF'

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
  wb.creator = 'CPMS'
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

  // Title block
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

  // Header
  const headers = ['Unit', 'Tenant', 'Gross Rent Billed', 'Received This Month', 'Balance Outstanding']
  const hr = ws.getRow(5)
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1)
    c.value = h
    c.font = { bold: true, color: { argb: WHITE }, size: 10 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle', horizontal: i < 2 ? 'left' : 'right', wrapText: true }
    c.border = { bottom: { style: 'thin', color: { argb: NAVY } } }
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
    if (r % 2 === 1) {
      for (let c = 1; c <= 5; c++) xr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    }
    tGross += row.grossBilled; tRecv += row.received; tOut += row.outstanding
    r++
  }

  // Totals
  const tr = ws.getRow(r)
  tr.getCell(1).value = 'Total'
  tr.getCell(1).font = { bold: true }
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

  // Cash reconciliation note
  ws.mergeCells(`A${r}:E${r}`)
  ws.getCell(`A${r}`).value =
    `Total rent received in ${data.monthLabel} (all payments, incl. arrears): £${data.totalReceivedAll.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  ws.getCell(`A${r}`).font = { italic: true, size: 10, color: { argb: 'FF475569' } }

  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

// ---------- VAT by quarter (accrual + received memo) ----------

export interface VatRow {
  issued: string | null
  unit: string
  tenant: string
  type: string        // 'Rent' | 'Electric'
  net: number
  vat: number
  gross: number
  vatReceived: number
}

export interface VatData {
  assetName: string
  periodLabel: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  rows: VatRow[]
}

export async function buildVatWorkbook(data: VatData): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CPMS'
  wb.created = new Date()
  const ws = wb.addWorksheet('VAT Return', {
    views: [{ state: 'frozen', ySplit: 6 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
  })

  ws.columns = [
    { key: 'issued', width: 14 },
    { key: 'unit', width: 16 },
    { key: 'tenant', width: 30 },
    { key: 'type', width: 12 },
    { key: 'net', width: 14 },
    { key: 'vat', width: 14 },
    { key: 'gross', width: 14 },
    { key: 'vatrecv', width: 16 },
  ]

  ws.mergeCells('A1:H1')
  ws.getCell('A1').value = `${data.assetName} — VAT Report`
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: NAVY } }
  ws.mergeCells('A2:H2')
  ws.getCell('A2').value = `${data.periodLabel}  (${data.periodStart} to ${data.periodEnd})`
  ws.getCell('A2').font = { size: 12, color: { argb: 'FF475569' } }
  ws.mergeCells('A3:H3')
  ws.getCell('A3').value = 'Accrual basis — output VAT on invoices issued within the period. "VAT Received" is the VAT element of payments received against those invoices.'
  ws.getCell('A3').font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } }
  ws.mergeCells('A4:H4')
  ws.getCell('A4').value = `Generated ${data.generatedAt}`
  ws.getCell('A4').font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } }
  ws.getRow(5).height = 6

  const headers = ['Date Issued', 'Unit', 'Tenant', 'Type', 'Net', 'VAT', 'Gross', 'VAT Received']
  const hr = ws.getRow(6)
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1)
    c.value = h
    c.font = { bold: true, color: { argb: WHITE }, size: 10 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle', horizontal: i < 4 ? 'left' : 'right', wrapText: true }
  })
  hr.height = 26

  let r = 7
  let tNet = 0, tVat = 0, tGross = 0, tRecv = 0
  for (const row of data.rows) {
    const xr = ws.getRow(r)
    xr.getCell(1).value = row.issued ? new Date(row.issued).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    xr.getCell(2).value = row.unit
    xr.getCell(3).value = row.tenant
    xr.getCell(4).value = row.type
    xr.getCell(5).value = row.net
    xr.getCell(6).value = row.vat
    xr.getCell(7).value = row.gross
    xr.getCell(8).value = row.vatReceived
    for (let c = 5; c <= 8; c++) xr.getCell(c).numFmt = MONEY
    if (r % 2 === 1) {
      for (let c = 1; c <= 8; c++) xr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    }
    tNet += row.net; tVat += row.vat; tGross += row.gross; tRecv += row.vatReceived
    r++
  }

  if (data.rows.length === 0) {
    ws.mergeCells(`A${r}:H${r}`)
    ws.getCell(`A${r}`).value = 'No invoices issued in this period.'
    ws.getCell(`A${r}`).font = { italic: true, color: { argb: 'FF94A3B8' } }
    r++
  }

  const tr = ws.getRow(r)
  tr.getCell(1).value = 'Total'
  tr.getCell(5).value = tNet
  tr.getCell(6).value = tVat
  tr.getCell(7).value = tGross
  tr.getCell(8).value = tRecv
  for (let c = 1; c <= 8; c++) {
    const c2 = tr.getCell(c)
    c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
    c2.font = { bold: true, color: { argb: NAVY } }
    c2.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }
    if (c >= 5) c2.numFmt = MONEY
  }
  r += 2

  // Headline output VAT
  ws.mergeCells(`A${r}:D${r}`)
  ws.getCell(`A${r}`).value = 'Output VAT due for the period (Box 1)'
  ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: NAVY } }
  ws.getCell(`E${r}`).value = tVat
  ws.getCell(`E${r}`).numFmt = MONEY
  ws.getCell(`E${r}`).font = { bold: true, size: 12, color: { argb: NAVY } }

  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

import React from 'react'
import path from 'path'
import fs from 'fs'
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { InvoiceData } from './invoice-data'
import { fmtLongDate } from './invoice-data'

const POUND = String.fromCharCode(0xA3)

function gbp(n: number): string {
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function kwh(n: number): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 48, fontSize: 9.5, fontFamily: 'Helvetica', color: '#111' },

  // Letterhead
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 26 },
  logo: { maxWidth: 170, maxHeight: 58, objectFit: 'contain', objectPositionX: 0 },
  entityName: { fontSize: 15, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  headRight: { textAlign: 'right' },
  headLine: { marginBottom: 1.5 },
  bold: { fontFamily: 'Helvetica-Bold' },

  // Tenant address + invoice meta
  addrBlockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  tenantBox: { width: '50%' },
  addrLine: { marginBottom: 2.5 },
  metaTable: { width: '42%', borderWidth: 0.8, borderColor: '#333' },
  metaRow: { flexDirection: 'row', borderBottomWidth: 0.8, borderColor: '#333' },
  metaRowLast: { flexDirection: 'row' },
  metaLabel: { width: '36%', paddingVertical: 4, paddingHorizontal: 5, fontFamily: 'Helvetica-Bold', borderRightWidth: 0.8, borderColor: '#333' },
  metaValue: { width: '64%', paddingVertical: 4, paddingHorizontal: 5 },

  agentFor: { marginBottom: 16 },

  // Title + premises
  titleBar: { borderBottomWidth: 1, borderTopWidth: 1, borderColor: '#333', paddingVertical: 4.5, marginBottom: 12 },
  title: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  premRow: { flexDirection: 'row', marginBottom: 4 },
  premLabel: { width: 76, fontFamily: 'Helvetica-Bold' },

  // Line table
  table: { marginTop: 12, marginBottom: 16 },
  thRow: { flexDirection: 'row', borderBottomWidth: 0.8, borderColor: '#333', paddingBottom: 4, marginBottom: 6 },
  tr: { flexDirection: 'row', paddingVertical: 3 },
  cDate: { width: '16%' }, cDesc: { width: '36%' },
  cNet: { width: '14%', textAlign: 'right' }, cVatRate: { width: '10%', textAlign: 'right' },
  cVat: { width: '12%', textAlign: 'right' }, cTotal: { width: '12%', textAlign: 'right' },
  // No-VAT variant (Peartree)
  nDate: { width: '18%' }, nDesc: { width: '52%' }, nPaid: { width: '14%', textAlign: 'right' }, nDue: { width: '16%', textAlign: 'right' },

  totalsRow: { flexDirection: 'row', borderTopWidth: 0.8, borderColor: '#333', paddingTop: 5, marginTop: 2 },

  // Bank box
  bankBox: { borderWidth: 0.8, borderColor: '#333', padding: 8, marginTop: 14, marginBottom: 14 },
  bankTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  bankRow: { flexDirection: 'row' },
  bankCol1: { width: '44%' }, bankCol2: { width: '26%' }, bankCol3: { width: '30%' },

  note: { marginBottom: 14, color: '#333' },

  // Summary
  sumWrap: { flexDirection: 'row', justifyContent: 'flex-end' },
  sumBox: { width: 200, borderWidth: 0.8, borderColor: '#333' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.8, borderColor: '#333' },
  sumRowLast: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 6 },
  sumTotal: { fontFamily: 'Helvetica-Bold' },

  // Electric
  ebTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', borderBottomWidth: 1, borderTopWidth: 1, borderColor: '#333', paddingVertical: 4.5, marginBottom: 12 },
  ebReadHead: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.8, borderColor: '#333', paddingBottom: 3, marginBottom: 5 },
  ebRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5 },
  ebCalcRow: { flexDirection: 'row', paddingVertical: 2.5 },
  ebCalcLabel: { width: '34%', fontFamily: 'Helvetica-Bold' },
  ebCalcMid: { width: '18%' }, ebCalcUnit: { width: '22%' }, ebCalcVal: { width: '26%', textAlign: 'right' },
})

function loadLogo(logoPath: string | null): Buffer | null {
  if (!logoPath) return null
  try {
    const file = path.join(process.cwd(), 'public', ...logoPath.split('/').filter(Boolean))
    return fs.readFileSync(file)
  } catch {
    return null
  }
}

function Letterhead({ inv }: { inv: InvoiceData }) {
  const e = inv.entity
  const logo = loadLogo(e.logo_path)
  return (
    <View style={s.headerRow}>
      <View style={{ width: '46%' }}>
        {logo
          ? <Image src={logo} style={s.logo} />
          : <Text style={s.entityName}>{e.entity_name.toUpperCase()}</Text>}
      </View>
      <View style={s.headRight}>
        <Text style={[s.bold, s.headLine]}>{e.entity_name}</Text>
        {(e.address_lines ?? []).map((l, i) => <Text key={i} style={s.headLine}>{l}</Text>)}
        {e.company_number ? <Text style={[s.headLine, { marginTop: 5 }]}>Company number: {e.company_number}</Text> : null}
        {e.vat_number ? <Text style={e.company_number ? s.headLine : [s.headLine, { marginTop: 5 }]}>VAT Number: {e.vat_number}</Text> : null}
        {e.phone ? <Text style={[s.bold, s.headLine, { marginTop: 5 }]}>Tel: {e.phone}</Text> : null}
        {e.email ? <Text style={[s.bold, s.headLine]}>{e.email}</Text> : null}
      </View>
    </View>
  )
}

function AddressAndMeta({ inv }: { inv: InvoiceData }) {
  return (
    <View style={s.addrBlockRow}>
      <View style={s.tenantBox}>
        <Text style={[s.bold, s.addrLine]}>{inv.tenantName}</Text>
        {inv.tenantAddress.map((l, i) => <Text key={i} style={s.addrLine}>{l}</Text>)}
      </View>
      <View style={s.metaTable}>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>Invoice Date</Text>
          <Text style={s.metaValue}>{fmtLongDate(inv.invoiceDate)}</Text>
        </View>
        <View style={s.metaRowLast}>
          <Text style={s.metaLabel}>Reference</Text>
          <Text style={s.metaValue}>{inv.reference}</Text>
        </View>
      </View>
    </View>
  )
}

function BankBox({ inv }: { inv: InvoiceData }) {
  const e = inv.entity
  return (
    <View style={s.bankBox}>
      <Text style={s.bankTitle}>Bank Details for Payment:</Text>
      <View style={s.bankRow}>
        <Text style={[s.bankCol1, s.bold]}>Please Make Payments to:</Text>
        <Text style={[s.bankCol2, s.bold]}>Sort Code:</Text>
        <Text style={[s.bankCol3, s.bold]}>Account number</Text>
      </View>
      <View style={[s.bankRow, { marginTop: 4 }]}>
        <Text style={s.bankCol1}>{e.bank_account_name}</Text>
        <Text style={s.bankCol2}>{e.bank_sort_code}</Text>
        <Text style={s.bankCol3}>{e.bank_account_number}</Text>
      </View>
      {e.bank_name ? <Text style={{ marginTop: 4, color: '#444' }}>Bank: {e.bank_name}</Text> : null}
    </View>
  )
}

function vatRateLabel(inv: InvoiceData): string {
  if (inv.vatTreatment === 'EXEMPT') return 'Exempt'
  if (inv.vatTreatment === 'OUTSIDE_SCOPE') return 'N/A'
  if (inv.vatTreatment === 'ZERO_RATED') return '0%'
  return '20%'
}

function RentPage({ inv }: { inv: InvoiceData }) {
  // VAT breakdown only where the tenant is actually charged VAT
  const vatRegistered = !!inv.entity.vat_number && inv.vatTreatment === 'STANDARD' && inv.vatAmount > 0
  return (
    <Page size="A4" style={s.page}>
      <Letterhead inv={inv} />
      <AddressAndMeta inv={inv} />
      {inv.entity.agent_for ? (
        <View style={s.agentFor}>
          <Text style={[s.bold, { marginBottom: 1.5 }]}>Acting as agents for:</Text>
          <Text>{inv.entity.agent_for}</Text>
        </View>
      ) : null}
      <View style={s.titleBar}>
        <Text style={s.title}>Rent Invoice</Text>
      </View>
      <View style={s.premRow}>
        <Text style={s.premLabel}>Premises:</Text>
        <Text style={{ flex: 1 }}>{inv.premisesLabel}, {inv.premisesAddress}</Text>
      </View>
      <View style={s.premRow}>
        <Text style={s.premLabel}>Period:</Text>
        <Text style={{ flex: 1 }}>{fmtLongDate(inv.periodStart)} to {fmtLongDate(inv.periodEnd)}</Text>
      </View>

      {vatRegistered ? (
        <View style={s.table}>
          <View style={s.thRow}>
            <Text style={[s.cDate, s.bold]}>Date</Text>
            <Text style={[s.cDesc, s.bold]}>Description</Text>
            <Text style={[s.cNet, s.bold]}>Net</Text>
            <Text style={[s.cVatRate, s.bold]}>VAT Rate</Text>
            <Text style={[s.cVat, s.bold]}>VAT</Text>
            <Text style={[s.cTotal, s.bold]}>Total</Text>
          </View>
          <View style={s.tr}>
            <Text style={s.cDate}>{fmtLongDate(inv.invoiceDate)}</Text>
            <Text style={s.cDesc}>{inv.description}</Text>
            <Text style={s.cNet}>{gbp(inv.netAmount)}</Text>
            <Text style={s.cVatRate}>{vatRateLabel(inv)}</Text>
            <Text style={s.cVat}>{gbp(inv.vatAmount)}</Text>
            <Text style={s.cTotal}>{gbp(inv.grossAmount)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={[s.cDate]}></Text>
            <Text style={[s.cDesc, s.bold]}>Total</Text>
            <Text style={[s.cNet, s.bold]}>{gbp(inv.netAmount)}</Text>
            <Text style={s.cVatRate}></Text>
            <Text style={[s.cVat, s.bold]}>{gbp(inv.vatAmount)}</Text>
            <Text style={[s.cTotal, s.bold]}>{gbp(inv.grossAmount)}</Text>
          </View>
        </View>
      ) : (
        <View style={s.table}>
          <View style={s.thRow}>
            <Text style={[s.nDate, s.bold]}>Date</Text>
            <Text style={[s.nDesc, s.bold]}>Description</Text>
            <Text style={[s.nPaid, s.bold]}>Paid</Text>
            <Text style={[s.nDue, s.bold]}>Amount Due</Text>
          </View>
          <View style={s.tr}>
            <Text style={s.nDate}>{fmtLongDate(inv.invoiceDate)}</Text>
            <Text style={s.nDesc}>{inv.description}</Text>
            <Text style={s.nPaid}>{gbp(inv.paidAmount)}</Text>
            <Text style={s.nDue}>{gbp(inv.amountDue)}</Text>
          </View>
        </View>
      )}

      <BankBox inv={inv} />

      <Text style={s.note}>Payment is due on the first day of the month.</Text>

      <View style={s.sumWrap}>
        <View style={s.sumBox}>
          <View style={s.sumRow}><Text>Invoiced</Text><Text>{gbp(inv.grossAmount)}</Text></View>
          <View style={s.sumRow}><Text>Paid</Text><Text>{gbp(inv.paidAmount)}</Text></View>
          <View style={s.sumRowLast}>
            <Text style={s.sumTotal}>Amount Due</Text>
            <Text style={s.sumTotal}>{gbp(inv.amountDue)}</Text>
          </View>
        </View>
      </View>
    </Page>
  )
}

function ElectricPage({ inv }: { inv: InvoiceData }) {
  const e = inv.electric
  return (
    <Page size="A4" style={s.page}>
      <Letterhead inv={inv} />
      <AddressAndMeta inv={inv} />
      <Text style={s.ebTitle}>Electricity Bill</Text>
      <Text style={{ marginBottom: 14 }}>
        Period: {fmtLongDate(inv.periodStart)} to {fmtLongDate(inv.periodEnd)}
      </Text>

      {e ? (
        <View style={{ marginBottom: 16 }}>
          <View style={s.ebReadHead}>
            <Text style={s.bold}>Date</Text>
            <Text style={s.bold}>Meter Reading (kWh)</Text>
          </View>
          <View style={s.ebRow}>
            <Text>{fmtLongDate(e.openDate)}</Text>
            <Text>{kwh(e.openReading)}</Text>
          </View>
          <View style={s.ebRow}>
            <Text>{fmtLongDate(e.closeDate)}</Text>
            <Text>{kwh(e.closeReading)}</Text>
          </View>
          <View style={[s.ebRow, { marginTop: 8 }]}>
            <Text style={s.bold}>Total Units Consumed During Period</Text>
            <Text>{kwh(e.consumption)}</Text>
          </View>
          <View style={[s.ebCalcRow, { marginTop: 10 }]}>
            <Text style={s.ebCalcLabel}>Cost per unit</Text>
            <Text style={s.ebCalcMid}>{POUND}{e.ratePerKwh}</Text>
            <Text style={s.ebCalcUnit}>p/kWh</Text>
            <Text style={s.ebCalcVal}>{gbp(inv.netAmount)}</Text>
          </View>
          <View style={s.ebCalcRow}>
            <Text style={s.ebCalcLabel}>VAT</Text>
            <Text style={s.ebCalcMid}>20%</Text>
            <Text style={s.ebCalcUnit}></Text>
            <Text style={s.ebCalcVal}>{gbp(inv.vatAmount)}</Text>
          </View>
          <View style={s.ebCalcRow}>
            <Text style={s.ebCalcLabel}></Text>
            <Text style={s.ebCalcMid}></Text>
            <Text style={[s.ebCalcUnit, s.bold]}>Total</Text>
            <Text style={[s.ebCalcVal, s.bold]}>{gbp(inv.grossAmount)}</Text>
          </View>
        </View>
      ) : (
        <Text style={{ marginBottom: 16 }}>{inv.description}</Text>
      )}

      <BankBox inv={inv} />

      <View style={s.sumWrap}>
        <View style={s.sumBox}>
          <View style={s.sumRow}><Text>Electric</Text><Text>{gbp(inv.netAmount)}</Text></View>
          <View style={s.sumRow}><Text>VAT</Text><Text>{gbp(inv.vatAmount)}</Text></View>
          <View style={s.sumRowLast}>
            <Text style={s.sumTotal}>Total</Text>
            <Text style={s.sumTotal}>{gbp(inv.grossAmount)}</Text>
          </View>
        </View>
      </View>
    </Page>
  )
}

export async function renderInvoicesPdf(invoices: InvoiceData[]): Promise<Buffer> {
  const doc = (
    <Document>
      {invoices.map((inv, i) =>
        inv.kind === 'ELECTRIC'
          ? <ElectricPage key={i} inv={inv} />
          : <RentPage key={i} inv={inv} />
      )}
    </Document>
  )
  return await renderToBuffer(doc)
}

import { describe, expect, it } from 'vitest'
import {
  buildReference,
  invoiceFileName,
  premisesLabel,
  unitCode,
  type InvoiceData,
} from '../lib/invoice-data'

// These functions define the identity of legal documents (invoice references and
// filenames). The expectations below pin the CURRENT production behaviour so any
// future change to them is a deliberate, reviewed decision.

describe('unitCode', () => {
  it('renders a single numeric unit with leading zeros stripped', () => {
    expect(unitCode(['RBC-001-029'])).toBe('U29')
  })

  it('keeps alpha suffixes', () => {
    expect(unitCode(['RBC-A-13A'])).toBe('U13A')
  })

  it('joins a multi-unit lease as a first-last range in natural order', () => {
    expect(unitCode(['RBC-001-010', 'RBC-001-011'])).toBe('U10-11')
    expect(unitCode(['RBC-001-011', 'RBC-001-010'])).toBe('U10-11')
  })

  it('uses the Southgate suite scheme for SGP-I units', () => {
    expect(unitCode(['SGP-I-1.5'])).toBe('U8S1.5')
    expect(unitCode(['SGP-I-1.1', 'SGP-I-1.4'])).toBe('U8S1.1-1.4')
  })

  it('falls back to U? when no units are linked', () => {
    expect(unitCode([])).toBe('U?')
  })
})

describe('premisesLabel', () => {
  it('labels single and multiple ordinary units', () => {
    expect(premisesLabel(['RBC-001-029'])).toBe('Unit 29')
    expect(premisesLabel(['RBC-001-010', 'RBC-001-011'])).toBe('Units 10 - 11')
  })

  it('labels Southgate suites', () => {
    expect(premisesLabel(['SGP-I-1.5'])).toBe('Suite 1.5')
    expect(premisesLabel(['SGP-I-1.1', 'SGP-I-1.4'])).toBe('Suites 1.1 - 1.4')
  })
})

describe('buildReference', () => {
  it('anchors rent to the period_start month', () => {
    expect(buildReference('RENT', '2026-06-01', '2026-06-30', ['RBC-001-012'])).toBe('R2606-U12')
  })

  it('anchors electric to the period_end month', () => {
    expect(buildReference('ELECTRIC', '2026-05-15', '2026-06-14', ['RBC-001-012'])).toBe('2606E-U12')
  })
})

describe('invoiceFileName', () => {
  const base = {
    invoiceDate: '2026-07-01',
    dueDate: '2026-07-01',
    tenantId: 't1',
    entity: {} as InvoiceData['entity'],
    tenantAddress: [],
    premisesAddress: '',
    description: '',
    vatTreatment: 'EXEMPT',
    netAmount: 0,
    vatAmount: 0,
    grossAmount: 0,
    paidAmount: 0,
    amountDue: 0,
    reference: 'R2607-U12',
  }

  it('names rent invoices by period_start month', () => {
    const inv: InvoiceData = {
      ...base,
      kind: 'RENT',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      premisesLabel: 'Unit 12',
      tenantName: 'Idris Rehman',
    }
    expect(invoiceFileName(inv)).toBe('2607. Invoice - Rent - Unit 12 Idris Rehman.pdf')
  })

  it('names electric invoices by period_end month', () => {
    const inv: InvoiceData = {
      ...base,
      kind: 'ELECTRIC',
      periodStart: '2026-05-15',
      periodEnd: '2026-06-14',
      premisesLabel: 'Unit 12',
      tenantName: 'Idris Rehman',
    }
    expect(invoiceFileName(inv)).toBe('2606. Invoice - Electric - Unit 12 Idris Rehman.pdf')
  })

  it('strips characters that are illegal in Windows filenames', () => {
    const inv: InvoiceData = {
      ...base,
      kind: 'RENT',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      premisesLabel: 'Unit 12',
      tenantName: 'A/B: Traders <Ltd>',
    }
    expect(invoiceFileName(inv)).toBe('2607. Invoice - Rent - Unit 12 A B Traders Ltd.pdf')
  })
})

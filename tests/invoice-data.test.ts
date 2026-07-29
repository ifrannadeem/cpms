import { describe, expect, it } from 'vitest'
import {
  buildReference,
  concessionFor,
  invoiceFileName,
  premisesLabel,
  unitCode,
  type IncentiveRow,
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
    expect(buildReference('RENT', '2026-06-01', '2026-06-30', ['RBC-001-012'])).toBe('R2606-RBC-U12')
  })

  it('anchors electric to the period_end month', () => {
    expect(buildReference('ELECTRIC', '2026-05-15', '2026-06-14', ['RBC-001-012'])).toBe('2606E-RBC-U12')
  })

  it('keeps the same unit number distinct across properties', () => {
    const rosehill = buildReference('RENT', '2026-09-01', '2026-09-30', ['RBC-A-10'])
    const peartree = buildReference('RENT', '2026-09-01', '2026-09-30', ['PTP-10'])
    expect(rosehill).toBe('R2609-RBC-U10')
    expect(peartree).toBe('R2609-PTP-U10')
    expect(rosehill).not.toBe(peartree)
  })

  it('carries the property code on Southgate suites too', () => {
    expect(buildReference('RENT', '2026-09-01', '2026-09-30', ['SGP-I-1.5'])).toBe('R2609-SGP-U8S1.5')
  })
})

describe('concessionFor', () => {
  // Workshop 4: £450 headline, £100 concession to 31 Jul 2027, billed £350 + VAT
  const discount: IncentiveRow = {
    incentive_type: 'FIXED_DISCOUNT',
    discount_amount_monthly: 100,
    billed_amount_monthly: 350,
    incentive_end_date: '2027-07-31',
  }

  it('shows headline less concession on a full discounted month', () => {
    const c = concessionFor('2026-09-01', 350, 70, 420, 0.2, discount)
    expect(c).toEqual({
      headlineNet: 450, headlineVat: 90, headlineGross: 540,
      discountNet: 100, discountVat: 20, discountGross: 120,
      endDate: '2027-07-31',
    })
  })

  it('is held back before the September 2026 run', () => {
    expect(concessionFor('2026-08-01', 350, 70, 420, 0.2, discount)).toBeUndefined()
  })

  it('stays off a part month, where the two lines would not add up', () => {
    // pro-rata month: net no longer equals the discounted monthly figure
    expect(concessionFor('2026-09-01', 175, 35, 210, 0.2, discount)).toBeUndefined()
  })

  it('stays off rent-free months', () => {
    const rentFree: IncentiveRow = {
      incentive_type: 'RENT_FREE', discount_amount_monthly: 450,
      billed_amount_monthly: 0, incentive_end_date: '2026-12-31',
    }
    expect(concessionFor('2026-09-01', 0, 0, 0, 0.2, rentFree)).toBeUndefined()
  })

  it('handles a non-VAT concession', () => {
    const c = concessionFor('2026-09-01', 375, 0, 375, 0, {
      incentive_type: 'FIXED_DISCOUNT', discount_amount_monthly: 25,
      billed_amount_monthly: 375, incentive_end_date: '2027-03-31',
    })
    expect(c?.headlineGross).toBe(400)
    expect(c?.discountVat).toBe(0)
  })

  it('is absent when there is no concession', () => {
    expect(concessionFor('2026-09-01', 450, 90, 540, 0.2, undefined)).toBeUndefined()
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
      tenantLegalName: 'Idris Rehman',
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
      tenantLegalName: 'Idris Rehman',
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
      tenantLegalName: 'A/B: Traders <Ltd>',
    }
    expect(invoiceFileName(inv)).toBe('2607. Invoice - Rent - Unit 12 A B Traders Ltd.pdf')
  })

  it('names the file after the legal entity, never the brand', () => {
    const inv: InvoiceData = {
      ...base,
      kind: 'RENT',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      premisesLabel: 'Unit A',
      tenantName: 'Juices 4 Life',      // brand, shown on screens
      tenantLegalName: 'Apex UK1 Ltd',  // party liable, shown on the invoice
    }
    expect(invoiceFileName(inv)).toBe('2608. Invoice - Rent - Unit A Apex UK1 Ltd.pdf')
    expect(invoiceFileName(inv)).not.toContain('Juices')
  })
})

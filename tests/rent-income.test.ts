import { describe, expect, it } from 'vitest'
import { buildMonthlyRentRows, occupiesMonth, type RentIncomeInput } from '../lib/rent-income'

// Built from the two cases reported on 21 September 2026, where the ledger was right and
// the report put money in the month it arrived instead of the month it paid for.

const JULY = { monthStart: '2026-07-01', monthEnd: '2026-07-31' }
const AUG = { monthStart: '2026-08-01', monthEnd: '2026-08-31' }

function base(over: Partial<RentIncomeInput> = {}): RentIncomeInput {
  return {
    ...AUG,
    units: [],
    leases: [],
    leaseUnits: [],
    tenantName: id => ({ t1: 'Idrak AI Limited', t2: 'Al-Hurraya', t3: 'Ambitions Personnel', t4: 'Fosse Healthcare' } as Record<string, string>)[id] ?? id,
    charges: [],
    allocations: [],
    ...over,
  }
}

describe('occupiesMonth', () => {
  it('counts a tenancy that started mid-month', () => {
    expect(occupiesMonth({ commencement_date: '2026-08-15', termination_date: null }, AUG.monthStart, AUG.monthEnd)).toBe(true)
  })
  it('counts a tenancy that ended mid-month', () => {
    expect(occupiesMonth({ commencement_date: '2025-08-18', termination_date: '2026-08-17' }, AUG.monthStart, AUG.monthEnd)).toBe(true)
  })
  it('excludes one that had not started', () => {
    expect(occupiesMonth({ commencement_date: '2026-09-01', termination_date: null }, AUG.monthStart, AUG.monthEnd)).toBe(false)
  })
  it('excludes one that ended before the month', () => {
    expect(occupiesMonth({ commencement_date: '2024-04-15', termination_date: '2026-06-30' }, AUG.monthStart, AUG.monthEnd)).toBe(false)
  })
})

describe('buildMonthlyRentRows', () => {
  // Idrak: July rent paid 10 August, August rent paid 21 August. Each payment is allocated
  // to its own month's invoice, so each month shows its own receipt.
  const idrak = {
    units: [{ unit_id: 'u16', unit_reference: 'SGP-I-1.6' }],
    leases: [{ lease_id: 'L16', tenant_id: 't1', commencement_date: '2023-09-29', termination_date: null }],
    leaseUnits: [{ lease_id: 'L16', unit_id: 'u16' }],
  }

  it('credits July with July rent even though it was paid in August', () => {
    const rows = buildMonthlyRentRows(base({
      ...JULY, ...idrak,
      charges: [{ charge_id: 'jul', lease_id: 'L16', gross_amount: 540 }],
      allocations: [{ charge_id: 'jul', allocated_amount: 540 }],
    }))
    expect(rows).toEqual([{ unit: 'Suite 1.6', tenant: 'Idrak AI Limited', grossBilled: 540, received: 540, outstanding: 0, vacant: false }])
  })

  it('credits August with August rent only, not the whole £1,080 banked that month', () => {
    const rows = buildMonthlyRentRows(base({
      ...AUG, ...idrak,
      charges: [{ charge_id: 'aug', lease_id: 'L16', gross_amount: 540 }],
      allocations: [{ charge_id: 'aug', allocated_amount: 540 }],
    }))
    expect(rows[0].received).toBe(540)
  })

  // Al-Hurraya: three leases, each its own row, each showing only what paid its August rent.
  it('keeps a tenant with several leases on separate rows with their own receipts', () => {
    const rows = buildMonthlyRentRows(base({
      units: [
        { unit_id: 'u24', unit_reference: 'SGP-I-2.4' },
        { unit_id: 'u25', unit_reference: 'SGP-I-2.5' },
        { unit_id: 'u26', unit_reference: 'SGP-I-2.6' },
        { unit_id: 'u27', unit_reference: 'SGP-I-2.7' },
      ],
      leases: [
        { lease_id: 'L24', tenant_id: 't2', commencement_date: '2026-02-01', termination_date: null },
        { lease_id: 'L25', tenant_id: 't2', commencement_date: '2026-08-15', termination_date: null },
        { lease_id: 'L27', tenant_id: 't2', commencement_date: '2026-08-15', termination_date: null },
      ],
      leaseUnits: [
        { lease_id: 'L24', unit_id: 'u24' },
        { lease_id: 'L25', unit_id: 'u25' }, { lease_id: 'L25', unit_id: 'u26' },
        { lease_id: 'L27', unit_id: 'u27' },
      ],
      charges: [
        { charge_id: 'c24', lease_id: 'L24', gross_amount: 625 },
        { charge_id: 'c25', lease_id: 'L25', gross_amount: 356.45 },
        { charge_id: 'c27', lease_id: 'L27', gross_amount: 246.77 },
      ],
      allocations: [
        { charge_id: 'c24', allocated_amount: 625 },
        { charge_id: 'c25', allocated_amount: 356.45 },
        { charge_id: 'c27', allocated_amount: 246.77 },
      ],
    }))
    expect(rows.map(r => [r.unit, r.received])).toEqual([
      ['Suite 2.4', 625],
      ['Suite 2.5, 2.6', 356.45],
      ['Suite 2.7', 246.77],
    ])
  })

  it('shows an empty unit as Vacant at nil', () => {
    const rows = buildMonthlyRentRows(base({ units: [{ unit_id: 'u21', unit_reference: 'SGP-I-2.1' }] }))
    expect(rows).toEqual([{ unit: 'Suite 2.1', tenant: 'Vacant', grossBilled: 0, received: 0, outstanding: 0, vacant: true }])
  })

  it('distinguishes unpaid from vacant: a let unit owing rent is not vacant', () => {
    const rows = buildMonthlyRentRows(base({
      ...idrak,
      charges: [{ charge_id: 'aug', lease_id: 'L16', gross_amount: 540 }],
    }))
    expect(rows[0]).toMatchObject({ tenant: 'Idrak AI Limited', received: 0, outstanding: 540, vacant: false })
  })

  it('shows both tenancies when a unit changed hands mid-month', () => {
    const rows = buildMonthlyRentRows(base({
      units: [{ unit_id: 'u27', unit_reference: 'SGP-I-2.7' }],
      leases: [
        { lease_id: 'OLD', tenant_id: 't3', commencement_date: '2025-08-18', termination_date: '2026-08-17' },
        { lease_id: 'NEW', tenant_id: 't2', commencement_date: '2026-08-15', termination_date: null },
      ],
      leaseUnits: [{ lease_id: 'OLD', unit_id: 'u27' }, { lease_id: 'NEW', unit_id: 'u27' }],
    }))
    expect(rows.map(r => r.tenant)).toEqual(['Ambitions Personnel', 'Al-Hurraya'])
    expect(rows.some(r => r.vacant)).toBe(false)
  })

  it('gathers a multi-unit tenancy onto one row and leaves none of its units vacant', () => {
    const rows = buildMonthlyRentRows(base({
      units: ['1.1', '1.2', '1.3', '1.4'].map(s => ({ unit_id: s, unit_reference: `SGP-I-${s}` })),
      leases: [{ lease_id: 'F', tenant_id: 't4', commencement_date: '2023-11-16', termination_date: null }],
      leaseUnits: ['1.1', '1.2', '1.3', '1.4'].map(s => ({ lease_id: 'F', unit_id: s })),
    }))
    expect(rows).toHaveLength(1)
    expect(rows[0].unit).toBe('Suite 1.1, 1.2, 1.3, 1.4')
  })

  it('never drops a billed charge, even if the lease dates say it was not in occupation', () => {
    const rows = buildMonthlyRentRows(base({
      ...idrak,
      leases: [{ lease_id: 'L16', tenant_id: 't1', commencement_date: '2026-09-01', termination_date: null }],
      charges: [{ charge_id: 'aug', lease_id: 'L16', gross_amount: 540 }],
    }))
    expect(rows[0]).toMatchObject({ grossBilled: 540, vacant: false })
  })

  // Maher held Units 4 and 5 as the combined unit RBC-A-4-5 until 31 July 2026, then took
  // them on separate leases. July must show Maher in 4 and 5, not the units as empty.
  it('treats a tenancy of a combined unit as occupying the units later split from it', () => {
    const rows = buildMonthlyRentRows(base({
      ...JULY,
      units: [
        { unit_id: 'u45', unit_reference: 'RBC-A-4-5', active: false },
        { unit_id: 'u4', unit_reference: 'RBC-A-4', split_from_unit_id: 'u45' },
        { unit_id: 'u5', unit_reference: 'RBC-A-5', split_from_unit_id: 'u45' },
      ],
      leases: [{ lease_id: 'M', tenant_id: 'maher', commencement_date: '2017-04-01', termination_date: '2026-07-31' }],
      leaseUnits: [{ lease_id: 'M', unit_id: 'u45' }],
      tenantName: () => 'Maher Restaurant',
      charges: [{ charge_id: 'jul', lease_id: 'M', gross_amount: 350 }],
    }))
    expect(rows).toEqual([
      { unit: 'Unit 4-5', tenant: 'Maher Restaurant', grossBilled: 350, received: 0, outstanding: 350, vacant: false },
    ])
  })

  it('never reports a retired unit as vacant', () => {
    const rows = buildMonthlyRentRows(base({ units: [{ unit_id: 'old', unit_reference: 'RBC-A-4-5', active: false }] }))
    expect(rows).toEqual([])
  })

  it('shows a part payment as part received with the balance outstanding', () => {
    const rows = buildMonthlyRentRows(base({
      ...idrak,
      charges: [{ charge_id: 'aug', lease_id: 'L16', gross_amount: 540 }],
      allocations: [{ charge_id: 'aug', allocated_amount: 200 }],
    }))
    expect(rows[0]).toMatchObject({ received: 200, outstanding: 340 })
  })
})

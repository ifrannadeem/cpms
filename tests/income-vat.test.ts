import { describe, expect, it } from 'vitest'
import { monthRange, emptyCell } from '../lib/income-vat'

// The month range drives the columns of a report that goes to the accountant, so an
// off-by-one here is an off-by-one in a VAT figure.

describe('monthRange', () => {
  it('includes both ends', () => {
    expect(monthRange('2026-07', '2026-09').map(m => m.key)).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('handles a single month', () => {
    expect(monthRange('2026-07', '2026-07').map(m => m.key)).toEqual(['2026-07'])
  })

  it('crosses a year end', () => {
    expect(monthRange('2026-11', '2027-02').map(m => m.key)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })

  it('labels months in British form', () => {
    expect(monthRange('2026-07', '2026-07')[0].label).toBe('Jul 2026')
  })

  it('returns nothing when the range runs backwards, rather than spinning', () => {
    expect(monthRange('2026-09', '2026-07')).toEqual([])
  })

  it('returns nothing for a malformed month', () => {
    expect(monthRange('', '2026-09')).toEqual([])
  })

  it('covers a full year as twelve columns', () => {
    expect(monthRange('2026-01', '2026-12')).toHaveLength(12)
  })
})

describe('emptyCell', () => {
  it('starts every measure at zero, so a tenant with no charge in a month reads nil not blank-as-error', () => {
    expect(emptyCell()).toEqual({
      netInvoiced: 0, vatInvoiced: 0, grossInvoiced: 0,
      netReceived: 0, vatReceived: 0, grossReceived: 0,
    })
  })
})

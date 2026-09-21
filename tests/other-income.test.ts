import { describe, expect, it } from 'vitest'
import {
  otherIncomeBySource,
  otherIncomeLinesForMonth,
  type OtherIncomeReceipt,
  type OtherIncomeSource,
} from '../lib/other-income'

// Southgate's own sources and a slice of the history loaded on 21 September 2026.

const EV: OtherIncomeSource = { source_id: 'ev', name: 'EV chargers', payer: 'Swarco Smart Charging Ltd', recurring: true, active: true }
const MAX: OtherIncomeSource = { source_id: 'max', name: 'Unit 7 parking bays', payer: 'Maximus UK Services Ltd', recurring: true, active: true }
const VCS: OtherIncomeSource = { source_id: 'vcs', name: 'Car park', payer: 'Vehicle Control Services Limited', recurring: true, active: true }
const ONE: OtherIncomeSource = { source_id: 'one', name: 'Other (one-off)', payer: null, recurring: false, active: true }
const SOURCES = [EV, MAX, VCS, ONE]

let n = 0
function rec(source_id: string, month: string, received: string, gross: number, vat = 0, description: string | null = null): OtherIncomeReceipt {
  return {
    receipt_id: `r${++n}`, source_id, period_month: `${month}-01`, received_date: received,
    net: Math.round((gross - vat) * 100) / 100, vat, gross, description,
  }
}

const HISTORY: OtherIncomeReceipt[] = [
  rec('ev', '2026-01', '2026-02-05', 530, 88.33),
  rec('ev', '2026-02', '2026-02-05', 530, 88.33),
  rec('ev', '2026-03', '2026-02-05', 530, 88.34),
  rec('max', '2026-01', '2026-01-23', 384, 64),
  rec('max', '2026-02', '2026-03-27', 384, 64),
  // Maximus: nothing for March
  rec('max', '2026-04', '2026-05-01', 384, 64),
  rec('vcs', '2026-03', '2026-04-23', 1080),
  rec('vcs', '2026-08', '2026-08-25', 160),
]

describe('otherIncomeLinesForMonth', () => {
  it('shows a recurring source that did not pay at nil, rather than leaving it out', () => {
    const march = otherIncomeLinesForMonth('2026-03', SOURCES, HISTORY)
    const maximus = march.find(l => l.source === 'Unit 7 parking bays')
    expect(maximus).toMatchObject({ gross: 0, nil: true, received: 'Nothing received' })
  })

  it('gives each recurring source exactly one line, with what it received', () => {
    const march = otherIncomeLinesForMonth('2026-03', SOURCES, HISTORY)
    expect(march.map(l => [l.source, l.gross])).toEqual([
      ['Car park', 1080],
      ['EV chargers', 530],
      ['Unit 7 parking bays', 0],
    ])
  })

  it('adds together two receipts for the same source in the same month', () => {
    const lines = otherIncomeLinesForMonth('2026-08', SOURCES, [
      ...HISTORY,
      rec('vcs', '2026-08', '2026-09-30', 784), // the August balance, when it arrives
    ])
    const carPark = lines.find(l => l.source === 'Car park')
    expect(carPark).toMatchObject({ gross: 944, received: 'Received 25 Aug 2026, 30 Sept 2026' })
  })

  it('does not show nil lines for months before a source first received anything', () => {
    // The car park's first receipt here is March, so February has no car park line at all.
    const feb = otherIncomeLinesForMonth('2026-02', SOURCES, HISTORY)
    expect(feb.map(l => l.source)).not.toContain('Car park')
  })

  it('stops the nil lines once a source is retired, but keeps months it actually received', () => {
    const retired = [{ ...MAX, active: false }, EV, VCS]
    expect(otherIncomeLinesForMonth('2026-03', retired, HISTORY).map(l => l.source)).not.toContain('Unit 7 parking bays')
    expect(otherIncomeLinesForMonth('2026-04', retired, HISTORY).find(l => l.source === 'Unit 7 parking bays')?.gross).toBe(384)
  })

  it('itemises one-off income with its own description, and omits it in months without any', () => {
    const withOneOff = [...HISTORY, rec('one', '2026-03', '2026-03-12', 250, 0, 'Filming licence, car park')]
    const march = otherIncomeLinesForMonth('2026-03', SOURCES, withOneOff)
    expect(march[march.length - 1]).toMatchObject({ source: 'Other (one-off)', detail: 'Filming licence, car park', gross: 250 })
    expect(otherIncomeLinesForMonth('2026-04', SOURCES, withOneOff).map(l => l.source)).not.toContain('Other (one-off)')
  })

  it('keeps VAT separate so the accountant can see the output VAT', () => {
    const jan = otherIncomeLinesForMonth('2026-01', SOURCES, HISTORY)
    expect(jan.find(l => l.source === 'EV chargers')).toMatchObject({ net: 441.67, vat: 88.33, gross: 530 })
  })
})

describe('otherIncomeBySource', () => {
  const Q1 = ['2026-01', '2026-02', '2026-03']

  it('totals each source across the months, VAT kept apart', () => {
    const rows = otherIncomeBySource(Q1, SOURCES, HISTORY)
    const ev = rows.find(r => r.source === 'EV chargers')!
    expect(ev.total).toEqual({ net: 1325, vat: 265, gross: 1590 })
  })

  it('lists a recurring source that received nothing in some months, with those months at nil', () => {
    const rows = otherIncomeBySource(Q1, SOURCES, HISTORY)
    const max = rows.find(r => r.source === 'Unit 7 parking bays')!
    expect(max.byMonth['2026-03']).toEqual({ net: 0, vat: 0, gross: 0 })
    expect(max.total.gross).toBe(768)
  })

  it('omits a one-off source with nothing in the period', () => {
    expect(otherIncomeBySource(Q1, SOURCES, HISTORY).map(r => r.source)).not.toContain('Other (one-off)')
  })
})

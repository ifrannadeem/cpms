/**
 * Other income in the reports: money a property earns outside its leases (EV chargers,
 * parking licences, car park enforcement, one-offs). Recorded as receipts only, each
 * belonging to a month regardless of when it was paid. Tables: other_income_sources,
 * other_income_receipts (migration 20260921100000).
 *
 * Pure — no database access — so the display rules are pinned by tests.
 *
 * Rules (owner, 2026-09-21):
 *  - A RECURRING source gets one line per month, receipts for that month added together,
 *    and a nil line when nothing came in, so a missed payment stands out the way a vacant
 *    unit does. Maximus did not pay for March 2026; March must show them at nil, not omit
 *    them.
 *  - The nil lines start from the source's first receipt. A source set up today must not
 *    litter last year's reports with nil lines for months before it existed.
 *  - A retired source still shows any month it actually received something, but no longer
 *    produces nil lines.
 *  - A NON-RECURRING source (one-offs) is itemised: one line per receipt, with its own
 *    description, and nothing at all in months without one.
 */

export interface OtherIncomeSource {
  source_id: string
  name: string
  payer: string | null
  recurring: boolean
  active: boolean
}

export interface OtherIncomeReceipt {
  receipt_id: string
  source_id: string
  /** First of the month the income belongs to, YYYY-MM-DD. */
  period_month: string
  received_date: string
  net: number
  vat: number
  gross: number
  description: string | null
}

export interface OtherIncomeLine {
  source: string
  /** Payer for a recurring source; the entry's own description for a one-off. */
  detail: string
  /** When the money arrived, e.g. "Received 5 Aug 2026". Empty on a nil line. */
  received: string
  net: number
  vat: number
  gross: number
  /** A recurring source with nothing received for the month. */
  nil: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100
const monthOf = (iso: string) => iso.slice(0, 7)

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function receivedLabel(dates: string[]): string {
  const uniq = Array.from(new Set(dates)).sort()
  return uniq.length ? `Received ${uniq.map(shortDate).join(', ')}` : ''
}

/** The first month each source received anything, across ALL its receipts. */
export function firstMonthBySource(receipts: OtherIncomeReceipt[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of receipts) {
    const m = monthOf(r.period_month)
    const cur = out.get(r.source_id)
    if (!cur || m < cur) out.set(r.source_id, m)
  }
  return out
}

/** Whether a recurring source should carry a line (possibly nil) in `month`. */
function recurringDue(
  s: OtherIncomeSource,
  month: string,
  firstMonth: Map<string, string>,
  hasReceipt: boolean,
): boolean {
  if (hasReceipt) return true
  if (!s.active) return false
  const first = firstMonth.get(s.source_id)
  return !!first && month >= first
}

/**
 * Lines for one month. `receipts` may cover any period; only `month` (YYYY-MM) is used
 * for the lines, but all of them inform where each source's nil lines begin.
 */
export function otherIncomeLinesForMonth(
  month: string,
  sources: OtherIncomeSource[],
  receipts: OtherIncomeReceipt[],
): OtherIncomeLine[] {
  const first = firstMonthBySource(receipts)
  const inMonth = receipts.filter(r => monthOf(r.period_month) === month)
  const bySource = new Map<string, OtherIncomeReceipt[]>()
  for (const r of inMonth) {
    const arr = bySource.get(r.source_id) ?? []
    arr.push(r)
    bySource.set(r.source_id, arr)
  }

  const recurring: OtherIncomeLine[] = []
  const oneOff: (OtherIncomeLine & { sortDate: string })[] = []

  for (const s of sources) {
    const rs = bySource.get(s.source_id) ?? []
    if (s.recurring) {
      if (!recurringDue(s, month, first, rs.length > 0)) continue
      recurring.push({
        source: s.name,
        detail: s.payer ?? '',
        received: rs.length ? receivedLabel(rs.map(r => r.received_date)) : 'Nothing received',
        net: round2(rs.reduce((a, r) => a + r.net, 0)),
        vat: round2(rs.reduce((a, r) => a + r.vat, 0)),
        gross: round2(rs.reduce((a, r) => a + r.gross, 0)),
        nil: rs.length === 0,
      })
    } else {
      for (const r of rs) {
        oneOff.push({
          source: s.name,
          detail: r.description ?? s.payer ?? '',
          received: receivedLabel([r.received_date]),
          net: r.net, vat: r.vat, gross: r.gross,
          nil: false,
          sortDate: r.received_date,
        })
      }
    }
  }

  recurring.sort((a, b) => a.source.localeCompare(b.source))
  oneOff.sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.source.localeCompare(b.source))
  return [...recurring, ...oneOff.map(({ sortDate: _d, ...l }) => l)]
}

export interface OtherIncomeCell { net: number; vat: number; gross: number }
export interface OtherIncomeSourceRow {
  source: string
  payer: string
  recurring: boolean
  byMonth: Record<string, OtherIncomeCell>
  total: OtherIncomeCell
}

/** One row per source across a run of months, for the accountant's workbook. One-offs are
 *  summed per source here: itemising them across a year of columns would be unreadable,
 *  and the monthly report itemises them already. */
export function otherIncomeBySource(
  months: string[],
  sources: OtherIncomeSource[],
  receipts: OtherIncomeReceipt[],
): OtherIncomeSourceRow[] {
  const first = firstMonthBySource(receipts)
  const monthSet = new Set(months)
  const rows: OtherIncomeSourceRow[] = []

  for (const s of sources) {
    const rs = receipts.filter(r => r.source_id === s.source_id && monthSet.has(monthOf(r.period_month)))
    const due = s.recurring && months.some(m => recurringDue(s, m, first, false))
    if (rs.length === 0 && !due) continue

    const byMonth: Record<string, OtherIncomeCell> = {}
    const total: OtherIncomeCell = { net: 0, vat: 0, gross: 0 }
    for (const m of months) byMonth[m] = { net: 0, vat: 0, gross: 0 }
    for (const r of rs) {
      const c = byMonth[monthOf(r.period_month)]
      c.net = round2(c.net + r.net); c.vat = round2(c.vat + r.vat); c.gross = round2(c.gross + r.gross)
      total.net = round2(total.net + r.net); total.vat = round2(total.vat + r.vat); total.gross = round2(total.gross + r.gross)
    }
    rows.push({ source: s.name, payer: s.payer ?? '', recurring: s.recurring, byMonth, total })
  }

  return rows.sort((a, b) => Number(b.recurring) - Number(a.recurring) || a.source.localeCompare(b.source))
}

// ---------- Collection grid: sources down, the twelve months of a year across ----------

/**
 *   received  money arrived for this month
 *   missed    a recurring source paid nothing for a month that has already passed, on or
 *             after its first receipt: the case this view exists to show
 *   before    before the source's first receipt, or a retired source with nothing
 *   pending   the current month or later, with nothing yet. Not flagged: the car park pays
 *             for a month in the month after, so the current month is not yet late
 */
export type CollectionState = 'received' | 'missed' | 'before' | 'pending'

export interface CollectionCell {
  state: CollectionState
  net: number
  vat: number
  gross: number
  /** Dates the money for this month arrived. */
  receivedDates: string[]
}

export interface CollectionRow {
  sourceId: string
  source: string
  payer: string
  recurring: boolean
  active: boolean
  cells: CollectionCell[]
  yearNet: number
  yearVat: number
  yearGross: number
}

export interface OtherIncomeCollection {
  year: number
  rows: CollectionRow[]
  monthlyTotals: number[]
  cumulative: number[]
  /** Sources that received something in each month. */
  payerCounts: number[]
  yearNet: number
  yearVat: number
  yearGross: number
}

/**
 * The Other Income: Collection grid for one calendar year, matching Rent: Collection and
 * Electric: Collection. There is no invoice to measure against, so a cell is what was
 * received for that month, and a regular source that paid nothing for a past month is
 * flagged. `currentMonth` (YYYY-MM) is passed in so the rules are testable.
 */
export function otherIncomeCollection(
  year: number,
  currentMonth: string,
  sources: OtherIncomeSource[],
  receipts: OtherIncomeReceipt[],
): OtherIncomeCollection {
  const first = firstMonthBySource(receipts)
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const yearStart = months[0], yearEnd = months[11]

  const rows: CollectionRow[] = []
  for (const s of sources) {
    const mine = receipts.filter(r => r.source_id === s.source_id)
    const inYear = mine.filter(r => { const m = monthOf(r.period_month); return m >= yearStart && m <= yearEnd })
    // A regular source still in use always gets a row; anything else only if it received
    // something this year.
    if (!(s.recurring && s.active) && inYear.length === 0) continue

    const cells: CollectionCell[] = months.map(m => {
      const rs = inYear.filter(r => monthOf(r.period_month) === m)
      if (rs.length > 0) {
        return {
          state: 'received' as const,
          net: round2(rs.reduce((a, r) => a + r.net, 0)),
          vat: round2(rs.reduce((a, r) => a + r.vat, 0)),
          gross: round2(rs.reduce((a, r) => a + r.gross, 0)),
          receivedDates: Array.from(new Set(rs.map(r => r.received_date))).sort(),
        }
      }
      const f = first.get(s.source_id)
      const state: CollectionState =
        m >= currentMonth ? 'pending'
        : s.recurring && s.active && !!f && m >= f ? 'missed'
        : 'before'
      return { state, net: 0, vat: 0, gross: 0, receivedDates: [] }
    })

    rows.push({
      sourceId: s.source_id,
      source: s.name,
      payer: s.payer ?? '',
      recurring: s.recurring,
      active: s.active,
      cells,
      yearNet: round2(cells.reduce((a, c) => a + c.net, 0)),
      yearVat: round2(cells.reduce((a, c) => a + c.vat, 0)),
      yearGross: round2(cells.reduce((a, c) => a + c.gross, 0)),
    })
  }
  rows.sort((a, b) => Number(b.recurring) - Number(a.recurring) || a.source.localeCompare(b.source))

  const monthlyTotals = months.map((_, i) => round2(rows.reduce((a, r) => a + r.cells[i].gross, 0)))
  const cumulative: number[] = []
  monthlyTotals.reduce((run, v, i) => { cumulative[i] = round2(run + v); return cumulative[i] }, 0)
  const payerCounts = months.map((_, i) => rows.filter(r => r.cells[i].gross > 0).length)

  return {
    year, rows, monthlyTotals, cumulative, payerCounts,
    yearNet: round2(rows.reduce((a, r) => a + r.yearNet, 0)),
    yearVat: round2(rows.reduce((a, r) => a + r.yearVat, 0)),
    yearGross: round2(rows.reduce((a, r) => a + r.yearGross, 0)),
  }
}

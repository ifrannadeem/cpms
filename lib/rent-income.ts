import { unitLabels } from './format'

/**
 * Rows for the Monthly Rent Income report: what each unit earned for one month.
 *
 * Pure — no database access — so the rules below are pinned by tests.
 *
 * The report used to show cash that landed in the month, summed per tenant. That put a
 * payment in the month it arrived rather than the month it paid for, and against
 * whichever unit happened to represent the tenant. Owner report, 21 September 2026:
 *   - Idrak paid July's rent on 10 August and August's on 21 August. August showed
 *     GBP 1,080 received and July showed nothing, although both invoices were settled.
 *   - Al-Hurraya's GBP 1,725 on 28 August appeared entirely against Suite 2.7, although
 *     it was spread across three leases and mostly paid September's rent.
 * The ledger itself was right throughout; every receipt was allocated to the correct
 * invoice. The report simply ignored the allocations.
 *
 * It now reads them. Each row is one tenancy's units for the month, and "received" is
 * what has been allocated to that month's rent invoice, whenever the money arrived.
 *
 * Rules:
 *  - One row per lease in occupation at any point in the month, carrying all its units
 *    ("Suites 1.1, 1.2, 1.3, 1.4"). A unit that changed hands mid-month appears once
 *    per tenancy, which is the truth of that month.
 *  - A lease with a rent charge for the month always appears, even if its dates say
 *    otherwise, so no billed rent can ever drop off the report.
 *  - Every active unit no tenancy covered that month appears as Vacant, at nil. Nil
 *    because the unit was empty is different from nil because a tenant has not paid,
 *    and the report must show which.
 *  - A tenancy of a combined unit covers the units it was later split into
 *    (`split_from_unit_id`). Maher held Units 4 and 5 as the single unit RBC-A-4-5 until
 *    31 July 2026, then took 4 and 5 on separate leases. Without this, July showed 4 and
 *    5 as vacant while Maher was in them and owed the rent, and the Maher row had no
 *    unit at all because the combined unit is now retired.
 *  - A tenancy in occupation but not billed (rent-free, or not charged at all) shows
 *    at nil against the tenant, not as vacant.
 */

export interface RentRow {
  unit: string
  tenant: string
  grossBilled: number
  received: number
  outstanding: number
  /** No tenancy in occupation for any part of the month. */
  vacant: boolean
}

export interface RentIncomeInput {
  /** First day of the month, YYYY-MM-DD. */
  monthStart: string
  /** Last day of the month, YYYY-MM-DD. */
  monthEnd: string
  /** Every unit of the asset, retired ones included: a past tenancy of a retired unit
   *  still needs its label. Only active units can be reported as vacant. */
  units: {
    unit_id: string
    unit_reference: string
    /** Defaults to true. */
    active?: boolean
    /** The combined unit this one was split out of, if any. */
    split_from_unit_id?: string | null
  }[]
  leases: {
    lease_id: string
    tenant_id: string
    commencement_date: string | null
    termination_date: string | null
  }[]
  leaseUnits: { lease_id: string; unit_id: string }[]
  tenantName: (tenantId: string) => string
  /** Rent charges for the month that count as income (credited and written off excluded). */
  charges: { charge_id: string; lease_id: string; gross_amount: number }[]
  allocations: { charge_id: string; allocated_amount: number }[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** A lease occupies the month if it began on or before the last day and had not ended
 *  before the first. Occupation runs from commencement, not rent commencement, so a
 *  rent-free start still counts as let. */
export function occupiesMonth(
  lease: { commencement_date: string | null; termination_date: string | null },
  monthStart: string,
  monthEnd: string,
): boolean {
  if (!lease.commencement_date || lease.commencement_date > monthEnd) return false
  return !lease.termination_date || lease.termination_date >= monthStart
}

export function buildMonthlyRentRows(input: RentIncomeInput): RentRow[] {
  const unitRefById = new Map(input.units.map(u => [u.unit_id, u.unit_reference]))
  const activeUnitIds = new Set(input.units.filter(u => u.active !== false).map(u => u.unit_id))

  // A tenancy of a combined unit also occupies whatever it was later split into.
  const childrenOf = new Map<string, string[]>()
  for (const u of input.units) {
    if (!u.split_from_unit_id) continue
    const arr = childrenOf.get(u.split_from_unit_id) ?? []
    arr.push(u.unit_id)
    childrenOf.set(u.split_from_unit_id, arr)
  }
  const withParts = (unitId: string): string[] => {
    const out: string[] = []
    const queue = [unitId]
    const seen = new Set<string>()
    while (queue.length) {
      const id = queue.shift()!
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
      queue.push(...(childrenOf.get(id) ?? []))
    }
    return out
  }

  const unitsByLease = new Map<string, string[]>()
  for (const lu of input.leaseUnits) {
    const arr = unitsByLease.get(lu.lease_id) ?? []
    arr.push(lu.unit_id)
    unitsByLease.set(lu.lease_id, arr)
  }

  const billedByLease = new Map<string, number>()
  const leaseByCharge = new Map<string, string>()
  for (const c of input.charges) {
    billedByLease.set(c.lease_id, (billedByLease.get(c.lease_id) ?? 0) + c.gross_amount)
    leaseByCharge.set(c.charge_id, c.lease_id)
  }
  const receivedByLease = new Map<string, number>()
  for (const a of input.allocations) {
    const leaseId = leaseByCharge.get(a.charge_id)
    if (!leaseId) continue
    receivedByLease.set(leaseId, (receivedByLease.get(leaseId) ?? 0) + a.allocated_amount)
  }

  const inMonth = input.leases.filter(l =>
    occupiesMonth(l, input.monthStart, input.monthEnd) || billedByLease.has(l.lease_id))

  const covered = new Set<string>()
  const rows: (RentRow & { sortKey: string; start: string })[] = []

  for (const l of inMonth) {
    const unitIds = unitsByLease.get(l.lease_id) ?? []
    unitIds.forEach(id => withParts(id).forEach(part => covered.add(part)))
    const refs = unitIds
      .map(id => unitRefById.get(id))
      .filter((r): r is string => !!r)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const billed = round2(billedByLease.get(l.lease_id) ?? 0)
    const received = round2(receivedByLease.get(l.lease_id) ?? 0)
    rows.push({
      unit: unitLabels(refs.join(', ')),
      tenant: input.tenantName(l.tenant_id),
      grossBilled: billed,
      received,
      outstanding: round2(Math.max(billed - received, 0)),
      vacant: false,
      sortKey: refs[0] ?? '',
      start: l.commencement_date ?? '',
    })
  }

  for (const u of input.units) {
    if (covered.has(u.unit_id) || !activeUnitIds.has(u.unit_id)) continue
    rows.push({
      unit: unitLabels(u.unit_reference),
      tenant: 'Vacant',
      grossBilled: 0,
      received: 0,
      outstanding: 0,
      vacant: true,
      sortKey: u.unit_reference,
      start: '',
    })
  }

  return rows
    .sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true }) || a.start.localeCompare(b.start))
    .map(({ sortKey: _k, start: _s, ...row }) => row)
}

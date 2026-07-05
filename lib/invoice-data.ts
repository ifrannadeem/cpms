import { supabase, supabaseUnchecked } from './supabase'

export interface IssuingEntity {
  entity_name: string
  address_lines: string[] | null
  company_number: string | null
  vat_number: string | null
  phone: string | null
  email: string | null
  agent_for: string | null
  bank_name: string | null
  bank_account_name: string
  bank_sort_code: string
  bank_account_number: string
  logo_path: string | null
}

export interface InvoiceData {
  kind: 'RENT' | 'ELECTRIC' | 'OTHER'
  reference: string
  invoiceDate: string
  entity: IssuingEntity
  tenantName: string
  tenantAddress: string[]
  premisesLabel: string
  premisesAddress: string
  description: string
  periodStart: string
  periodEnd: string
  vatTreatment: string
  netAmount: number
  vatAmount: number
  grossAmount: number
  paidAmount: number
  amountDue: number
  electric?: {
    openDate: string
    openReading: number
    closeDate: string
    closeReading: number
    consumption: number
    ratePerKwh: number
  }
}

const MONTH_LONG: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }

export function fmtLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', MONTH_LONG)
}

export function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function yymm(iso: string): string {
  const d = new Date(iso)
  return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0')
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

/** Last segment of a unit reference, leading zeros stripped, alpha suffix kept: RBC-A-13A -> 13A, SGP-6A -> 6A */
function unitSegment(r: string): string {
  const last = r.split('-').pop() ?? r
  const m = last.match(/^0*(\d.*)$/)
  return m ? m[1] : last
}

/** SGP-I-1.5 -> U8S1.5 ; RBC-001-029 -> U29 ; ranges joined first-last */
export function unitCode(refs: string[]): string {
  if (refs.length === 0) return 'U?'
  if (refs.every(r => r.startsWith('SGP-I-'))) {
    const suites = refs.map(r => r.replace('SGP-I-', '')).sort(naturalCompare)
    return 'U8S' + (suites.length > 1 ? `${suites[0]}-${suites[suites.length - 1]}` : suites[0])
  }
  const nums = refs.map(unitSegment).sort(naturalCompare)
  return 'U' + (nums.length > 1 ? `${nums[0]}-${nums[nums.length - 1]}` : nums[0])
}

/** Suite 1.5 / Suites 1.1 - 1.4 / Unit 29 / Units 10 - 11 */
export function premisesLabel(refs: string[]): string {
  if (refs.length === 0) return ''
  if (refs.every(r => r.startsWith('SGP-I-'))) {
    const suites = refs.map(r => r.replace('SGP-I-', '')).sort(naturalCompare)
    return suites.length > 1
      ? `Suites ${suites[0]} - ${suites[suites.length - 1]}`
      : `Suite ${suites[0]}`
  }
  const nums = refs.map(unitSegment).sort(naturalCompare)
  return nums.length > 1 ? `Units ${nums[0]} - ${nums[nums.length - 1]}` : `Unit ${nums[0]}`
}

export function buildReference(kind: string, periodStart: string, periodEnd: string, refs: string[]): string {
  const code = unitCode(refs)
  if (kind === 'ELECTRIC') return `${yymm(periodEnd)}E-${code}`
  return `R${yymm(periodStart)}-${code}`
}

/** Strip characters that are illegal in Windows file names. */
function sanitizeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** "2607. Invoice - Rent - Unit 12 Idris Rehman.pdf" (rent = period_start month, electric = period_end month) */
export function invoiceFileName(inv: InvoiceData): string {
  const ym = yymm(inv.kind === 'ELECTRIC' ? inv.periodEnd : inv.periodStart)
  const typeLabel = inv.kind === 'ELECTRIC' ? 'Electric' : inv.kind === 'RENT' ? 'Rent' : 'Charge'
  return sanitizeFileName(`${ym}. Invoice - ${typeLabel} - ${inv.premisesLabel} ${inv.tenantName}`) + '.pdf'
}

export async function assembleInvoices(chargeIds: string[]): Promise<InvoiceData[]> {
  if (chargeIds.length === 0) return []

  const { data: charges, error } = await supabase
    .from('v_charge_ledger')
    .select('*')
    .in('charge_id', chargeIds)
  if (error) throw new Error(error.message)
  const rows = charges ?? []
  if (rows.length === 0) return []

  const leaseIds  = Array.from(new Set(rows.map(c => c.lease_id)))
  const tenantIds = Array.from(new Set(rows.map(c => c.tenant_id)))
  const assetIds  = Array.from(new Set(rows.map(c => c.asset_id)))

  const [{ data: entities }, { data: tenants }, { data: leaseUnits }, { data: assets }, { data: profiles }] =
    await Promise.all([
      supabase.from('issuing_entities').select('*').in('asset_id', assetIds),
      supabase.from('tenants').select('tenant_id, correspondence_address').in('tenant_id', tenantIds),
      supabase.from('lease_units').select('lease_id, units(unit_reference)').in('lease_id', leaseIds),
      supabase.from('assets').select('asset_id, asset_name, address_line_1, address_line_2, town, postcode').in('asset_id', assetIds),
      supabase.from('charge_profiles').select('lease_id, charge_type, vat_treatment').in('lease_id', leaseIds),
    ])

  const entityByAsset = new Map((entities ?? []).map(e => [e.asset_id, e]))
  const tenantById    = new Map((tenants ?? []).map(t => [t.tenant_id, t]))
  const assetById     = new Map((assets ?? []).map(a => [a.asset_id, a]))

  const unitsByLease = new Map<string, string[]>()
  for (const lu of leaseUnits ?? []) {
    const u = lu.units as unknown as { unit_reference: string } | null
    if (!u) continue
    const arr = unitsByLease.get(lu.lease_id) ?? []
    arr.push(u.unit_reference)
    unitsByLease.set(lu.lease_id, arr)
  }

  const vatByLeaseType = new Map<string, string>()
  for (const p of profiles ?? []) {
    vatByLeaseType.set(`${p.lease_id}:${p.charge_type}`, p.vat_treatment)
  }

  // Electric: closing reads linked to charges (opening = closing - consumption)
  const { data: closeReads } = await supabase
    .from('meter_reads')
    .select('charge_id, read_date, reading_value, consumption_kwh')
    .in('charge_id', chargeIds)
  const readByCharge = new Map((closeReads ?? []).map(r => [r.charge_id, r]))

  const invoices: InvoiceData[] = rows.map(c => {
    const entity = entityByAsset.get(c.asset_id)
    if (!entity) throw new Error(`No issuing entity configured for asset ${c.asset_id}`)
    const asset = assetById.get(c.asset_id)
    const tenant = tenantById.get(c.tenant_id)
    const kind: InvoiceData['kind'] =
      c.charge_type === 'RENT' ? 'RENT' : c.charge_type === 'ELECTRIC' ? 'ELECTRIC' : 'OTHER'
    // Rent for merged units is one invoice across the combined premises; electric is billed per
    // sub-meter, so each electric invoice is labelled by its own unit (keeps ZIP filenames distinct).
    const refs = kind === 'ELECTRIC'
      ? (c.unit_reference ? [c.unit_reference] : (unitsByLease.get(c.lease_id) ?? []))
      : (unitsByLease.get(c.lease_id) ?? (c.unit_reference ? [c.unit_reference] : []))

    const gross = parseFloat(c.gross_amount ?? '0')
    const paid  = parseFloat(c.payment_amount ?? '0')
    const net   = parseFloat(c.net_amount ?? '0')
    const vat   = parseFloat(c.vat_amount ?? '0')

    const treatment = vatByLeaseType.get(`${c.lease_id}:${c.charge_type}`)
      ?? (c.charge_type === 'ELECTRIC' ? 'STANDARD' : 'EXEMPT')

    const premisesAddress = asset
      ? [asset.asset_name, asset.address_line_1, asset.address_line_2, asset.town, asset.postcode]
          .filter(Boolean).join(', ')
      : ''

    let addressRaw: string = tenant?.correspondence_address ?? ''
    if (/TBC/i.test(addressRaw)) addressRaw = ''
    const tenantAddress = addressRaw
      ? addressRaw.split(/,\s*|\n/).map((s: string) => s.trim()).filter(Boolean)
      : [premisesLabel(refs), ...premisesAddress.split(', ')]

    let electric: InvoiceData['electric']
    if (kind === 'ELECTRIC') {
      const r = readByCharge.get(c.charge_id)
      if (r && r.consumption_kwh != null) {
        const closeReading = parseFloat(r.reading_value)
        const consumption  = parseFloat(r.consumption_kwh)
        electric = {
          openDate: c.period_start,
          openReading: closeReading - consumption,
          closeDate: r.read_date,
          closeReading,
          consumption,
          ratePerKwh: consumption > 0 ? Math.round((net / consumption) * 10000) / 10000 : 0,
        }
      }
    }

    const description =
      kind === 'RENT'
        ? `Rent – Monthly in Advance\n${monthLabel(c.period_start)}`
        : kind === 'ELECTRIC'
          ? `Electricity – ${monthLabel(c.period_end)}`
          : c.charge_label

    return {
      kind,
      // Issued invoices render from the stamped reference so the document never
      // changes if a unit is ever renumbered; drafts still compute live.
      reference: c.invoice_reference ?? buildReference(c.charge_type, c.period_start, c.period_end, refs),
      invoiceDate: c.issued_date ?? new Date().toISOString().slice(0, 10),
      entity: entity as IssuingEntity,
      tenantName: c.tenant_name,
      tenantAddress,
      premisesLabel: premisesLabel(refs),
      premisesAddress,
      description,
      periodStart: c.period_start,
      periodEnd: c.period_end,
      vatTreatment: treatment,
      netAmount: net,
      vatAmount: vat,
      grossAmount: gross,
      paidAmount: paid,
      amountDue: Math.max(gross - paid, 0),
      electric,
    }
  })

  // Stamp the reference onto issued charges on first render so the document is
  // stable from then on (council review 4.2). Best-effort: rendering must not fail
  // if the invoice_reference column has not been migrated yet, so errors are logged
  // and ignored. `.is('invoice_reference', null)` makes concurrent stamps idempotent.
  const ISSUED_PLUS = new Set(['ISSUED', 'OVERDUE', 'PART_PAID', 'PAID'])
  const toStamp = rows
    .map((c, i) => ({ c, ref: invoices[i].reference }))
    .filter(({ c }) => ISSUED_PLUS.has(c.status) && !c.invoice_reference)
  if (toStamp.length > 0) {
    await Promise.all(
      toStamp.map(async ({ c, ref }) => {
        const { error } = await supabaseUnchecked
          .from('charge_records')
          .update({ invoice_reference: ref })
          .eq('charge_id', c.charge_id)
          .is('invoice_reference', null)
        if (error) console.warn(`invoice_reference stamp skipped for ${c.charge_id}: ${error.message}`)
      }),
    )
  }

  invoices.sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true }))
  return invoices
}

import { fmtLongDate, monthLabel, invoiceFileName, type InvoiceData } from './invoice-data'

/**
 * Tenant-facing invoice emails. The numbers come from the same InvoiceData the PDF
 * is rendered from, so the email body can never disagree with the attachment.
 * One email per tenant per cycle: a tenant's multiple suites combine into one
 * electric email with a block per suite and a single total.
 *
 * Southgate tenants are all companies, so the greeting defaults to "Dear Sirs".
 * A named contact (used for Rosehill individuals later) overrides it.
 */

export interface EmailDraft {
  tenantId: string
  tenantName: string
  to: string | null
  subject: string
  body: string
  attachments: string[]
}

interface BuildOpts {
  tenantId: string
  invoices: InvoiceData[]
  assetName: string
  to: string | null
  contactName?: string | null
}

const POUND = String.fromCharCode(0x00A3)
const ENDASH = String.fromCharCode(0x2013)

function gbp(n: number): string {
  return POUND + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function reading(n: number): string {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 2 })
}

function yymm(iso: string): string {
  const d = new Date(iso)
  return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0')
}

function greeting(contactName: string | null | undefined): string {
  return contactName && contactName.trim() ? `Dear ${contactName.trim()},` : 'Dear Sirs,'
}

function signOff(entity: InvoiceData['entity']): string {
  return entity.entity_name
}

/** ["Suite 1.7","Suite 1.8"] -> "Suites 1.7 & 1.8"; ["Unit 6"] -> "Unit 6" */
function combineLabels(labels: string[]): string {
  const uniq = Array.from(new Set(labels))
  if (uniq.length === 1) return uniq[0]
  const prefixes = new Set(uniq.map(l => l.split(' ')[0]))
  if (prefixes.size === 1) {
    const prefix = uniq[0].split(' ')[0]
    const rest = uniq.map(l => l.slice(prefix.length + 1))
    return `${prefix}s ${rest.join(' & ')}`
  }
  return uniq.join(', ')
}

export function buildRentEmail(opts: BuildOpts): EmailDraft {
  const { invoices, assetName, to, contactName } = opts
  const first = invoices[0]
  const monthLong = monthLabel(first.periodStart)
  const premises = combineLabels(invoices.map(i => i.premisesLabel))

  const detailLines: string[] = []
  for (const inv of invoices) {
    if (invoices.length > 1) detailLines.push(`${inv.premisesLabel}:`)
    // The invoice amount (gross), not the running outstanding — an invoice states
    // its own value regardless of any payment already recorded.
    detailLines.push(`Amount due: ${gbp(inv.grossAmount)}`)
    detailLines.push(`Date due: ${fmtLongDate(inv.dueDate)}`)
    detailLines.push(`Payment reference: ${inv.reference}`)
    if (invoices.length > 1) detailLines.push('')
  }

  const body = [
    greeting(contactName),
    '',
    'We hope this email finds you well.',
    '',
    `Please find attached our invoice for rent for ${monthLong} in respect of ${premises}, ${assetName}.`,
    '',
    ...detailLines,
    ...(invoices.length > 1 ? [] : ['']),
    'Should you have any questions or require any further information, please do not hesitate to contact us.',
    '',
    'Best regards,',
    signOff(first.entity),
  ].join('\n')

  return {
    tenantId: opts.tenantId,
    tenantName: first.tenantName,
    to,
    subject: `Rent Invoice (${monthLong}) ${ENDASH} ${premises}, ${assetName}`,
    body,
    attachments: invoices.map(invoiceFileName),
  }
}

export function buildElectricEmail(opts: BuildOpts): EmailDraft {
  const { invoices, to, contactName } = opts
  const first = invoices[0]
  const monthLong = monthLabel(first.periodEnd)
  const premises = combineLabels(invoices.map(i => i.premisesLabel))
  const multi = invoices.length > 1

  const opens = invoices.map(i => i.electric?.openDate ?? i.periodStart).sort()
  const closes = invoices.map(i => i.electric?.closeDate ?? i.periodEnd).sort()
  const periodFrom = opens[0]
  const periodTo = closes[closes.length - 1]

  const blocks: string[] = []
  for (const inv of invoices) {
    const lines: string[] = []
    if (multi) lines.push(inv.premisesLabel)
    if (inv.electric) {
      const e = inv.electric
      lines.push(`Meter reading (${fmtLongDate(e.openDate)}): ${reading(e.openReading)}`)
      lines.push(`Meter reading (${fmtLongDate(e.closeDate)}): ${reading(e.closeReading)}`)
      lines.push(`Units consumed: ${reading(e.consumption)} kWh at ${POUND}${e.ratePerKwh.toFixed(4)} per kWh`)
    }
    lines.push(`Subtotal: ${gbp(inv.netAmount)}`)
    lines.push(`VAT (20%): ${gbp(inv.vatAmount)}`)
    lines.push(`Total: ${gbp(inv.grossAmount)}`)
    blocks.push(lines.join('\n'))
  }

  // Sum the invoice (gross) totals, matching the per-suite Totals above.
  const totalDue = invoices.reduce((s, i) => s + i.grossAmount, 0)

  const body = [
    greeting(contactName),
    '',
    `Please find attached your electricity invoice${multi ? 's' : ''} for ${monthLong}, covering the period from ${fmtLongDate(periodFrom)} to ${fmtLongDate(periodTo)}.`,
    '',
    blocks.join('\n\n'),
    '',
    ...(multi ? [`Total amount due: ${gbp(totalDue)}`, ''] : []),
    'Kind regards,',
    signOff(first.entity),
  ].join('\n')

  return {
    tenantId: opts.tenantId,
    tenantName: first.tenantName,
    to,
    subject: `${yymm(periodTo)} Electric Invoice ${ENDASH} ${premises} (${monthLong})`,
    body,
    attachments: invoices.map(invoiceFileName),
  }
}

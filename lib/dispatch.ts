import { supabase } from './supabase'
import { assembleInvoices, type InvoiceData } from './invoice-data'
import { buildRentEmail, buildElectricEmail, type EmailDraft } from './email-templates'

/**
 * Shared assembly for the Email Invoices page and the /api/dispatch route, so the
 * preview and the actually-sent email are built from exactly the same data.
 */

export type DispatchType = 'RENT' | 'ELECTRIC'

const ISSUED = ['ISSUED', 'OVERDUE', 'PART_PAID', 'PAID']

export interface DispatchItem {
  tenantId: string
  draft: EmailDraft
  chargeIds: string[]
  invoices: InvoiceData[]
}

export interface DispatchResult {
  months: string[]
  month: string | undefined
  items: DispatchItem[]
}

export async function gatherDispatch(opts: {
  assetId: string
  assetName: string
  reference: string
  type: DispatchType
  month?: string
}): Promise<DispatchResult> {
  const { assetId, assetName, reference, type } = opts

  const { data: ledger } = await supabase
    .from('v_charge_ledger')
    .select('charge_id, tenant_id, period_start, period_end, status')
    .eq('asset_id', assetId)
    .eq('charge_type', type)
    .in('status', ISSUED)

  const rows = ledger ?? []
  const monthOf = (r: { period_start: string; period_end: string }) =>
    (type === 'ELECTRIC' ? r.period_end : r.period_start).slice(0, 7)
  const months = Array.from(new Set(rows.map(monthOf))).sort().reverse()
  const month = opts.month && months.includes(opts.month) ? opts.month : months[0]
  if (!month) return { months, month: undefined, items: [] }

  const monthRows = rows.filter(r => monthOf(r) === month)
  const chargeIds = monthRows.map(r => r.charge_id)
  const invoices = chargeIds.length ? await assembleInvoices(chargeIds) : []

  const tenantIds = Array.from(new Set(invoices.map(i => i.tenantId)))
  const { data: tenants } = tenantIds.length
    ? await supabase.from('tenants')
        .select('tenant_id, invoice_email_to, accounts_contact_email, primary_contact_email')
        .in('tenant_id', tenantIds)
    : { data: [] }
  const emailById = new Map(
    (tenants ?? []).map(t => {
      const raw = t.invoice_email_to || t.accounts_contact_email || t.primary_contact_email || ''
      const parts = raw.split(/[,;]/).map((s: string) => s.trim()).filter((s: string) => s && !/tbc/i.test(s))
      return [t.tenant_id, parts.length ? parts.join(', ') : null]
    })
  )

  const chargeIdsByTenant = new Map<string, string[]>()
  for (const r of monthRows) {
    const arr = chargeIdsByTenant.get(r.tenant_id) ?? []
    arr.push(r.charge_id)
    chargeIdsByTenant.set(r.tenant_id, arr)
  }

  const invoicesByTenant = new Map<string, InvoiceData[]>()
  for (const inv of invoices) {
    const arr = invoicesByTenant.get(inv.tenantId) ?? []
    arr.push(inv)
    invoicesByTenant.set(inv.tenantId, arr)
  }

  const items: DispatchItem[] = Array.from(invoicesByTenant.entries())
    .map(([tid, invs]) => {
      const buildOpts = { tenantId: tid, invoices: invs, assetName, to: emailById.get(tid) ?? null }
      const draft = type === 'ELECTRIC' ? buildElectricEmail(buildOpts) : buildRentEmail(buildOpts)
      return { tenantId: tid, draft, chargeIds: chargeIdsByTenant.get(tid) ?? [], invoices: invs }
    })
    .sort((a, b) => a.draft.tenantName.localeCompare(b.draft.tenantName))

  void reference
  return { months, month, items }
}

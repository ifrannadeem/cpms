/**
 * Throwaway sample renderer: builds a real invoice PDF from live data so a layout
 * change can be eyeballed before it is committed. Not part of the test suite
 * (filename is not *.test.ts). Run with:
 *   npx vitest run tests/_sample-invoice.render.ts --config vitest.sample.config.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { test } from 'vitest'

test('render Workshop 4 August invoice', async () => {
  for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }

  const { assembleInvoices } = await import('../lib/invoice-data')
  const { renderInvoicesPdf } = await import('../lib/invoice-pdf')
  const { createClient } = await import('@supabase/supabase-js')

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data } = await db
    .from('v_charge_ledger')
    .select('charge_id, unit_reference, net_amount, vat_amount, gross_amount')
    .eq('unit_reference', 'RBC-A-4')
    .eq('charge_type', 'RENT')
    .eq('period_start', '2026-08-01')
    .single()

  const invoices = await assembleInvoices([data!.charge_id])
  const inv = invoices[0]
  console.log('charge:', data)
  console.log('concession:', JSON.stringify(inv.concession))
  console.log('reference:', inv.reference, '| tenant:', inv.tenantLegalName, '| premises:', inv.premisesLabel)

  const pdf = await renderInvoicesPdf(invoices)
  writeFileSync('sample-workshop4-invoice.pdf', Buffer.from(pdf))
  console.log('written: sample-workshop4-invoice.pdf', pdf.length, 'bytes')
}, 60_000)

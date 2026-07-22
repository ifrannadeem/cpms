import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSessionUser, unauthorised } from '@/lib/auth'
import { gatherDispatch, type DispatchType } from '@/lib/dispatch'
import { renderInvoicesPdf } from '@/lib/invoice-pdf'
import { invoiceFileName } from '@/lib/invoice-data'
import { dispatchMode, sendMail } from '@/lib/mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/dispatch  { assetId, type, month, tenantId }
 * Sends one tenant's invoice email for a cycle. Test mode (default) routes to
 * DISPATCH_TEST_TO and does NOT mark the invoices as sent; live mode sends to the
 * tenant's recipients and records the send.
 */
export async function GET() {
  return NextResponse.json({ error: 'Use POST' }, { status: 405 })
}

export async function POST(req: NextRequest) {
  if (!(await getSessionUser())) return unauthorised()

  let body: { assetId?: string; type?: string; month?: string; tenantId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { assetId, month, tenantId } = body
  const type: DispatchType = body.type === 'ELECTRIC' ? 'ELECTRIC' : 'RENT'
  if (!assetId || !month || !tenantId) {
    return NextResponse.json({ error: 'assetId, type, month and tenantId are required' }, { status: 400 })
  }

  try {
    const { data: asset } = await supabase
      .from('assets').select('asset_name, asset_reference').eq('asset_id', assetId).single()
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

    const { items } = await gatherDispatch({
      assetId, assetName: asset.asset_name, reference: asset.asset_reference, type, month,
    })
    const item = items.find(i => i.tenantId === tenantId)
    if (!item) return NextResponse.json({ error: 'No issued invoices for this tenant in this cycle' }, { status: 404 })

    const mode = dispatchMode(asset.asset_reference)
    let recipients: string[]
    let subject = item.draft.subject
    let text = item.draft.body

    if (mode.live) {
      recipients = (item.draft.to ?? '').split(',').map(s => s.trim()).filter(Boolean)
      if (recipients.length === 0) {
        return NextResponse.json({ error: 'No email address on file for this tenant. Add one on the tenancy.' }, { status: 400 })
      }
    } else {
      if (!mode.testTo) {
        return NextResponse.json({ error: 'Test mode is on but DISPATCH_TEST_TO is not set in the environment.' }, { status: 400 })
      }
      recipients = [mode.testTo]
      subject = `[TEST] ${item.draft.subject}`
      text = `*** TEST DISPATCH — in live mode this would be sent to: ${item.draft.to ?? '(no address on file)'} ***\n\n${item.draft.body}`
    }

    // One PDF per invoice, named as on the preview (a tenant's suites attach separately).
    const attachments = []
    for (const inv of item.invoices) {
      const pdf = await renderInvoicesPdf([inv])
      attachments.push({ filename: invoiceFileName(inv), content: new Uint8Array(pdf) })
    }

    await sendMail({ to: recipients, subject, text, attachments })

    // Only record a real send. A test run must not flag invoices as sent to tenants.
    if (mode.live) {
      await supabase
        .from('charge_records')
        .update({ sent_date: new Date().toISOString().slice(0, 10), sent_method: 'EMAIL', sent_to: recipients.join(', ') })
        .in('charge_id', item.chargeIds)
        .not('status', 'in', '(DRAFT,APPROVED)')
    }

    return NextResponse.json({ ok: true, live: mode.live, sentTo: recipients, attachments: attachments.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

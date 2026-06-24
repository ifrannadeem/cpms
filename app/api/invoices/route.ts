import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { assembleInvoices, monthLabel, invoiceFileName } from '@/lib/invoice-data'
import { renderInvoicesPdf } from '@/lib/invoice-pdf'
import JSZip from 'jszip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/invoices?chargeId=...                                  -> single invoice PDF
 * GET /api/invoices?assetId=...&month=YYYY-MM[&type=RENT|ELECTRIC] -> one combined PDF
 * GET /api/invoices?assetId=...&month=YYYY-MM[&type=...]&format=zip -> ZIP of individually-named PDFs
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const chargeId = searchParams.get('chargeId')
  const assetId  = searchParams.get('assetId')
  const month    = searchParams.get('month')
  const type     = searchParams.get('type')
  const format   = searchParams.get('format')

  let chargeIds: string[] = []
  let filename = 'invoice.pdf'

  if (chargeId) {
    chargeIds = [chargeId]
  } else if (assetId && month) {
    const monthStart = `${month}-01`
    const monthEndExcl = new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() + 1, 1)
      .toISOString().slice(0, 10)

    // Packs/zip contain ISSUED+ invoices only (never Draft/Approved/Credited/Written-off).
    let q = supabase
      .from('charge_records')
      .select('charge_id, charge_type, period_start, period_end')
      .eq('asset_id', assetId)
      .in('status', ['ISSUED', 'OVERDUE', 'PART_PAID', 'PAID'])
    if (type) q = q.eq('charge_type', type)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Rent belongs to the month of period_start; electric to the month of period_end
    chargeIds = (data ?? [])
      .filter(c => {
        const anchor = c.charge_type === 'ELECTRIC' ? c.period_end : c.period_start
        return anchor >= monthStart && anchor < monthEndExcl
      })
      .map(c => c.charge_id)

    const yymm = month.slice(2, 4) + month.slice(5, 7)
    const label = monthLabel(monthStart)
    filename = type === 'ELECTRIC'
      ? `${yymm} Electric Invoices (${label}).pdf`
      : type === 'RENT'
        ? `${yymm} Application for Rent (${label}) - All.pdf`
        : `${yymm} Invoices (${label}).pdf`
  } else {
    return NextResponse.json({ error: 'Provide chargeId, or assetId and month' }, { status: 400 })
  }

  if (chargeIds.length === 0) {
    return NextResponse.json({ error: 'No charges found for the selection' }, { status: 404 })
  }

  try {
    const invoices = await assembleInvoices(chargeIds)
    if (invoices.length === 0) {
      return NextResponse.json({ error: 'No invoice data found' }, { status: 404 })
    }

    // ZIP: one correctly-named PDF per invoice, ready to file into tenant folders
    if (format === 'zip') {
      const zip = new JSZip()
      for (const inv of invoices) {
        const onePdf = await renderInvoicesPdf([inv])
        zip.file(invoiceFileName(inv), new Uint8Array(onePdf))
      }
      const zipBuf = await zip.generateAsync({ type: 'uint8array' })
      const yymm = (month ?? '').slice(2, 4) + (month ?? '').slice(5, 7)
      const typeLabel = type === 'ELECTRIC' ? 'Electric' : type === 'RENT' ? 'Rent' : 'All'
      const zipName = `${yymm} ${typeLabel} Invoices.zip`
      return new NextResponse(new Uint8Array(zipBuf), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${zipName}"`,
        },
      })
    }

    if (chargeId) {
      filename = invoiceFileName(invoices[0])
    }
    const pdf = await renderInvoicesPdf(invoices)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

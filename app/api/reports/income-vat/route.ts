import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorised } from '@/lib/auth'
import { computeIncomeVat, buildIncomeVatWorkbook } from '@/lib/income-vat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * GET /api/reports/income-vat?assetId=...&from=YYYY-MM&to=YYYY-MM -> xlsx
 *
 * One asset at a time by design: the properties sit in different legal entities with
 * different VAT registrations, so there is no meaningful combined figure.
 */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser())) return unauthorised()

  const { searchParams } = new URL(req.url)
  const assetId = searchParams.get('assetId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!assetId || !from || !to) {
    return NextResponse.json({ error: 'Provide assetId, from (YYYY-MM) and to (YYYY-MM)' }, { status: 400 })
  }
  if (!MONTH.test(from) || !MONTH.test(to)) {
    return NextResponse.json({ error: 'from and to must be months in the form YYYY-MM' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: 'The start month must not be after the end month' }, { status: 400 })
  }

  const report = await computeIncomeVat(assetId, from, to)
  const buf = await buildIncomeVatWorkbook(report)

  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '')
  const filename = `Rent Income and VAT - ${safe(report.assetName)} - ${from} to ${to}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

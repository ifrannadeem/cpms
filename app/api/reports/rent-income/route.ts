import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorised } from '@/lib/auth'
import { buildRentIncomeWorkbook, computeRentIncome } from '@/lib/reports'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * GET /api/reports/rent-income?assetId=...&month=YYYY-MM -> xlsx
 *
 * What each unit earned for the month: rent billed for that month and what has been
 * received against it, whenever it was paid. Every unit is listed; empty ones as Vacant.
 */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser())) return unauthorised()

  const { searchParams } = new URL(req.url)
  const assetId = searchParams.get('assetId')
  const month = searchParams.get('month')
  if (!assetId || !month || !MONTH.test(month)) {
    return NextResponse.json({ error: 'Provide assetId and month (YYYY-MM)' }, { status: 400 })
  }

  const data = await computeRentIncome(assetId, month)
  const buf = await buildRentIncomeWorkbook(data)

  const yymm = month.slice(2, 4) + month.slice(5, 7)
  const filename = `${yymm} Rent Report - ${data.assetName.replace(/[\\/:*?"<>|]/g, '')} (${data.monthLabel}).xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSessionUser, unauthorised } from '@/lib/auth'
import { computeVatMatrix, buildVatWorkbook, currentVatYear } from '@/lib/reports'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/reports/vat?assetId=...&year=YYYY  (year optional) -> xlsx (rent VAT by unit/month/quarter) */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser())) return unauthorised()

  const { searchParams } = new URL(req.url)
  const assetId = searchParams.get('assetId')
  if (!assetId) return NextResponse.json({ error: 'Provide assetId' }, { status: 400 })

  let year = parseInt(searchParams.get('year') ?? '', 10)
  if (isNaN(year)) {
    const { data: cfg } = await supabase
      .from('vat_config').select('quarter_end_month').eq('asset_id', assetId).maybeSingle()
    year = currentVatYear(cfg?.quarter_end_month ?? null)
  }

  const matrix = await computeVatMatrix(assetId, year)
  const buf = await buildVatWorkbook(matrix)

  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '')
  const filename = `VAT Rent - ${safe(matrix.assetName)} - ${safe(matrix.yearLabel)}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

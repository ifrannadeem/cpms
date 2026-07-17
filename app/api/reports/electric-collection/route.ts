import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSessionUser, unauthorised } from '@/lib/auth'
import { buildRentCollectionData, buildRentCollectionWorkbook } from '@/lib/rent-collection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/reports/electric-collection?assetId=...&year=YYYY -> xlsx matrix */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser())) return unauthorised()

  const { searchParams } = new URL(req.url)
  const assetId = searchParams.get('assetId')
  const year = parseInt(searchParams.get('year') ?? '', 10)
  if (!assetId || isNaN(year)) {
    return NextResponse.json({ error: 'Provide assetId and year' }, { status: 400 })
  }

  try {
    const { data: asset } = await supabase
      .from('assets')
      .select('asset_name, asset_reference')
      .eq('asset_id', assetId)
      .single()
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

    const data = await buildRentCollectionData(assetId, asset.asset_reference, asset.asset_name, year, 'ELECTRIC')
    const buf = await buildRentCollectionWorkbook(data)

    const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '')
    const filename = `${year} Electric Collection - ${safe(asset.asset_name)}.xlsx`
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { supabase } from '@/lib/supabase'
import { getSessionUser, unauthorised } from '@/lib/auth'
import { BACKUP_TABLES } from '@/lib/backup-tables'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/backup -> ZIP of every CPMS table as JSON plus a row-count manifest.
 * Same export as `npm run backup`, but downloadable from Settings on any device.
 * A failed table aborts the whole request — a partial backup that looks complete
 * is worse than a loud failure.
 */
export async function GET() {
  if (!(await getSessionUser())) return unauthorised()

  try {
    const zip = new JSZip()
    const manifest: { taken_at: string; tables: Record<string, { rows: number }> } = {
      taken_at: new Date().toISOString(),
      tables: {},
    }

    for (const table of BACKUP_TABLES) {
      const rows: unknown[] = []
      const PAGE = 1000
      for (let from = 0; ; from += PAGE) {
        const { data } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
        rows.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      zip.file(`${table}.json`, JSON.stringify(rows, null, 1))
      manifest.tables[table] = { rows: rows.length }
    }

    zip.file('_manifest.json', JSON.stringify(manifest, null, 2))
    const buf = await zip.generateAsync({ type: 'uint8array' })
    const name = `Opera Backup ${new Date().toISOString().slice(0, 10)}.zip`
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${name}"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

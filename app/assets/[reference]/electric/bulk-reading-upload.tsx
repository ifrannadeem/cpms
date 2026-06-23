'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

export interface UploadMeter {
  meter_id: string
  meter_reference: string
  unit_label: string
  last_value: number | null
}

interface Props {
  meters: UploadMeter[]
}

interface ResultRow {
  unit: string
  status: 'ok' | 'skipped' | 'error'
  detail: string
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function BulkReadingUpload({ meters }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen]       = useState(false)
  const [date, setDate]       = useState(todayISO())
  const [busy, setBusy]       = useState(false)
  const [results, setResults] = useState<ResultRow[] | null>(null)

  function downloadTemplate() {
    const header = 'Unit,Meter Reference,Reading'
    const lines = meters
      .slice()
      .sort((a, b) => a.unit_label.localeCompare(b.unit_label, undefined, { numeric: true }))
      .map(m => `"${m.unit_label}","${m.meter_reference}",`)
    const csv = [header, ...lines].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meter-readings-template-${todayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseCsv(text: string): { ref: string; unit: string; reading: string }[] {
    const rows: { ref: string; unit: string; reading: string }[] = []
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
    for (let i = 0; i < lines.length; i++) {
      // crude CSV split that tolerates simple quotes; readings/units never contain commas
      const cells = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
      if (i === 0 && /unit/i.test(cells[0])) continue // skip header
      rows.push({ unit: cells[0] ?? '', ref: cells[1] ?? '', reading: cells[2] ?? '' })
    }
    return rows
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setResults(null)
    const text = await file.text()
    const parsed = parseCsv(text)

    const byRef   = new Map(meters.map(m => [m.meter_reference.toLowerCase(), m]))
    const byUnit  = new Map(meters.map(m => [m.unit_label.toLowerCase(), m]))

    const out: ResultRow[] = []
    for (const r of parsed) {
      if (r.reading === '') continue // blank reading rows are simply not submitted
      const meter = byRef.get(r.ref.toLowerCase()) ?? byUnit.get(r.unit.toLowerCase())
      const label = r.unit || r.ref
      if (!meter) { out.push({ unit: label, status: 'error', detail: 'No matching meter' }); continue }
      const reading = parseFloat(r.reading)
      if (isNaN(reading)) { out.push({ unit: label, status: 'error', detail: `Invalid reading "${r.reading}"` }); continue }

      const { data, error } = await supabase.rpc('fn_record_meter_reading', {
        p_meter_id: meter.meter_id, p_read_date: date, p_reading: reading,
      })
      if (error) {
        out.push({ unit: label, status: 'error', detail: error.message })
      } else {
        const d = data as { billed?: boolean; consumption?: number } | null
        out.push({
          unit: label, status: 'ok',
          detail: d?.consumption != null
            ? `${d.consumption.toLocaleString('en-GB')} kWh${d.billed ? ' billed' : ' recorded (not billed)'}`
            : 'recorded',
        })
      }
    }
    setBusy(false)
    setResults(out)
    if (fileRef.current) fileRef.current.value = ''
    router.refresh()
  }

  const okCount  = results?.filter(r => r.status === 'ok').length ?? 0
  const errCount = results?.filter(r => r.status === 'error').length ?? 0

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
        Bulk upload readings
      </button>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Bulk upload readings</h3>
        <button onClick={() => { setOpen(false); setResults(null) }} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
      </div>
      <p className="text-xs text-slate-400 mb-4 max-w-2xl">
        Download the template, fill in the <strong>Reading</strong> column (leave blank to skip a meter), then upload.
        All readings are recorded against the date you choose. Each billed meter raises a draft charge automatically.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <button onClick={downloadTemplate}
          className="px-4 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors">
          Download template ({meters.length} meters)
        </button>
        <label className="text-xs text-slate-500">Read date
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="block mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </label>
        <label className={`px-4 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors ${busy ? 'bg-slate-200 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
          {busy ? 'Uploading...' : 'Upload filled CSV'}
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={handleFile} />
        </label>
      </div>

      {results && (
        <div className="mt-4">
          <p className="text-xs font-medium text-slate-600 mb-2">
            {okCount} recorded{errCount > 0 && <span className="text-red-600">, {errCount} failed</span>}
          </p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {results.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-medium text-slate-800 whitespace-nowrap">{r.unit}</td>
                    <td className={`px-3 py-1.5 ${r.status === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

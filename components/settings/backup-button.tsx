'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

export function BackupButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function handleDownload() {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch('/api/backup')
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Backup failed (${res.status})`)
      }
      const blob = await res.blob()
      const name = `Opera Backup ${new Date().toISOString().slice(0, 10)}.zip`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      setDone(`Downloaded ${name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleDownload}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        <Download className="h-4 w-4" />
        {busy ? 'Preparing backup…' : 'Download backup'}
      </button>
      {done && <p className="text-sm text-emerald-600 mt-2">{done} — store it somewhere safe, off this device.</p>}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}

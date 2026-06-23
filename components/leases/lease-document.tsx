'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

interface Props {
  leaseId: string
  documentName: string | null
  fileReference: string | null
}

const inputClass =
  'border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function LeaseDocument({ leaseId, documentName, fileReference }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(documentName ?? '')
  const [url, setUrl] = useState(fileReference ?? '')

  async function handleSave() {
    if (!url.trim()) { setError('Paste the document link'); return }
    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('fn_attach_lease_document', {
      p_lease_id: leaseId,
      p_document_name: name.trim() || null,
      p_file_reference: url.trim(),
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setEditing(false)
      router.refresh()
    }
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-3">
        {fileReference ? (
          <a href={fileReference} target="_blank" rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 hover:underline font-medium">
            {documentName ?? 'View lease document'}
          </a>
        ) : (
          <span className="text-amber-600">Not attached</span>
        )}
        <button onClick={() => setEditing(true)}
          className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline">
          {fileReference ? 'Replace' : 'Attach'}
        </button>
      </span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <input type="text" placeholder="Document name (optional)" value={name}
        onChange={e => setName(e.target.value)} className={`${inputClass} w-48`} />
      <input type="url" placeholder="OneDrive / SharePoint link" value={url}
        onChange={e => setUrl(e.target.value)} className={`${inputClass} flex-1 min-w-64`} />
      <button onClick={handleSave} disabled={saving}
        className="px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button onClick={() => setEditing(false)}
        className="text-xs font-medium text-slate-500 hover:text-slate-800">Cancel</button>
      {error && <span className="text-red-600 text-xs w-full">{error}</span>}
    </span>
  )
}

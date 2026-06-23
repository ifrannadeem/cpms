'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase-browser'

interface Props {
  leaseId: string
  assetReference: string
  initialNotes: string
}

export default function NotesEditor({ leaseId, initialNotes }: Props) {
  const [notes, setNotes]   = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    await supabase
      .from('leases')
      .update({ notes })
      .eq('lease_id', leaseId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <textarea
        value={notes}
        onChange={e => { setNotes(e.target.value); setSaved(false) }}
        rows={5}
        className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
        placeholder="Add notes about this tenancy..."
      />
      <div className="flex items-center justify-end mt-2 gap-3">
        {saved && <span className="text-xs text-emerald-600">Saved</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-xs font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Notes'}
        </button>
      </div>
    </div>
  )
}
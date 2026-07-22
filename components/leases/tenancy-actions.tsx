'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const POUND = String.fromCharCode(0xA3)

interface Props {
  leaseId: string
  assetReference: string
  tenantName: string
  currentAnnualRent: number | null
  currentExpiry: string | null
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'

export default function TenancyActions({ leaseId, assetReference, tenantName, currentAnnualRent, currentExpiry }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'none' | 'review' | 'renew' | 'transfer' | 'end'>('none')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todayISO = new Date().toISOString().slice(0, 10)
  const [renew, setRenew] = useState({
    commencement: currentExpiry && currentExpiry > todayISO ? currentExpiry : todayISO,
    expiry: '',
    annualRent: currentAnnualRent != null ? String(currentAnnualRent) : '',
    reviewDate: '',
  })
  const [end, setEnd] = useState({ date: todayISO, reason: 'SURRENDER' })
  const d = new Date()
  const firstOfNextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)
  const [review, setReview] = useState({
    annualRent: currentAnnualRent != null ? String(currentAnnualRent) : '',
    effective: firstOfNextMonth,
    nextReview: '',
  })
  const [transfer, setTransfer] = useState({ legalName: '', tradingName: '', companyNumber: '', copyContacts: true })

  async function handleRenew() {
    if (!renew.expiry || !renew.annualRent) {
      setError('New expiry date and annual rent are required')
      return
    }
    if (!confirm(`Renew ${tenantName}'s lease from ${renew.commencement} to ${renew.expiry} at ${POUND}${renew.annualRent} pa?\n\nThe current lease will be closed and kept as history.`)) return
    setSaving(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('fn_renew_lease', {
      p_lease_id: leaseId,
      p_new_commencement: renew.commencement,
      p_new_expiry: renew.expiry,
      p_new_annual_rent: parseFloat(renew.annualRent),
      p_new_review_date: renew.reviewDate || null,
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else {
      router.push(`/assets/${assetReference}/leases/${data}`)
      router.refresh()
    }
  }

  async function handleReview() {
    if (!review.annualRent) {
      setError('Enter the new annual rent')
      return
    }
    if (!confirm(`Apply rent review for ${tenantName}: new rent ${POUND}${review.annualRent} pa effective ${review.effective}?\n\nThe lease continues unchanged - only the rent changes. Charges already raised are not affected.`)) return
    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('fn_apply_rent_review', {
      p_lease_id: leaseId,
      p_new_annual_rent: parseFloat(review.annualRent),
      p_effective_date: review.effective,
      p_next_review_date: review.nextReview || null,
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setMode('none')
      router.refresh()
    }
  }

  async function handleTransfer() {
    if (!transfer.legalName.trim()) {
      setError('Enter the new legal entity name')
      return
    }
    if (!confirm(`Transfer this lease from ${tenantName} to ${transfer.legalName.trim()}?\n\nThe previous entity and its charge/payment history are retained. Future charges bill the new entity.`)) return
    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('fn_reassign_lease_tenant', {
      p_lease_id: leaseId,
      p_new_legal_name: transfer.legalName.trim(),
      p_new_trading_name: transfer.tradingName.trim() || null,
      p_new_company_number: transfer.companyNumber.trim() || null,
      p_copy_contacts: transfer.copyContacts,
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setMode('none')
      router.refresh()
    }
  }

  async function handleEnd() {
    const scheduled = end.date > todayISO
    const message = scheduled
      ? `Record notice for ${tenantName}, ending ${end.date}?\n\nThe tenancy stays active and keeps billing (final month pro-rata) until then, and ends automatically on the date.`
      : `End ${tenantName}'s tenancy on ${end.date}?\n\nUnits become vacant and electric billing stops now. The lease is kept as history.`
    if (!confirm(message)) return
    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('fn_terminate_lease', {
      p_lease_id: leaseId,
      p_termination_date: end.date,
      p_reason: end.reason,
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
    } else if (scheduled) {
      // Still an active tenancy — stay on the page and reflect the recorded notice.
      setMode('none')
      router.refresh()
    } else {
      router.push(`/assets/${assetReference}`)
      router.refresh()
    }
  }

  return (
    <div>
      {mode === 'none' && (
        <div className="flex items-center gap-3">
          <button onClick={() => setMode('review')}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-500 transition-colors">
            Apply Rent Review
          </button>
          <button onClick={() => setMode('renew')}
            className="px-4 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors">
            Renew Lease
          </button>
          <button onClick={() => setMode('transfer')}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
            Transfer to New Entity
          </button>
          <button onClick={() => setMode('end')}
            className="px-4 py-2 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors">
            End Tenancy
          </button>
          <p className="text-xs text-slate-400 ml-2">
            Both actions keep the current lease as a historic record.
          </p>
        </div>
      )}

      {mode === 'review' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            A rent review changes the rent on the existing lease {String.fromCharCode(0x2014)} the unit reference and
            lease continue unchanged. The new rent applies to charges generated from the effective month onward.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl">
            <div>
              <label className="block text-xs text-slate-500 mb-1">New Annual Rent ({POUND} pa)</label>
              <input type="number" step="0.01" value={review.annualRent}
                onChange={e => setReview({ ...review, annualRent: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Effective From</label>
              <input type="date" value={review.effective}
                onChange={e => setReview({ ...review, effective: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Next Review (optional)</label>
              <input type="date" value={review.nextReview}
                onChange={e => setReview({ ...review, nextReview: e.target.value })} className={inputClass} />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex items-center gap-3">
            <button onClick={handleReview} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors">
              {saving ? 'Applying...' : 'Confirm Rent Review'}
            </button>
            <button onClick={() => setMode('none')}
              className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'renew' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">New Commencement</label>
              <input type="date" value={renew.commencement}
                onChange={e => setRenew({ ...renew, commencement: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">New Expiry</label>
              <input type="date" value={renew.expiry}
                onChange={e => setRenew({ ...renew, expiry: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Annual Rent ({POUND} pa)</label>
              <input type="number" step="0.01" value={renew.annualRent}
                onChange={e => setRenew({ ...renew, annualRent: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Next Review (optional)</label>
              <input type="date" value={renew.reviewDate}
                onChange={e => setRenew({ ...renew, reviewDate: e.target.value })} className={inputClass} />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex items-center gap-3">
            <button onClick={handleRenew} disabled={saving}
              className="px-5 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {saving ? 'Renewing...' : 'Confirm Renewal'}
            </button>
            <button onClick={() => setMode('none')}
              className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'transfer' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Use when the same occupier changes legal entity (e.g. sole trader incorporates). The lease and unit
            stay the same; charges and payments to date remain with the previous entity for clean records.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl">
            <div>
              <label className="block text-xs text-slate-500 mb-1">New Legal Name *</label>
              <input type="text" value={transfer.legalName}
                onChange={e => setTransfer({ ...transfer, legalName: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Trading Name</label>
              <input type="text" value={transfer.tradingName}
                onChange={e => setTransfer({ ...transfer, tradingName: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Company Number</label>
              <input type="text" value={transfer.companyNumber}
                onChange={e => setTransfer({ ...transfer, companyNumber: e.target.value })} className={inputClass} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={transfer.copyContacts}
              onChange={e => setTransfer({ ...transfer, copyContacts: e.target.checked })}
              className="accent-slate-700" />
            Copy contact details from the current entity
          </label>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex items-center gap-3">
            <button onClick={handleTransfer} disabled={saving}
              className="px-5 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {saving ? 'Transferring...' : 'Confirm Transfer'}
            </button>
            <button onClick={() => setMode('none')}
              className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'end' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 max-w-2xl">
            A <span className="font-medium">future date</span> records notice: the tenancy keeps billing (final month
            pro-rata) and ends automatically on that date. <span className="font-medium">Today</span> ends it now,
            vacating the unit and stopping electric billing.
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Termination Date</label>
              <input type="date" value={end.date}
                onChange={e => setEnd({ ...end, date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Reason</label>
              <select value={end.reason} onChange={e => setEnd({ ...end, reason: e.target.value })}
                className={`${inputClass} bg-white`}>
                <option value="SURRENDER">Surrender</option>
                <option value="EXPIRY">Expiry</option>
                <option value="BREAK_TENANT">Break - tenant</option>
                <option value="BREAK_LANDLORD">Break - landlord</option>
                <option value="FORFEITURE">Forfeiture</option>
              </select>
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex items-center gap-3">
            <button onClick={handleEnd} disabled={saving}
              className="px-5 py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-500 disabled:opacity-50 transition-colors">
              {saving ? 'Ending...' : 'Confirm End of Tenancy'}
            </button>
            <button onClick={() => setMode('none')}
              className="px-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

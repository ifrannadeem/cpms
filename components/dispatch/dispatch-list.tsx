'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'

export interface DraftView {
  tenantId: string
  tenantName: string
  to: string | null
  subject: string
  body: string
  attachments: string[]
  chargeCount: number
  sentDate: string | null
  sentMethod: string | null
}

function fmtDate(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface Props {
  assetId: string
  assetReference: string
  type: 'RENT' | 'ELECTRIC'
  month: string
  monthLabel: string
  live: boolean
  testTo: string | null
  drafts: DraftView[]
}

type Status = { state: 'idle' | 'sending' | 'sent' | 'error'; message?: string }

const DASH = String.fromCharCode(0x2014)

export default function DispatchList({ assetId, assetReference, type, month, monthLabel, live, testTo, drafts }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<Record<string, Status>>({})
  const [justSent, setJustSent] = useState<Set<string>>(new Set())
  const [sendingAll, setSendingAll] = useState(false)

  const withEmail = drafts.filter(d => d.to).length
  const canSend = (d: DraftView) => (live ? !!d.to : !!testTo)
  // Already dispatched: recorded server-side (live) or sent this session.
  const alreadySent = (d: DraftView) => !!d.sentDate || justSent.has(d.tenantId)

  async function sendOne(d: DraftView, confirmResend = false): Promise<boolean> {
    if (!canSend(d)) {
      setStatus(s => ({ ...s, [d.tenantId]: { state: 'error', message: live ? 'No email on file' : 'No test recipient configured' } }))
      return false
    }
    // Deliberate resend of an already-dispatched invoice needs an explicit confirm.
    if (confirmResend && live && alreadySent(d)) {
      const when = d.sentDate ? ` (already sent ${fmtDate(d.sentDate)})` : ' (already sent)'
      if (!window.confirm(`Resend this invoice to ${d.tenantName}${when}? They will receive it again.`)) return false
    }
    setStatus(s => ({ ...s, [d.tenantId]: { state: 'sending' } }))
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, type, month, tenantId: d.tenantId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`)
      setStatus(s => ({ ...s, [d.tenantId]: { state: 'sent', message: `Sent to ${(data.sentTo ?? []).join(', ')}` } }))
      setJustSent(prev => new Set(prev).add(d.tenantId))
      return true
    } catch (err) {
      setStatus(s => ({ ...s, [d.tenantId]: { state: 'error', message: err instanceof Error ? err.message : 'Send failed' } }))
      return false
    }
  }

  async function sendAll() {
    setSendingAll(true)
    for (const d of drafts) {
      // Send all skips anything already dispatched — re-running the batch is safe.
      // Deliberate resends are done one at a time with a confirm.
      if (!canSend(d) || alreadySent(d)) continue
      // Sequential: gentler on the mailbox and gives per-tenant progress.
      // eslint-disable-next-line no-await-in-loop
      await sendOne(d)
    }
    setSendingAll(false)
    if (live) router.refresh()
  }

  const sendableCount = drafts.filter(d => canSend(d) && !alreadySent(d)).length
  const sentCount = drafts.filter(alreadySent).length

  return (
    <>
      <div className={`mb-4 px-4 py-3 rounded-lg border text-sm ${live ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
        {live ? (
          <span><span className="font-semibold">Live mode.</span> Emails are sent to each tenant{String.fromCharCode(0x2019)}s own recipients and recorded as sent.</span>
        ) : (
          <span>
            <span className="font-semibold">Test mode.</span> Every email is sent to <span className="font-medium">{testTo ?? '(DISPATCH_TEST_TO not set)'}</span> with
            the intended tenant named inside, and nothing is marked as sent. To take this asset live, add{' '}
            <code className="text-xs">{assetReference}</code> to <code className="text-xs">DISPATCH_LIVE_ASSETS</code>.
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{drafts.length}</span> email{drafts.length !== 1 ? 's' : ''} for {monthLabel}
          <span className="mx-2 text-slate-300">{DASH}</span>
          <span className="font-semibold text-slate-900">{withEmail}</span> with an address on file
          {withEmail < drafts.length && <span className="text-amber-600 ml-2">{drafts.length - withEmail} missing</span>}
          {sentCount > 0 && <span className="text-emerald-600 ml-2">{sentCount} already sent</span>}
        </div>
        <button
          onClick={sendAll}
          disabled={sendingAll || sendableCount === 0}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors"
        >
          <Send className="h-4 w-4" />
          {sendingAll ? 'Sending…' : sendableCount === 0 ? 'All sent' : live ? `Send all unsent (${sendableCount})` : `Send all as test (${sendableCount})`}
        </button>
      </div>

      <div className="space-y-4">
        {drafts.map(d => {
          const st = status[d.tenantId] ?? { state: 'idle' }
          return (
            <div key={d.tenantId} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-semibold text-slate-900">{d.tenantName}</span>
                  {d.to ? (
                    <span className="text-slate-500 ml-2">{d.to}</span>
                  ) : (
                    <span className="text-amber-600 ml-2">no email on file {DASH} add it on the tenancy</span>
                  )}
                  {d.sentDate && st.state !== 'sent' && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700">
                      Sent {d.sentMethod ? d.sentMethod.charAt(0) + d.sentMethod.slice(1).toLowerCase() + ' ' : ''}{fmtDate(d.sentDate)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {st.state === 'sent' && <span className="text-xs text-emerald-600 font-medium">{st.message}</span>}
                  {st.state === 'error' && <span className="text-xs text-red-600 font-medium">{st.message}</span>}
                  <button
                    onClick={() => sendOne(d, true)}
                    disabled={st.state === 'sending' || !canSend(d)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {st.state === 'sending' ? 'Sending…' : alreadySent(d) ? 'Resend' : live ? 'Send' : 'Send test'}
                  </button>
                </div>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Subject</p>
                <p className="text-sm font-medium text-slate-800 mb-4">{d.subject}</p>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Body</p>
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans mb-4">{d.body}</pre>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Attachment{d.attachments.length !== 1 ? 's' : ''}</p>
                <div className="flex flex-wrap gap-2">
                  {d.attachments.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md text-xs text-slate-600">
                      <span className="text-red-500 font-semibold">PDF</span> {a}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

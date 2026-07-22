import nodemailer, { type Transporter } from 'nodemailer'

/**
 * SMTP sending for invoice dispatch. Credentials come from environment variables
 * (SMTP_USER / SMTP_PASS) set in Vercel — never stored in the repo or database.
 *
 * Safety default: dispatch is in TEST mode unless DISPATCH_LIVE === 'true'. In test
 * mode every email is routed to DISPATCH_TEST_TO with the intended recipient named,
 * and nothing is marked as sent. Going live is a single deliberate env change.
 */

export interface DispatchMode {
  live: boolean
  testTo: string | null
}

/**
 * Live vs test is per asset, so assets can go live on different dates (Southgate
 * August, Rosehill September). An asset is live if its reference is listed in
 * DISPATCH_LIVE_ASSETS (comma/space separated), or if DISPATCH_LIVE=true forces
 * everything live. Anything else stays in test mode (routed to DISPATCH_TEST_TO).
 */
export function dispatchMode(assetReference: string): DispatchMode {
  const forceAll = process.env.DISPATCH_LIVE === 'true'
  const liveAssets = (process.env.DISPATCH_LIVE_ASSETS || '')
    .split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
  return {
    live: forceAll || liveAssets.includes(assetReference),
    testTo: process.env.DISPATCH_TEST_TO?.trim() || null,
  }
}

let cached: Transporter | null = null

function transport(): Transporter {
  if (cached) return cached
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) {
    throw new Error('Email is not configured (SMTP_USER / SMTP_PASS missing).')
  }
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user, pass },
  })
  return cached
}

export interface OutgoingMail {
  to: string[]
  subject: string
  text: string
  attachments: { filename: string; content: Uint8Array }[]
}

export async function sendMail(mail: OutgoingMail): Promise<string> {
  const from = process.env.SMTP_USER!
  const info = await transport().sendMail({
    from,
    to: mail.to.join(', '),
    subject: mail.subject,
    text: mail.text,
    attachments: mail.attachments.map(a => ({ filename: a.filename, content: Buffer.from(a.content) })),
  })
  return info.messageId
}

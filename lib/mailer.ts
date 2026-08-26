import nodemailer, { type Transporter } from 'nodemailer'

/**
 * SMTP sending for invoice dispatch. Credentials come from environment variables set in
 * Vercel — never stored in the repo or the database.
 *
 * The sending address is per asset, so each property sends from the mailbox its tenants
 * would expect to hear from: Southgate's invoices come from Noblestone Partners (2i acts
 * as agent there), Rosehill's from 2i Investments as landlord. A reply then reaches the
 * right inbox, and the From address matches the entity named on the invoice.
 *
 * Per asset:  SMTP_USER_<REF> / SMTP_PASS_<REF>   e.g. SMTP_USER_ASSET_001
 * Fallback:   SMTP_USER / SMTP_PASS               used by any asset without its own
 *
 * Safety default: dispatch is in TEST mode unless the asset is listed live. In test mode
 * every email is routed to DISPATCH_TEST_TO with the intended recipient named, and
 * nothing is marked as sent. Going live is a single deliberate env change.
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

/** ASSET-001 -> ASSET_001, so a reference can name an environment variable. */
function envKey(assetReference: string): string {
  return assetReference.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

export interface Sender {
  user: string
  pass: string
}

/**
 * The mailbox this asset sends from. A per-asset address and its password must be set
 * together: pairing a property's address with the shared password would either fail to
 * authenticate or, worse, silently send from the wrong account, so a half-configured
 * asset is refused rather than guessed at.
 */
export function senderFor(assetReference: string): Sender {
  const key = envKey(assetReference)
  const scopedUser = process.env[`SMTP_USER_${key}`]?.trim()
  const scopedPass = process.env[`SMTP_PASS_${key}`]

  if (scopedUser && !scopedPass) {
    throw new Error(`SMTP_USER_${key} is set but SMTP_PASS_${key} is missing. Add the app password for that mailbox in Vercel.`)
  }
  if (scopedPass && !scopedUser) {
    throw new Error(`SMTP_PASS_${key} is set but SMTP_USER_${key} is missing. Add the sending address for that mailbox in Vercel.`)
  }
  if (scopedUser && scopedPass) return { user: scopedUser, pass: scopedPass }

  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS
  if (!user || !pass) {
    throw new Error(`Email is not configured for ${assetReference}. Set SMTP_USER_${key} / SMTP_PASS_${key}, or the shared SMTP_USER / SMTP_PASS.`)
  }
  return { user, pass }
}

/** The From address for display, or null if the asset has no mailbox configured. Never throws. */
export function senderAddress(assetReference: string): string | null {
  try {
    return senderFor(assetReference).user
  } catch {
    return null
  }
}

// One transport per mailbox, so two assets sending from different accounts do not share
// a connection authenticated as the wrong one.
const transports = new Map<string, Transporter>()

function transport(sender: Sender): Transporter {
  const existing = transports.get(sender.user)
  if (existing) return existing
  const created = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: sender.user, pass: sender.pass },
  })
  transports.set(sender.user, created)
  return created
}

export interface OutgoingMail {
  /** Which property's mailbox to send from. */
  assetReference: string
  to: string[]
  subject: string
  text: string
  attachments: { filename: string; content: Uint8Array }[]
}

export async function sendMail(mail: OutgoingMail): Promise<{ messageId: string; from: string }> {
  const sender = senderFor(mail.assetReference)
  const info = await transport(sender).sendMail({
    from: sender.user,
    to: mail.to.join(', '),
    subject: mail.subject,
    text: mail.text,
    attachments: mail.attachments.map(a => ({ filename: a.filename, content: Buffer.from(a.content) })),
  })
  return { messageId: info.messageId, from: sender.user }
}

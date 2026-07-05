// One-command data backup for the Free plan (no automated Supabase backups).
//
//   npm run backup
//
// Exports every CPMS table to Backups/YYYY-MM-DD/<table>.json plus a manifest
// with row counts. Structure (tables/functions/views) is already in git under
// supabase/schema/ and supabase/migrations/ — this captures the DATA.
// Restore path: rebuild schema from the repo, then insert each JSON file in the
// order below (parents before children).
//
// Backups/ is git-ignored: it contains tenant personal data and bank references.
// Copy the dated folder somewhere off this machine (e.g. an encrypted drive).

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Minimal .env.local parser — no extra dependency needed.
const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

// Insert order for restore: parents before children.
// KEEP IN SYNC with lib/backup-tables.ts (the Settings -> Download backup button).
// tests/backup-tables.test.ts fails if the lists drift.
const TABLES = [
  'document_templates',
  'portfolios',
  'tenants',
  'contractors',
  'assets',
  'utility_rates',
  'blocks',
  'units',
  'meters',
  'leases',
  'lease_units',
  'charge_profiles',
  'rent_incentives',
  'charge_records',
  'meter_reads',
  'payments',
  'payment_allocations',
  'compliance_records',
  'maintenance_events',
  'documents',
  'document_links',
  'significant_events',
  'event_links',
  'issuing_entities',
  'supplier_bills',
  'arrears_actions',
  'tenant_activity',
  'vat_config',
]

const stamp = new Date().toISOString().slice(0, 10)
const dir = join(process.cwd(), 'Backups', stamp)
mkdirSync(dir, { recursive: true })

const manifest = { taken_at: new Date().toISOString(), project: url, tables: {} }
let failed = false

for (const table of TABLES) {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) {
      console.error(`FAILED ${table}: ${error.message}`)
      manifest.tables[table] = { error: error.message }
      failed = true
      break
    }
    rows.push(...data)
    if (data.length < PAGE) break
  }
  if (!manifest.tables[table]) {
    writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 1))
    manifest.tables[table] = { rows: rows.length }
    console.log(`${table.padEnd(22)} ${rows.length} rows`)
  }
}

writeFileSync(join(dir, '_manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`\nBackup written to ${dir}`)
if (failed) {
  console.error('One or more tables FAILED - this backup is incomplete.')
  process.exit(1)
}

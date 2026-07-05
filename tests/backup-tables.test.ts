import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES } from '../lib/backup-tables'

// The Settings download (lib/backup-tables.ts) and the offline script
// (scripts/backup.mjs) must export exactly the same tables in the same
// restore order. This test fails if the lists drift.

describe('backup table lists', () => {
  it('scripts/backup.mjs matches lib/backup-tables.ts', () => {
    const script = readFileSync(join(__dirname, '..', 'scripts', 'backup.mjs'), 'utf-8')
    const block = script.match(/const TABLES = \[([\s\S]*?)\]/)
    expect(block, 'TABLES array not found in scripts/backup.mjs').toBeTruthy()
    const scriptTables = [...block![1].matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    expect(scriptTables).toEqual([...BACKUP_TABLES])
  })
})

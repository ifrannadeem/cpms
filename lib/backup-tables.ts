/**
 * Every CPMS table, in restore order (parents before children).
 * Used by /api/backup (Settings -> Download backup) and mirrored in
 * scripts/backup.mjs (offline fallback). tests/backup-tables.test.ts fails
 * if the two lists drift — update both together when adding a table.
 */
export const BACKUP_TABLES = [
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
] as const

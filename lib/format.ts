const DASH = String.fromCharCode(0x2014)

/**
 * Canonical display label for a single unit reference. Previously re-implemented in
 * 16 files with drift (some missed Southgate suites, some kept leading zeros, and
 * the combined unit RBC-A-4-5 rendered as "Unit 5").
 *
 * Verified against every live unit_reference (2026-07-05):
 *   SGP-I-1.5   -> Suite 1.5      PTP-10     -> Unit 10     RBC-A-13A -> Unit 13A
 *   RBC-A-4-5   -> Unit 4-5       RBC-A-A    -> Unit A      SGP-6A    -> Unit 6A
 *   RBC-A-010   -> Unit 10 (leading zeros stripped)         PTP-F1    -> Unit F1
 */
export function unitLabel(ref: string | null | undefined): string {
  if (!ref || !ref.trim()) return DASH
  const r = ref.trim()
  if (r.startsWith('SGP-I-')) return 'Suite ' + r.replace('SGP-I-', '')
  const parts = r.split('-')
  // 4+ segments = a combined unit whose own reference contains a dash (RBC-A-4-5)
  const last = parts.length >= 4 ? parts.slice(-2).join('-') : (parts.pop() ?? r)
  const m = last.match(/^0*(\d.*)$/)
  return 'Unit ' + (m ? m[1] : last)
}

/**
 * Label for a comma-separated list of references (e.g. v_lease_register.unit_references).
 * Shares the prefix when all parts agree: "Unit 10, 11" / "Suite 1.1, 1.2";
 * mixed lists fall back to full labels: "Unit 29, Suite 1.5".
 */
export function unitLabels(refs: string | null | undefined): string {
  if (!refs || !refs.trim()) return DASH
  const labels = refs.split(',').map(s => unitLabel(s))
  if (labels.length <= 1) return labels[0] ?? DASH
  const prefixes = new Set(labels.map(l => l.split(' ')[0]))
  if (prefixes.size === 1) {
    const prefix = labels[0].split(' ')[0]
    return prefix + ' ' + labels.map(l => l.slice(prefix.length + 1)).join(', ')
  }
  return labels.join(', ')
}

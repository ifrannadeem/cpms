import { describe, expect, it } from 'vitest'
import { unitLabel, unitLabels } from '../lib/format'

// Canonical labels, verified against every live unit_reference on 2026-07-05.

describe('unitLabel', () => {
  it('handles every live reference scheme', () => {
    expect(unitLabel('PTP-10')).toBe('Unit 10')
    expect(unitLabel('PTP-F1')).toBe('Unit F1')
    expect(unitLabel('RBC-A-13A')).toBe('Unit 13A')
    expect(unitLabel('RBC-A-A')).toBe('Unit A')
    expect(unitLabel('RBC-B-30')).toBe('Unit 30')
    expect(unitLabel('SGP-6A')).toBe('Unit 6A')
    expect(unitLabel('SGP-I-2.10')).toBe('Suite 2.10')
  })

  it('renders the combined unit RBC-A-4-5 correctly (was "Unit 5")', () => {
    expect(unitLabel('RBC-A-4-5')).toBe('Unit 4-5')
  })

  it('strips leading zeros', () => {
    expect(unitLabel('RBC-001-010')).toBe('Unit 10')
  })

  it('renders a dash for missing references', () => {
    expect(unitLabel(null)).toBe('—')
    expect(unitLabel('')).toBe('—')
  })
})

describe('unitLabels', () => {
  it('dedupes a shared prefix', () => {
    expect(unitLabels('RBC-001-010, RBC-001-011')).toBe('Unit 10, 11')
    expect(unitLabels('SGP-I-1.1, SGP-I-1.2')).toBe('Suite 1.1, 1.2')
  })

  it('keeps full labels for mixed prefixes', () => {
    expect(unitLabels('RBC-B-29, SGP-I-1.5')).toBe('Unit 29, Suite 1.5')
  })

  it('passes single references through', () => {
    expect(unitLabels('RBC-A-4-5')).toBe('Unit 4-5')
  })
})

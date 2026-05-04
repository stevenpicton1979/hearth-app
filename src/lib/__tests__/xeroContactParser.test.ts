import { describe, it, expect } from 'vitest'
import { parseXeroContactName } from '../xeroContactParser'

describe('parseXeroContactName', () => {
  it('extracts first pipe-segment from a full Xero description', () => {
    expect(parseXeroContactName('Steven Picton | Mar 2026 | BHT')).toBe('Steven Picton')
  })

  it('returns the whole string when no pipe is present', () => {
    expect(parseXeroContactName('Steven Picton')).toBe('Steven Picton')
  })

  it('trims surrounding whitespace from the contact name', () => {
    expect(parseXeroContactName('  Nicola Picton  | Apr 2026 ')).toBe('Nicola Picton')
  })

  it('returns null for null input', () => {
    expect(parseXeroContactName(null)).toBeNull()
  })

  it('returns null for empty string input', () => {
    expect(parseXeroContactName('')).toBeNull()
  })
})

/**
 * Replicates the Python clean_merchant() function exactly.
 * Used during CSV import to normalise merchant names.
 */
export function cleanMerchant(desc: string): string {
  let s = desc.trim()

  // Direct Debit pattern
  const ddMatch = s.match(/^Direct Debit \d+\s+(.+)/i)
  if (ddMatch) {
    s = ddMatch[1]
    // Remove trailing token with 4+ digits
    s = s.replace(/\s+\S*\d{4,}\S*$/, '')
    // Remove trailing token with underscore
    s = s.replace(/\s+\S+_\S+$/, '')
  } else {
    // Split on 2+ spaces, take first part
    s = s.split(/\s{2,}/)[0]
    // Remove trailing token with 6+ digits
    s = s.replace(/\s+\S*\d{6,}\S*$/, '')
  }

  // Normalise whitespace and uppercase
  return s.replace(/\s+/g, ' ').trim().toUpperCase()
}

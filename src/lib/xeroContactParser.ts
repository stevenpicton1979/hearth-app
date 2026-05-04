/**
 * Parse Xero contact name from a raw_description that may contain pipe-separated metadata.
 *
 * Xero stores payment descriptions in the format:
 *   "Steven Picton | Mar 2026 | BHT"
 * The first pipe-segment is the contact name; subsequent segments are memo/reference.
 *
 * When no pipe is present, the whole string is the contact name.
 * Returns null for empty/null input.
 */
export function parseXeroContactName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const name = raw.split('|')[0].trim()
  return name || null
}

export const TRANSFER_PATTERNS: RegExp[] = [
  /^transfer\b/i,
  /\btransfer to\b/i,
  /\btransfer from\b/i,
  /^atm\b/i,
  /\batm withdrawal\b/i,
  /\batm cash\b/i,
  /^eft\b/i,
  /^osko\b/i,
  /\bnpe\b/i,
  /\bpayid\b/i,
  /^pay anyone\b/i,
  /^internal transfer\b/i,
  /^sweep\b/i,
  /^auto transfer\b/i,
  /^scheduled transfer\b/i,
  /\bself transfer\b/i,
  /\bloan repayment\b/i,
  /\bmortgage repayment\b/i,
  /\bln repay\b/i,
  /^refund\b/i,
  /\bcredit card payment\b/i,
  /\bcard payment\b/i,
]

export function isTransfer(description: string): boolean {
  const lower = description.toLowerCase()
  return TRANSFER_PATTERNS.some(pattern => pattern.test(lower))
}

export type SubscriptionStatus = 'confirmed' | 'dismissed' | 'candidate'

/**
 * Classify a merchant's subscription status from the merchant_mappings table.
 * @param merchant  - merchant name to look up
 * @param mappings  - Map<merchant, classification> built from merchant_mappings rows
 */
export function categoriseSubscriptionStatus(
  merchant: string,
  mappings: Map<string, string | null>
): SubscriptionStatus {
  if (!mappings.has(merchant)) return 'candidate'
  const classification = mappings.get(merchant)
  if (classification === 'Subscription') return 'confirmed'
  if (classification === 'Not a subscription') return 'dismissed'
  return 'candidate'  // null or any other value → uncategorised
}

export interface MerchantSubscriptionLink {
  merchant: string
  subscription_id: string
}

/**
 * Build a merchant-string → subscription_id lookup from subscription_merchants rows.
 * Case-sensitive: merchant strings must match exactly as stored in the DB.
 */
export function buildMerchantToSubscriptionMap(
  rows: MerchantSubscriptionLink[]
): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of rows) {
    map.set(row.merchant, row.subscription_id)
  }
  return map
}

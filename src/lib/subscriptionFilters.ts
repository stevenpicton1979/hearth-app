import { DetectedSubscription } from './types'

export interface SubscriptionFilterContext {
  dismissedMerchants: Set<string>
  activeMerchantToSubId: Map<string, string>  // only is_active=true subs
  subscriptionNames: Map<string, string>       // subscription_id → name
}

export function applySubscriptionFilters(
  detected: DetectedSubscription[],
  ctx: SubscriptionFilterContext
): DetectedSubscription[] {
  return detected
    .filter(sub => !sub.merchants.some(m => ctx.dismissedMerchants.has(m)))
    .map(sub => {
      if (sub.subscription_id) {
        const name = ctx.subscriptionNames.get(sub.subscription_id)
        if (name) return { ...sub, display_name: name }
      }
      return sub
    })
}

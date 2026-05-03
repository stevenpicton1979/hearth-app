export const DEFAULT_HOUSEHOLD_ID = '00000000-0000-0000-0000-000000000001'

export const CLASSIFICATIONS = [
  'Annual Subscription', 'Monthly Subscription', 'Fortnightly Subscription',
  'Weekly Subscription', 'Regular Visit', 'One-off Purchase', 'Business Expense', 'Ignore',
] as const
export type Classification = typeof CLASSIFICATIONS[number]

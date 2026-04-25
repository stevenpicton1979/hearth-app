export const DEFAULT_HOUSEHOLD_ID = '00000000-0000-0000-0000-000000000001'

export const CATEGORIES = [
  'Business', 'Charity & Donations', 'Clothing & Apparel', 'Director Income', 'Eating Out',
  'Education', 'Entertainment', 'Family', 'Food & Groceries', 'Government & Tax', 'Health & Fitness',
  'Holiday', 'Household', 'Insurance', 'Medical', 'Mortgage', 'Personal Care',
  'Payroll Expense', 'Pets', 'Salary', 'Shopping', 'Technology', 'Transport', 'Travel', 'Utilities', 'Other',
] as const
export type Category = typeof CATEGORIES[number]

export const CLASSIFICATIONS = [
  'Annual Subscription', 'Monthly Subscription', 'Fortnightly Subscription',
  'Weekly Subscription', 'Regular Visit', 'One-off Purchase', 'Business Expense', 'Ignore',
] as const
export type Classification = typeof CLASSIFICATIONS[number]

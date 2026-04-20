export const DEFAULT_HOUSEHOLD_ID = '00000000-0000-0000-0000-000000000001'

export const CATEGORIES = [
  'Transport',
  'Eating Out',
  'Food & Groceries',
  'Entertainment',
  'Technology',
  'Health & Fitness',
  'Medical',
  'Insurance',
  'Household',
  'Shopping',
  'Education',
  'Travel',
  'Mortgage',
  'Utilities',
  'Charity & Donations',
  'Pets',
  'Business',
  'Personal Care',
  'Income',
  'Transfer',
  'Other',
] as const

export type Category = typeof CATEGORIES[number]

export const CLASSIFICATIONS = [
  'Need',
  'Want',
  'Saving',
  'Income',
  'Transfer',
  'Monthly Subscription',
  'Annual Subscription',
  'Quarterly Subscription',
  'Weekly Subscription',
] as const

export type Classification = typeof CLASSIFICATIONS[number]

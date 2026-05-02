/**
 * Canonical category taxonomy for Hearth.
 *
 * The full classification of a transaction is expressed by four fields together:
 *   owner         → realm      (Business | Steven | Nicola | Joint)
 *   isIncome      → direction  (true = Income, false = Expense)
 *   isSubscription → sub-bucket within Expenses
 *   category      → leaf node  (the specific type — this list)
 *
 * Transfer rules use category: null — that is the only permitted null.
 * New categories must be added here before they can be used in rules or the pipeline.
 */

export const CATEGORIES = [
  // Business — Income
  'Business Revenue',

  // Business — Expenses (non-subscription)
  'Accounting',       // accountants, bookkeepers (Bell Partners)
  'Office Expenses',  // general supplies, admin, catch-all BHT expenses
  'Technology',       // software, cloud, SaaS (non-subscription one-offs)
  'Meals',            // food/drink on business card
  'Travel',           // accommodation
  'Transport',        // Uber, taxis, fuel, motor vehicle
  'Payroll Expense',  // wages, superannuation
  'Government & Tax', // ATO payments, income tax

  // Business — Expenses (subscription, isSubscription: true)
  // 'Technology' and 'Entertainment' reused from below

  // Personal — Income
  'Salary',           // PAYG wages into personal account
  'Director Income',  // director's fees / profit distributions (taxed at year-end)

  // Personal — Expenses
  'Groceries',
  'Eating Out',
  'Entertainment',    // gaming, media, streaming, subscriptions
  'Housing',          // mortgage, rent
  'Utilities',        // energy, water, gas
  'Internet & Phone', // NBN, mobile plans
  'Healthcare',       // medical, pharmacy, health insurance
  'Insurance',        // home, car, life insurance
  'Education',
  'Shopping',         // general retail, clothing
  'Childcare',
  'Pets',
] as const

export type Category = typeof CATEGORIES[number]

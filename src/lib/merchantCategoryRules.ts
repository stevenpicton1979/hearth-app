/**
 * Explicit, named merchant categorisation rules.
 *
 * These rules are the single source of truth for well-known merchant patterns.
 * Add rules here — not in autoCategory.ts keyword arrays — when you want a
 * decision that is:
 *   • named (you can see why a transaction was categorised a certain way)
 *   • testable (each rule has a dedicated test)
 *   • changeable (one place to update, change propagates everywhere)
 *
 * Rules are evaluated in order. First match wins.
 * Return null from applyMerchantCategoryRules if no rule matches — the caller
 * then falls through to keyword guessing or GL account hints.
 *
 * ─── Category conventions ─────────────────────────────────────────────────────
 *
 * All category strings must be members of the Category union in src/lib/categories.ts.
 * Transfer rules use category: null — that is the only permitted null.
 *
 * Business Revenue = BHT income (Oncore, Crosslateral, invoices). isIncome: true.
 * Accounting       = accountants and bookkeepers (Bell Partners).
 * Office Expenses  = general BHT operating costs; catch-all for non-specific expenses.
 * Entertainment    = gaming/media on business card. owner: 'Business'.
 * Technology       = cloud/SaaS subscriptions on business card. owner: 'Business'.
 * Salary           = PAYG wages into personal account.
 * Director Income  = director's fees / profit distributions (taxed at year-end).
 *                    owner: 'Joint' — split decided by accountant.
 *
 * isIncome: null = inherit from transaction amount sign. Only use true/false when
 * the match condition already knows the direction (e.g. checks ctx.isIncome).
 * For transfer rules (isTransfer: true), isIncome is always null — the is_transfer
 * flag is the authoritative classification; direction is irrelevant.
 */

import type { Category } from './categories'

export interface RuleContext {
  /** Used by income/transfer rules to gate on transaction direction. */
  isIncome: boolean
  /** Xero chart-of-accounts GL account name — used by GL-based rules. */
  glAccount?: string | null
  /** Account owner from the accounts table — reserved for future owner-specific rules. */
  accountOwner?: string | null
}

export interface MerchantCategoryRule {
  /** Short identifier used in logs and test descriptions */
  name: string
  /** Human-readable explanation of the rule */
  description: string
  /** Return true if this rule applies to the given merchant + context */
  match: (merchant: string, ctx: RuleContext) => boolean
  /** Full classification fingerprint for this rule */
  output: {
    /** Category to assign. null = no category (always paired with isTransfer: true) */
    category: Category | null
    /** null = inherit from amount sign; true/false = this rule asserts the direction */
    isIncome: boolean | null
    isTransfer: boolean
    isSubscription: boolean
    owner: 'Steven' | 'Nicola' | 'Joint' | 'Business' | null
  }
}

export interface RuleResult {
  ruleName: string
  category: Category | null
  isIncome: boolean | null
  isTransfer: boolean
  isSubscription: boolean
  owner: 'Steven' | 'Nicola' | 'Joint' | 'Business' | null
}

export const MERCHANT_CATEGORY_RULES: MerchantCategoryRule[] = [
  // ─── Government & Tax ────────────────────────────────────────────────────────

  {
    name: 'ato_payments',
    description: 'ATO / Tax Office payments from any source → Government & Tax',
    match: (m) => /\bato\b|tax\s+office|taxation\s+office/i.test(m),
    output: { category: 'Government & Tax', isIncome: null, isTransfer: false, isSubscription: false, owner: null },
  },

  // ─── Travel ──────────────────────────────────────────────────────────────────

  {
    name: 'airbnb',
    description: 'Airbnb accommodation bookings → Travel',
    match: (m) => /^airbnb/i.test(m),
    output: { category: 'Travel', isIncome: null, isTransfer: false, isSubscription: false, owner: null },
  },

  // ─── Transport ───────────────────────────────────────────────────────────────

  {
    name: 'uber',
    description: 'Uber rides → Transport',
    match: (m) => /^uber\b/i.test(m),
    output: { category: 'Transport', isIncome: null, isTransfer: false, isSubscription: false, owner: null },
  },

  // ─── Business ────────────────────────────────────────────────────────────────

  {
    name: 'bell_partners',
    description: 'Bell Partners accounting firm → Accounting',
    match: (m) => /bell\s*partners/i.test(m),
    output: { category: 'Accounting', isIncome: null, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  {
    name: 'invoice_income',
    description: 'Generic "INVOICE" description on income transactions → Business Revenue',
    match: (m, ctx) => /^invoice$/i.test(m) && ctx.isIncome,
    output: { category: 'Business Revenue', isIncome: true, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  {
    name: 'oncore_income',
    description:
      'Oncore client payments into Brisbane Health Tech → Business income. ' +
      'Oncore is a contractor management company that processes Steve\'s invoices ' +
      'and remits client fees to BHT. Raw descriptions often include an invoice ' +
      'reference prefix, e.g. "E41900232233 Oncore Contracto". Matches on income only.',
    match: (m, ctx) => /oncore/i.test(m) && ctx.isIncome,
    output: { category: 'Business Revenue', isIncome: true, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  {
    name: 'crosslateral_income',
    description:
      'Crosslateral client payments into Brisbane Health Tech → Business income. ' +
      'Crosslateral is a direct BHT client; their invoice payments arrive as income. ' +
      'Matches on income only.',
    match: (m, ctx) => /crosslateral/i.test(m) && ctx.isIncome,
    output: { category: 'Business Revenue', isIncome: true, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  // ─── Payroll ─────────────────────────────────────────────────────────────────

  {
    name: 'superannuation_payable',
    description: 'Xero GL account "Superannuation Payable" — SGC super payments → Payroll Expense',
    match: (m, ctx) => /superannuation payable/i.test(ctx.glAccount ?? ''),
    output: { category: 'Payroll Expense', isIncome: null, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  {
    name: 'income_tax_provision',
    description: 'Xero GL account matching income tax provision — company tax payments → Government & Tax',
    match: (m, ctx) => /income tax/i.test(ctx.glAccount ?? ''),
    output: { category: 'Government & Tax', isIncome: null, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  // ─── Subscriptions & Digital Services (Business card) ───────────────────────

  {
    name: 'xero_misc_code',
    description:
      'Xero "MIS" reference code — Miscellaneous account. Catches pre-fix transactions ' +
      'synced before cleanXeroMerchant learned to skip short Xero codes in the reference field. ' +
      'New syncs produce real contact names which are caught by the specific rules below.',
    match: (m) => m === 'MIS',
    output: { category: 'Office Expenses', isIncome: null, isTransfer: false, isSubscription: false, owner: null },
  },

  {
    name: 'google_one',
    description: 'Google One cloud storage subscription on business card → Technology',
    match: (m) => /google\s+one/i.test(m),
    output: { category: 'Technology', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'steam_games',
    description: 'Steamgames / Steam game purchases on business card → Entertainment',
    match: (m) => /steamgames/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  {
    name: 'xbox',
    description: 'Microsoft Xbox Game Pass subscription and purchases on business card → Entertainment',
    match: (m) => /xbox/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'spotify',
    description: 'Spotify music subscription on business card → Entertainment (matches anywhere in merchant name)',
    match: (m) => /spotify/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  // ─── Batch 5: Streaming & SaaS (Business card) ───────────────────────────────

  {
    name: 'netflix_streaming',
    description: 'Netflix streaming subscription on business card → Entertainment',
    match: (m) => /netflix/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'disney_plus',
    description: 'Disney+ streaming subscription on business card → Entertainment',
    match: (m) => /disney\+|disney\s*plus|disneyplus/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'amazon_prime_video',
    description: 'Amazon Prime / Prime Video subscription on business card → Entertainment. Avoids matching Amazon retail (AMAZON.COM.AU).',
    match: (m) => /amazon.*prime|prime\s*video/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'youtube_premium',
    description: 'YouTube Premium / YouTube subscription on business card → Entertainment',
    match: (m) => /youtube/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'playstation_network',
    description: 'PlayStation Network / PS Store subscription on business card → Entertainment',
    match: (m) => /playstation|^psn\b/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'nintendo_eshop',
    description: 'Nintendo eShop / Nintendo Switch Online on business card → Entertainment',
    match: (m) => /nintendo/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'crunchyroll',
    description: 'Crunchyroll anime streaming on business card → Entertainment',
    match: (m) => /crunchyroll/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'audible',
    description: 'Audible audiobook subscription on business card → Entertainment',
    match: (m) => /audible/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'kayo_sports',
    description: 'Kayo Sports streaming subscription on business card → Entertainment',
    match: (m) => /\bkayo\b/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'adobe_subscription',
    description: 'Adobe Creative Cloud / Adobe subscriptions on business card → Technology',
    match: (m) => /\badobe\b/i.test(m),
    output: { category: 'Technology', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'canva_subscription',
    description: 'Canva design platform subscription on business card → Technology',
    match: (m) => /\bcanva\b/i.test(m),
    output: { category: 'Technology', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'dropbox_subscription',
    description: 'Dropbox cloud storage subscription on business card → Technology',
    match: (m) => /dropbox/i.test(m),
    output: { category: 'Technology', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'notion_subscription',
    description: 'Notion productivity app subscription on business card → Technology',
    match: (m) => /\bnotion\b/i.test(m),
    output: { category: 'Technology', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  // ─── Personal Income ─────────────────────────────────────────────────────────

  {
    name: 'salary_nicola_education_qld',
    description: "Nicola's salary from Education Queensland — always a credit, always hers",
    match: (m, ctx) => /salary education qld/i.test(m) && ctx.isIncome,
    output: { category: 'Salary', isIncome: true, isTransfer: false, isSubscription: false, owner: 'Nicola' },
  },

  // ─── Personal Transport ──────────────────────────────────────────────────────

  {
    name: 'translink',
    description: 'Translink public transport → Transport',
    match: (m) => /translink/i.test(m),
    output: { category: 'Transport', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'qld_transport_rego',
    description: 'Queensland Department of Transport — car registration → Government & Tax',
    match: (m) => /qld department of transport/i.test(m),
    output: { category: 'Government & Tax', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // ─── Personal Education ──────────────────────────────────────────────────────

  {
    name: 'mansfield_state_high',
    description: 'Mansfield State High school canteen purchases — not school fees → Eating Out',
    match: (m) => /mansfield state high/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'learning_ladders',
    description: 'Learning Ladders educational app subscription → Education',
    match: (m) => /learningladders/i.test(m),
    output: { category: 'Education', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' },
  },

  // ─── Personal Health & Fitness ───────────────────────────────────────────────

  {
    name: 'fitness_passport',
    description: 'Fitness Passport gym access program → Health & Fitness',
    match: (m) => /fitness passport/i.test(m),
    output: { category: 'Health & Fitness', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' },
  },

  {
    name: 'fitstop',
    description: 'Fitstop gym franchise subscription → Health & Fitness',
    match: (m) => /^fitstop/i.test(m),
    output: { category: 'Health & Fitness', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' },
  },

  {
    name: 'fitbox',
    description: 'Fitbox boxing gym subscription → Health & Fitness',
    match: (m) => /fitbox/i.test(m),
    output: { category: 'Health & Fitness', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' },
  },

  {
    name: 'ironfist_gym',
    description: 'Iron Fist Gym — covers EZI*THEIRONFISTGYM and IRONFIST GYM → Health & Fitness',
    match: (m) => /ironfist/i.test(m),
    output: { category: 'Health & Fitness', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // ─── Personal Insurance ──────────────────────────────────────────────────────

  {
    name: 'hcf_health_insurance',
    description: 'HCF health insurance direct debit → Insurance (not Healthcare)',
    match: (m) => /hcfhealth/i.test(m),
    output: { category: 'Insurance', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' },
  },

  {
    name: 'hospitals_contribution',
    description: 'The Hospitals Contribution Fund — health insurance, not Medical → Insurance',
    match: (m) => /hospitals contri/i.test(m),
    output: { category: 'Insurance', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' },
  },

  {
    name: 'clearview_insurance',
    description: 'ClearView life/income protection insurance direct debit → Insurance',
    match: (m) => /clearview/i.test(m),
    output: { category: 'Insurance', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' },
  },

  // ─── Personal Utilities & Government ────────────────────────────────────────

  {
    name: 'qld_urban_utilities',
    description: 'QLD Urban Utilities water bill → Utilities',
    match: (m) => /qld urban util/i.test(m),
    output: { category: 'Utilities', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'brisbane_city_council',
    description: 'Brisbane City Council rates → Government & Tax (not Utilities)',
    match: (m) => /brisbane city co/i.test(m),
    output: { category: 'Government & Tax', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'bcc_rates',
    description: 'BCC rates via BPAY → Government & Tax',
    match: (m) => /bcc rates/i.test(m),
    output: { category: 'Government & Tax', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // ─── Personal Food ───────────────────────────────────────────────────────────

  {
    name: 'the_bread_corner',
    description: 'The Bread Corner local bakery → Food & Groceries (not Business)',
    match: (m) => /bread corner/i.test(m),
    output: { category: 'Food & Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // ─── Personal Technology ─────────────────────────────────────────────────────

  {
    name: 'apple_bill',
    description: 'Apple.com/bill — App Store / iCloud subscriptions → Technology',
    match: (m) => /apple\.com\/bill/i.test(m),
    output: { category: 'Technology', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' },
  },


  // ─── Personal Groceries ──────────────────────────────────────────────────────

  {
    name: 'aldi',
    description: 'ALDI supermarket purchases → Groceries',
    match: (m) => /^aldi\b/i.test(m),
    output: { category: 'Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'woolworths',
    description: 'Woolworths supermarket purchases (any store number) → Groceries',
    match: (m) => /^woolworths\b/i.test(m),
    output: { category: 'Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'coles',
    description: 'Coles supermarket — covers COLES, COLES 4574, COLES ONLINE, etc → Groceries',
    match: (m) => /^coles\b/i.test(m),
    output: { category: 'Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'iga',
    description: "IGA supermarket — covers IGA LOCAL GROCER, CHRIS\' IGA CARINA, etc → Groceries",
    match: (m) => /\biga\b/i.test(m),
    output: { category: 'Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'the_source_bulk_foods',
    description: 'The Source Bulk Foods health/bulk food store → Groceries',
    match: (m) => /source bulk food/i.test(m),
    output: { category: 'Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'hanaro_trading',
    description: 'Hanaro Trading — Asian grocery/food store in Carindale → Food & Groceries',
    match: (m) => /hanaro trading/i.test(m),
    output: { category: 'Food & Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // ─── Personal Eating Out ─────────────────────────────────────────────────────

  {
    name: 'little_genovese',
    description: 'Little Genovese restaurant Coorparoo → Eating Out',
    match: (m) => /little genovese/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'guzman_y_gomez',
    description: 'Guzman y Gomez Mexican fast food → Eating Out',
    match: (m) => /guzman y gomez/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'kfc',
    description: 'KFC (any store) → Eating Out',
    match: (m) => /^kfc\b/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'mcdonalds',
    description: "McDonald\'s (any store) → Eating Out",
    match: (m) => /^mc\s*donalds/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'old_mr_rabbit',
    description: 'Old Mr Rabbit café → Eating Out',
    match: (m) => /old mr rabbit/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'asian_delights',
    description: 'Asian Delights restaurant Carindale → Eating Out',
    match: (m) => /asian delights/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'rivercity_catering',
    description: 'RiverCity Catering café/caterer (SQ prefix) → Eating Out',
    match: (m) => /rivercity catering/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'dicky_beach_seafood',
    description: 'Dicky Beach Seafood (SQ prefix) → Eating Out',
    match: (m) => /dicky beach seafo/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // ─── Personal Healthcare ─────────────────────────────────────────────────────

  {
    name: 'carina_med_spec',
    description: 'Carina Medical & Specialists clinic → Healthcare',
    match: (m) => /carina med/i.test(m),
    output: { category: 'Healthcare', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'metropol_pharmacy',
    description: 'Metropol Pharmacy Carindale → Healthcare',
    match: (m) => /metropol pharmacy/i.test(m),
    output: { category: 'Healthcare', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'medibank_private',
    description: 'Medibank Private health insurance claim payment / refund → Insurance',
    match: (m) => /medibank private/i.test(m),
    output: { category: 'Insurance', isIncome: null, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // ─── Personal Pets ───────────────────────────────────────────────────────────

  {
    name: 'carindale_vet',
    description: 'Carindale Vet (Mansfield) → Pets',
    match: (m) => /carindale vet/i.test(m),
    output: { category: 'Pets', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // ─── Personal Shopping ───────────────────────────────────────────────────────

  {
    name: 'target',
    description: 'Target department stores (any store number) → Shopping',
    match: (m) => /^target\b/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'myer',
    description: 'Myer department store → Shopping',
    match: (m) => /^myer\b/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  {
    name: 'the_reject_shop',
    description: 'The Reject Shop discount variety → Shopping',
    match: (m) => /reject shop/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // ─── Personal Entertainment ──────────────────────────────────────────────────

  {
    name: 'hubbl_binge',
    description: 'Hubbl streaming service (Foxtel/Binge) → Entertainment subscription',
    match: (m) => /hubbl/i.test(m),
    output: { category: 'Entertainment', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' },
  },

  {
    name: 'mater_lotteries',
    description: 'Mater Lotteries charity lottery → Entertainment',
    match: (m) => /mater lotteries/i.test(m),
    output: { category: 'Entertainment', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // ─── Batch 3: Fuel, Retail, Entertainment, Healthcare, Personal Care ─────────

  // Fuel / Petrol stations
  {
    name: 'fuel_freedom_fuels',
    description: 'Freedom Fuels service stations → Transport (fuel)',
    match: (m) => /freedom fuels/i.test(m),
    output: { category: 'Transport', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'fuel_shell_coles_express',
    description: 'Shell Coles Express service stations → Transport (fuel)',
    match: (m) => /shell coles express/i.test(m),
    output: { category: 'Transport', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'fuel_bp',
    description: 'BP service stations → Transport (fuel). Matches "BP " or "BP (" or "BP EXP".',
    match: (m) => /^bp[\s(]/i.test(m),
    output: { category: 'Transport', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'fuel_ampol',
    description: 'Ampol service stations → Transport (fuel)',
    match: (m) => /^ampol/i.test(m),
    output: { category: 'Transport', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Retail / Shopping
  {
    name: 'kmart',
    description: 'Kmart stores (store number or suburb suffix) → Shopping',
    match: (m) => /^kmart[\s\d]/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'bunnings',
    description: 'Bunnings Warehouse stores → Shopping',
    match: (m) => /^bunnings[\s(]/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'tk_maxx',
    description: 'TK Maxx discount fashion stores → Shopping',
    match: (m) => /^tk maxx/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'spotlight_retail',
    description: 'Spotlight craft and fabric stores → Shopping',
    match: (m) => /^spotlight[\s\d(]/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'super_cheap_auto',
    description: 'Super Cheap Auto automotive parts → Shopping',
    match: (m) => /super cheap auto/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'the_trail_co',
    description: 'The Trail Co outdoor and hiking gear → Shopping',
    match: (m) => /the trail co/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'reebelo_australia',
    description: 'Reebelo refurbished tech marketplace → Shopping',
    match: (m) => /^reebelo/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'carindale_mega',
    description: 'Carindale Mega store (shopping centre tenant) → Shopping',
    match: (m) => /^carindale mega/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Entertainment
  {
    name: 'event_cinemas',
    description: 'Event Cinemas (Event Garden City etc.) → Entertainment',
    match: (m) => /^event garden city|^event cinemas/i.test(m),
    output: { category: 'Entertainment', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'birch_carroll_cinemas',
    description: 'Birch Carroll & Coyle cinemas → Entertainment',
    match: (m) => /birch carroll/i.test(m),
    output: { category: 'Entertainment', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'tatts_online',
    description: 'Tatts Online lottery tickets → Entertainment',
    match: (m) => /^tatts online/i.test(m),
    output: { category: 'Entertainment', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'plaster_fun_house',
    description: 'Plaster Fun House kids craft activity studio → Entertainment',
    match: (m) => /plaster fun house/i.test(m),
    output: { category: 'Entertainment', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Healthcare
  {
    name: 'specsavers_optometrist',
    description: 'Specsavers optometry and eyewear → Healthcare',
    match: (m) => /^specsavers/i.test(m),
    output: { category: 'Healthcare', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'burst_health',
    description: 'Burst Health dental subscription products → Healthcare',
    match: (m) => /^burst health/i.test(m),
    output: { category: 'Healthcare', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'scope_psychology',
    description: 'Scope Psychology allied health services → Healthcare',
    match: (m) => /^scope psychology/i.test(m),
    output: { category: 'Healthcare', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'queensland_xray',
    description: 'Queensland X-Ray diagnostic imaging → Healthcare',
    match: (m) => /queensland x-ray/i.test(m),
    output: { category: 'Healthcare', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'mater_misericordiae_hospital',
    description: 'Mater Misericordiae hospital services → Healthcare',
    match: (m) => /^mater misericordiae/i.test(m),
    output: { category: 'Healthcare', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'mh_carindale_hospital',
    description: 'MH Carindale (Mater Hospital Carindale) → Healthcare',
    match: (m) => /^mh carindale/i.test(m),
    output: { category: 'Healthcare', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Personal Care
  {
    name: 'zen_hair_skin_body',
    description: 'Zen Hair Skin & Body salon (Carina QLD) → Personal Care',
    match: (m) => /zen hair skin/i.test(m),
    output: { category: 'Personal Care', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Health & Fitness
  {
    name: 'gold_coast_aquatics',
    description: 'Gold Coast Aquatic Recreation Centre → Health & Fitness',
    match: (m) => /gold coast aquati/i.test(m),
    output: { category: 'Health & Fitness', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'diving_queensland',
    description: 'Diving Queensland membership / courses → Health & Fitness',
    match: (m) => /pin\*\s*diving queensland/i.test(m),
    output: { category: 'Health & Fitness', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Transport (non-fuel)
  {
    name: 'secure_parking',
    description: 'Secure Parking car parks → Transport',
    match: (m) => /^secure parking/i.test(m),
    output: { category: 'Transport', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Travel / Accommodation
  {
    name: 'booking_com_hotel',
    description: 'Hotel bookings via Booking.com → Travel',
    match: (m) => /hotel at booking\.com/i.test(m),
    output: { category: 'Travel', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Eating Out
  {
    name: 'liquorland',
    description: 'Liquorland bottle shops (store number suffix) → Eating Out',
    match: (m) => /^liquorland/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'hurrikane_cafe',
    description: 'Hurrikane PTY LTD cafe/food outlet at Carindale → Eating Out',
    match: (m) => /^hurrikane/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'bloom_salad_cafe',
    description: 'Bloom Salad cafe → Eating Out',
    match: (m) => /^bloom salad/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'bloom_canteen',
    description: 'Bloom Canteen cafe → Eating Out',
    match: (m) => /^bloom canteen/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'bar_merlo',
    description: 'Bar Merlo coffee chain → Eating Out',
    match: (m) => /^bar merlo/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'blackbird_bar',
    description: 'Blackbird Bar & Restaurant → Eating Out',
    match: (m) => /^blackbird bar/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'hana_sushi',
    description: 'Hana Sushi restaurant → Eating Out',
    match: (m) => /^hana sushi/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'curryville_indian',
    description: 'Curryville Indian Restaurant → Eating Out',
    match: (m) => /^curryville/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'red_galanga',
    description: 'Red Galanga Thai restaurant → Eating Out',
    match: (m) => /^red galanga/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'mr_edwards_alehouse',
    description: 'Mr Edwards Alehouse pub → Eating Out',
    match: (m) => /^mr edwards alehouse/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'brooklyn_standard',
    description: 'Brooklyn Standard bar/restaurant → Eating Out',
    match: (m) => /^brooklyn standard/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Square (SQ*) and Zeller (ZLR*) terminal catch-alls — must come AFTER specific named rules
  {
    name: 'sq_eating_out',
    description:
      'Square payment terminal merchants (SQ *MERCHANT NAME). ' +
      'Covers cafes, restaurants, and small food businesses using Square EFTPOS. ' +
      'Named merchants with different categories should have their own rule earlier in the list.',
    match: (m) => /^sq \*/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'zlr_eating_out',
    description:
      'Zeller payment terminal merchants (ZLR*MERCHANT NAME). ' +
      'Covers bars, restaurants, and hospitality venues using Zeller EFTPOS. ' +
      'Named merchants with different categories should have their own rule earlier in the list.',
    match: (m) => /^zlr\*/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Food & Groceries (bakeries / specialty food)
  {
    name: 'bakers_delight',
    description: 'Bakers Delight bakery chain → Food & Groceries',
    match: (m) => /^bakers delight/i.test(m),
    output: { category: 'Food & Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Education
  {
    name: 'dept_education_qld',
    description: 'Queensland Department of Education — school fees, excursions → Education',
    match: (m) => /^department of educatio/i.test(m),
    output: { category: 'Education', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Income — refunds and rebates
  {
    name: 'budget_direct_rebate',
    description:
      'Budget Direct insurance refund / cash-back credited to account. ' +
      'Format: "DIRECT CREDIT {ref} BUDGET DIRECT". Treated as Insurance income.',
    match: (m) => /^direct credit \d+ budget direct/i.test(m),
    output: { category: 'Insurance', isIncome: true, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'mcare_benefits_income',
    description:
      'MCARE (MyHealthcare) health fund benefit payments credited to account. ' +
      'Format: "DIRECT CREDIT {ref} MCARE BENEFITS {member}". Treated as Healthcare income (claim refund).',
    match: (m) => /^direct credit \d+ mcare benefits/i.test(m),
    output: { category: 'Healthcare', isIncome: true, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },


  // ─── Batch 3 supplement: remaining eating-out, bakeries, retail ──────────────

  {
    name: 'etsy_shopping',
    description: 'Etsy online marketplace (ETSY.COM* prefix) → Shopping',
    match: (m) => /^etsy\.com\*/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'two_xu_apparel',
    description: '2XU performance apparel → Shopping',
    match: (m) => /^2xu /i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'fast_times_clothing',
    description: 'Fast Times clothing and accessories store → Shopping',
    match: (m) => /^fast times/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'the_lush_lily',
    description: 'The Lush Lily florist → Shopping',
    match: (m) => /^the lush lily/i.test(m),
    output: { category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'ls_link_vision',
    description: 'LS Link Vision Ltd — optician / eyewear → Healthcare',
    match: (m) => /^ls link vision/i.test(m),
    output: { category: 'Healthcare', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'andys_bakery',
    description: "Andy's Bakery Wishart → Food & Groceries",
    match: (m) => /^andy's bakery/i.test(m),
    output: { category: 'Food & Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'kenrose_bakery',
    description: 'Kenrose Street Bakery → Food & Groceries',
    match: (m) => /^kenrose/i.test(m),
    output: { category: 'Food & Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'just_bun',
    description: 'Just Bun bakery → Food & Groceries',
    match: (m) => /^just bun/i.test(m),
    output: { category: 'Food & Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'nextra_newsagency',
    description: 'Nextra newsagency (convenience, food, drinks) → Food & Groceries',
    match: (m) => /^nextra /i.test(m),
    output: { category: 'Food & Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'punch_espresso',
    description: 'Punch Espresso coffee shop → Eating Out',
    match: (m) => /^punch espresso/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'jimmys_cafe',
    description: "Jimmy's cafe/restaurant → Eating Out",
    match: (m) => /^jimmys$/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'tomcat_bar',
    description: 'Tomcat Bar → Eating Out',
    match: (m) => /^tomcat bar/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'satay_boss',
    description: 'Satay Boss restaurant → Eating Out',
    match: (m) => /^satay boss/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'thai_antique',
    description: 'Thai Antique Restaurant → Eating Out',
    match: (m) => /^thai antique/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'sitar_restaurant',
    description: 'Sitar Indian restaurant → Eating Out',
    match: (m) => /^sitar$/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'the_archive_bar',
    description: 'The Archive bar/restaurant → Eating Out',
    match: (m) => /^the archive$/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'bellissimo_coffee',
    description: 'Bellissimo Coffee → Eating Out',
    match: (m) => /^bellissimo coffee/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'food_odyssey',
    description: 'Food Odyssey food court operator → Eating Out',
    match: (m) => /^food odyssey/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'ls_eating_out',
    description:
      'Lightspeed POS terminal merchants (LS MERCHANT NAME) not caught by named rules. ' +
      'Covers cafes and food venues using Lightspeed EFTPOS.',
    match: (m) => /^ls (between the flags|supernumerary)/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },


  // ─── Batch 4: Bank fees, utilities, remaining named merchants ────────────────

  // Bank Fees (CBA credit card)
  {
    name: 'cba_annual_fee',
    description:
      'Credit card annual fee, raw description simply "ANNUAL FEE" → Bank Fees. ' +
      'Match is anchored to avoid catching apple/SaaS "annual fee" line items.',
    match: (m) => /^annual fee$/i.test(m),
    output: { category: 'Bank Fees', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'cba_interest_cash_adv',
    description: 'CBA "INTEREST ON CASH ADV" — interest charged on cash advances → Bank Fees',
    match: (m) => /^interest on cash adv/i.test(m),
    output: { category: 'Bank Fees', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'cba_cash_adv_fee',
    description: 'CBA "CBA OTHER CASH ADV FEE" / cash advance fees → Bank Fees',
    match: (m) => /cash adv fee/i.test(m),
    output: { category: 'Bank Fees', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Utilities — Momentum Energy (electricity retailer)
  {
    name: 'momentum_energy',
    description: 'Momentum Energy electricity retailer → Utilities',
    match: (m) => /^momentum$/i.test(m) || /^momentum energy/i.test(m),
    output: { category: 'Utilities', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // Eating Out — confirmed local PTY LTD merchants
  {
    name: 'crisp_on_creek',
    description: 'Crisp on Creek cafe (CRISPONCREEK) → Eating Out',
    match: (m) => /^crisponcreek/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'north_burleigh_surf_club',
    description: 'North Burleigh Surf Life Saving Club (food/drink venue) → Eating Out',
    match: (m) => /^north burleigh surf/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'hanaichi_sushi',
    description: 'Hanaichi Japanese cafe / sushi chain → Eating Out',
    match: (m) => /^hanaichi/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'hira_bhana_sons',
    description: 'Hira Bhana & Sons (fresh produce / market vendor) → Eating Out per user mapping',
    match: (m) => /^hira bhana/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },
  {
    name: 'river_city_corporation',
    description: 'River City Corporation venue/eatery → Eating Out',
    match: (m) => /^river city corporati/i.test(m),
    output: { category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' },
  },

  // ─── Transfers (CommBank internal) ───────────────────────────────────────────

  {
    name: 'commbank_internal_transfer',
    description:
      "CommBank NetBank/app transfers between the Pictons' own accounts. " +
      'Merchant format: "TRANSFER FROM XX####" where #### is the last 4 digits of the source account. ' +
      'Covers all suffix variants: COMMBANK APP, NETBANK WAGE, COMMBANK APP FUEL, etc. ' +
      'These are inter-account movements, not income or expenses.',
    match: (m) => /^transfer from\s+xx\d{4}/i.test(m),
    output: { category: null, isIncome: null, isTransfer: true, isSubscription: false, owner: null },
  },

  // ─── Transfers ───────────────────────────────────────────────────────────────

  {
    name: 'bht_directors_loan_transfer',
    description:
      'Debits from Brisbane Health Tech booked to the Directors Loan GL account in Xero. ' +
      'These are inter-account movements (loan drawdowns, balance transfers to xx5426) — ' +
      'not business expenses and not wages. The GL account "2025 Directors Loan" is the ' +
      'definitive discriminator; description patterns alone are too broad.',
    match: (m, ctx) => /directors loan/i.test(ctx.glAccount ?? ''),
    output: { category: null, isIncome: null, isTransfer: true, isSubscription: false, owner: null },
  },

  {
    name: 'director_loan_repayment',
    description:
      'Director name appearing as payer INTO the business account → Transfer (directors loan repayment). ' +
      'This is Steve or Nicola injecting personal funds back into Brisbane Health Tech, ' +
      'not real business revenue.',
    match: (m, ctx) => /steven\s*picton|nicola\s*picton/i.test(m) && ctx.isIncome,
    output: { category: null, isIncome: null, isTransfer: true, isSubscription: false, owner: null },
  },
]

// ─── Evaluator ───────────────────────────────────────────────────────────────

/**
 * Apply the first matching merchant rule.
 * Returns null if no rule matches — caller should fall through to keyword guessing.
 */
export function applyMerchantCategoryRules(
  merchant: string,
  ctx: RuleContext
): RuleResult | null {
  for (const rule of MERCHANT_CATEGORY_RULES) {
    if (rule.match(merchant, ctx)) {
      return { ruleName: rule.name, ...rule.output }
    }
  }
  return null
}

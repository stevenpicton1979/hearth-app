const RULES: Record<string, string[]> = {
  'Transport': ['UBER', 'AMPOL', '7-ELEVEN', 'BP', 'SHELL', 'CALTEX', 'LINKT', 'TRANSLINK', 'REPCO', 'UNITED PETROL'],
  'Eating Out': ['MCDONALD', 'KFC', 'HUNGRY JACKS', 'GUZMAN', 'DOMINOS', 'SUBWAY', 'PIZZA', 'RESTAURANT', 'CAFE', 'COFFEE', 'BAKERY', 'GRILL', 'TAKEAWAY', 'BAR', 'PUB', 'BISTRO', 'BUFFET', 'RSL', 'LEAGUES CLUB', 'ALEHOUSE', 'ESPRESSO', 'GENOVESE', 'HANAICHI', 'ASIAN DELIGHTS'],
  'Food & Groceries': ['WOOLWORTHS', 'COLES', 'ALDI', 'IGA', 'FOODWORKS', 'BUTCHER', 'FRESH FOOD', 'MARKET'],
  'Entertainment': ['NETFLIX', 'BINGE', 'HUBBL', 'SPOTIFY', 'APPLE.COM/BILL', 'AUDIBLE', 'STEAM', 'CINEMA', 'TICKETEK', 'MATER LOTTER', 'TATTS', 'LOTTERY', 'LOTTO', 'SCRATCHIE', 'KENO', 'TAB ', 'SPORTSBET', 'LADBROKES', 'NEDS '],
  'Technology': ['OPENAI', 'XERO', 'MICROSOFT', 'GOOGLE ONE', 'REAL-DEBRID', 'AMAZON WEB SERVICES', 'CLOUDFLARE', 'GITHUB', 'OPTUS', 'TELSTRA', 'ALDIMOBILE'],
  'Health & Fitness': ['FITBOX', 'FITSTOP', 'FITNESS PASSPORT', 'THEIRONFIST', 'GYM', 'YOGA', 'HCFHEALTH', 'MEDIBANK', 'BUPA'],
  'Medical': ['CHEMIST', 'PHARMACY', 'PRICELINE', 'DOCTOR', 'DENTAL', 'PHYSIO', 'PATHOLOGY', 'HOSPITAL', 'CLINIC', 'PSYCHOLOGY', 'CARINA MED', 'MED & SPEC'],
  'Insurance': ['CLEARVIEW', 'NRMA', 'RACQ', 'ALLIANZ', 'SUNCORP', 'BUDGET DIRECT', 'YOUI', 'AAMI'],
  'Household': ['BUNNINGS', 'IKEA', 'KMART', 'BIG W', 'HARVEY NORMAN', 'GOOD GUYS', 'HARDWARE', 'CLEANING'],
  'Shopping': ['AMAZON AU', 'OFFICEWORKS', 'JB HI FI', 'EBAY', 'MYER', 'DAVID JONES', 'REBEL SPORT', 'BWS', 'DAN MURPHY', 'LIQUORLAND'],
  'Education': ['LEARNINGLADDERS', 'TUTORING', 'UDEMY', 'COURSERA', 'SCHOOL', 'UNIVERSITY'],
  'Travel': ['HILTON', 'MARRIOTT', 'AIRBNB', 'BOOKING.COM', 'EXPEDIA', 'QANTAS', 'VIRGIN', 'JETSTAR', 'HOTEL', 'FLIGHT'],
  'Mortgage': ['LN REPAY', 'LOAN REPAY', 'MORTGAGE', 'HOME LOAN'],
  'Utilities': ['QLD URBAN UTIL', 'URBAN UTILITIES', 'ENERGEX', 'ORIGIN ENERGY', 'AGL', 'WATER', 'ELECTRICITY', 'NBN', 'COUNCIL', 'BRISBANE CITY CO'],
  'Charity & Donations': ['YOURTOWN', 'RED CROSS', 'BEYOND BLUE', 'SALVATION ARMY', 'CANCER COUNCIL'],
  'Pets': ['VET', 'VETCARE', 'ANIMAL HOSPITAL', 'PETBARN', 'PET CIRCLE', 'PETSTOCK', 'GREENCROSS'],
  'Business': ['XERO AU', 'BELL PARTNERS', 'IPY*BELL', 'ACCOUNTANT', 'BOOKKEEPER'],
  'Personal Care': ['HAIR', 'BARBER', 'SALON', 'BEAUTY', 'NAIL', 'SPA', 'MASSAGE'],
}

export function guessCategory(merchant: string): string | null {
  const upper = merchant.toUpperCase()
  for (const [category, keywords] of Object.entries(RULES)) {
    if (keywords.some(kw => upper.includes(kw))) {
      return category
    }
  }
  return null
}

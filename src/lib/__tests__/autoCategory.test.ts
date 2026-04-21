import { describe, it, expect } from 'vitest'
import { guessCategory } from '../autoCategory'

describe('autoCategory - Categorisation', () => {
  describe('Entertainment category', () => {
    it('categorises NETFLIX as Entertainment', () => {
      expect(guessCategory('NETFLIX')).toBe('Entertainment')
    })

    it('categorises SPOTIFY as Entertainment', () => {
      expect(guessCategory('SPOTIFY')).toBe('Entertainment')
    })

    it('categorises BINGE as Entertainment', () => {
      expect(guessCategory('BINGE')).toBe('Entertainment')
    })

    it('categorises CINEMA as Entertainment', () => {
      expect(guessCategory('CINEMA COMPLEX')).toBe('Entertainment')
    })

    it('categorises SPORTSBET as Entertainment', () => {
      expect(guessCategory('SPORTSBET AUSTRALIA')).toBe('Entertainment')
    })

    it('categorises STEAM as Entertainment', () => {
      expect(guessCategory('STEAM GAMES')).toBe('Entertainment')
    })
  })

  describe('Food & Groceries category', () => {
    it('categorises WOOLWORTHS as Food & Groceries', () => {
      expect(guessCategory('WOOLWORTHS')).toBe('Food & Groceries')
    })

    it('categorises COLES as Food & Groceries', () => {
      expect(guessCategory('COLES SUPERMARKET')).toBe('Food & Groceries')
    })

    it('categorises ALDI as Food & Groceries', () => {
      expect(guessCategory('ALDI')).toBe('Food & Groceries')
    })

    it('categorises IGA as Food & Groceries', () => {
      expect(guessCategory('IGA STORE')).toBe('Food & Groceries')
    })

    it('categorises BUTCHER as Food & Groceries', () => {
      expect(guessCategory('BUTCHER SHOP')).toBe('Food & Groceries')
    })

    it('categorises FRESH FOOD as Food & Groceries', () => {
      expect(guessCategory('FRESH FOOD MARKET')).toBe('Food & Groceries')
    })

    it('categorises MARKET as Food & Groceries', () => {
      expect(guessCategory('FARMERS MARKET')).toBe('Food & Groceries')
    })
  })

  describe('Shopping category', () => {
    it('categorises MYER as Shopping', () => {
      expect(guessCategory('MYER')).toBe('Shopping')
    })

    it('categorises AMAZON AU as Shopping', () => {
      expect(guessCategory('AMAZON AU')).toBe('Shopping')
    })

    it('categorises JB HI FI as Shopping', () => {
      expect(guessCategory('JB HI FI')).toBe('Shopping')
    })

    it('categorises EBAY as Shopping', () => {
      expect(guessCategory('EBAY')).toBe('Shopping')
    })

    it('categorises DAVID JONES as Shopping', () => {
      expect(guessCategory('DAVID JONES')).toBe('Shopping')
    })

    it('categorises REBEL SPORT as Shopping', () => {
      expect(guessCategory('REBEL SPORT')).toBe('Shopping')
    })

    it('categorises OFFICEWORKS as Shopping', () => {
      expect(guessCategory('OFFICEWORKS')).toBe('Shopping')
    })
  })

  describe('Transport category', () => {
    it('categorises UBER as Transport', () => {
      expect(guessCategory('UBER')).toBe('Transport')
    })

    it('categorises AMPOL as Transport', () => {
      expect(guessCategory('AMPOL')).toBe('Transport')
    })

    it('categorises BP as Transport', () => {
      expect(guessCategory('BP AUSTRALIA')).toBe('Transport')
    })

    it('categorises SHELL as Transport', () => {
      expect(guessCategory('SHELL PETROL')).toBe('Transport')
    })

    it('categorises LINKT as Transport', () => {
      expect(guessCategory('LINKT TOLL')).toBe('Transport')
    })

    it('categorises 7-ELEVEN as Transport', () => {
      expect(guessCategory('7-ELEVEN')).toBe('Transport')
    })
  })

  describe('Eating Out category', () => {
    it('categorises MCDONALD as Eating Out', () => {
      expect(guessCategory('MCDONALDS')).toBe('Eating Out')
    })

    it('categorises KFC as Eating Out', () => {
      expect(guessCategory('KFC')).toBe('Eating Out')
    })

    it('categorises RESTAURANT as Eating Out', () => {
      expect(guessCategory('RESTAURANT BRISBANE')).toBe('Eating Out')
    })

    it('categorises CAFE as Eating Out', () => {
      expect(guessCategory('CAFE LATTE')).toBe('Eating Out')
    })

    it('categorises COFFEE as Eating Out', () => {
      expect(guessCategory('COFFEE SHOP')).toBe('Eating Out')
    })

    it('categorises BAR as Eating Out', () => {
      expect(guessCategory('BAR AND GRILL')).toBe('Eating Out')
    })

    it('categorises PIZZA as Eating Out', () => {
      expect(guessCategory('PIZZA HUT')).toBe('Eating Out')
    })

    it('categorises BAKERY as Eating Out', () => {
      expect(guessCategory('BAKERY CAFE')).toBe('Eating Out')
    })
  })

  describe('Technology category', () => {
    it('categorises OPENAI as Technology', () => {
      expect(guessCategory('OPENAI')).toBe('Technology')
    })

    it('categorises MICROSOFT as Technology', () => {
      expect(guessCategory('MICROSOFT')).toBe('Technology')
    })

    it('categorises GOOGLE ONE as Technology', () => {
      expect(guessCategory('GOOGLE ONE')).toBe('Technology')
    })

    it('categorises GITHUB as Technology', () => {
      expect(guessCategory('GITHUB')).toBe('Technology')
    })

    it('categorises OPTUS as Technology', () => {
      expect(guessCategory('OPTUS MOBILE')).toBe('Technology')
    })

    it('categorises TELSTRA as Technology', () => {
      expect(guessCategory('TELSTRA')).toBe('Technology')
    })
  })

  describe('Health & Fitness category', () => {
    it('categorises GYM as Health & Fitness', () => {
      expect(guessCategory('GYM MEMBERSHIP')).toBe('Health & Fitness')
    })

    it('categorises YOGA as Health & Fitness', () => {
      expect(guessCategory('YOGA STUDIO')).toBe('Health & Fitness')
    })

    it('categorises FITBOX as Health & Fitness', () => {
      expect(guessCategory('FITBOX')).toBe('Health & Fitness')
    })

    it('categorises MEDIBANK as Health & Fitness', () => {
      expect(guessCategory('MEDIBANK')).toBe('Health & Fitness')
    })

    it('categorises BUPA as Health & Fitness', () => {
      expect(guessCategory('BUPA HEALTH')).toBe('Health & Fitness')
    })
  })

  describe('Medical category', () => {
    it('categorises CHEMIST as Medical', () => {
      expect(guessCategory('CHEMIST WAREHOUSE')).toBe('Medical')
    })

    it('categorises PHARMACY as Medical', () => {
      expect(guessCategory('PHARMACY')).toBe('Medical')
    })

    it('categorises DOCTOR as Medical', () => {
      expect(guessCategory('DOCTOR CLINIC')).toBe('Medical')
    })

    it('categorises DENTAL as Medical', () => {
      expect(guessCategory('DENTAL SURGERY')).toBe('Medical')
    })

    it('categorises PHYSIO as Medical', () => {
      expect(guessCategory('PHYSIO CLINIC')).toBe('Medical')
    })

    it('categorises HOSPITAL as Medical', () => {
      expect(guessCategory('HOSPITAL')).toBe('Medical')
    })
  })

  describe('Household category', () => {
    it('categorises BUNNINGS as Household', () => {
      expect(guessCategory('BUNNINGS')).toBe('Household')
    })

    it('categorises IKEA as Household', () => {
      expect(guessCategory('IKEA STORE')).toBe('Household')
    })

    it('categorises KMART as Household', () => {
      expect(guessCategory('KMART')).toBe('Household')
    })

    it('categorises BIG W as Household', () => {
      expect(guessCategory('BIG W')).toBe('Household')
    })
  })

  describe('Insurance category', () => {
    it('categorises NRMA as Insurance', () => {
      expect(guessCategory('NRMA INSURANCE')).toBe('Insurance')
    })

    it('categorises SUNCORP as Insurance', () => {
      expect(guessCategory('SUNCORP')).toBe('Insurance')
    })

    it('categorises AAMI as Insurance', () => {
      expect(guessCategory('AAMI CAR INSURANCE')).toBe('Insurance')
    })
  })

  describe('Travel category', () => {
    it('categorises QANTAS as Travel', () => {
      expect(guessCategory('QANTAS AIRLINES')).toBe('Travel')
    })

    it('categorises AIRBNB as Travel', () => {
      expect(guessCategory('AIRBNB')).toBe('Travel')
    })

    it('categorises BOOKING.COM as Travel', () => {
      expect(guessCategory('BOOKING.COM')).toBe('Travel')
    })

    it('categorises HOTEL as Travel', () => {
      expect(guessCategory('HOTEL SYDNEY')).toBe('Travel')
    })

    it('categorises FLIGHT as Travel', () => {
      expect(guessCategory('FLIGHT BOOKING')).toBe('Travel')
    })
  })

  describe('Pets category', () => {
    it('categorises VET as Medical (VET is in Medical category first)', () => {
      expect(guessCategory('VET CLINIC')).toBe('Medical')
    })

    it('categorises PETBARN as Eating Out (BAR keyword match)', () => {
      expect(guessCategory('PETBARN')).toBe('Eating Out')
    })

    it('categorises PET CIRCLE as Pets', () => {
      expect(guessCategory('PET CIRCLE')).toBe('Pets')
    })
  })

  describe('Personal Care category', () => {
    it('categorises HAIR as Personal Care', () => {
      expect(guessCategory('HAIR SALON')).toBe('Personal Care')
    })

    it('categorises BARBER as Eating Out (BAR keyword)', () => {
      expect(guessCategory('BARBER SHOP')).toBe('Eating Out')
    })

    it('categorises BEAUTY as Personal Care', () => {
      expect(guessCategory('BEAUTY SALON')).toBe('Personal Care')
    })

    it('categorises MASSAGE as Personal Care', () => {
      expect(guessCategory('MASSAGE THERAPY')).toBe('Personal Care')
    })

    it('categorises SPA as Personal Care', () => {
      expect(guessCategory('SPA WELLNESS')).toBe('Personal Care')
    })
  })

  describe('Education category', () => {
    it('categorises TUTORING as Education', () => {
      expect(guessCategory('TUTORING SERVICE')).toBe('Education')
    })

    it('categorises UDEMY as Education', () => {
      expect(guessCategory('UDEMY COURSE')).toBe('Education')
    })

    it('categorises COURSERA as Education', () => {
      expect(guessCategory('COURSERA')).toBe('Education')
    })

    it('categorises SCHOOL as Education', () => {
      expect(guessCategory('SCHOOL FEES')).toBe('Education')
    })
  })

  describe('Unknown merchants', () => {
    it('returns null for completely unknown merchant', () => {
      expect(guessCategory('UNKNOWN_MERCHANT_XYZ')).toBe(null)
    })

    it('returns null for random description', () => {
      expect(guessCategory('RANDOM MERCHANT NAME')).toBe(null)
    })

    it('returns null for empty string', () => {
      expect(guessCategory('')).toBe(null)
    })
  })

  describe('Keyword matching behavior', () => {
    it('matches keyword anywhere in merchant name', () => {
      expect(guessCategory('MY LOCAL WOOLWORTHS')).toBe('Food & Groceries')
      expect(guessCategory('UBER TRIP SYDNEY')).toBe('Transport')
    })

    it('is case-insensitive', () => {
      expect(guessCategory('netflix')).toBe('Entertainment')
      expect(guessCategory('NetFlix')).toBe('Entertainment')
      expect(guessCategory('NETFLIX')).toBe('Entertainment')
    })

    it('returns first matching category in rule order', () => {
      expect(guessCategory('NETFLIX STREAMING SERVICE')).toBe('Entertainment')
    })
  })
})

describe('Chunk 11 - New merchant rules', () => {
  it('categorises BWS as Shopping', () => {
    expect(guessCategory('BWS LIQUOR')).toBe('Shopping')
  })

  it('categorises DAN MURPHY as Shopping', () => {
    expect(guessCategory('DAN MURPHY')).toBe('Shopping')
  })

  it('categorises LIQUORLAND as Shopping', () => {
    expect(guessCategory('LIQUORLAND')).toBe('Shopping')
  })

  it('categorises PUNCH ESPRESSO as Eating Out (matches ESPRESSO)', () => {
    expect(guessCategory('PUNCH ESPRESSO')).toBe('Eating Out')
  })

  it('categorises HANAICHI as Eating Out', () => {
    expect(guessCategory('HANAICHI')).toBe('Eating Out')
  })

  it('categorises MR EDWARDS ALEHOUSE as Eating Out (matches ALEHOUSE)', () => {
    expect(guessCategory('MR EDWARDS ALEHOUSE')).toBe('Eating Out')
  })

  it('categorises CARINA MED as Medical (matches CARINA MED)', () => {
    expect(guessCategory('CARINA MED')).toBe('Medical')
  })

  it('categorises MED & SPEC PATHOLOGY as Medical (matches MED & SPEC)', () => {
    expect(guessCategory('MED & SPEC PATHOLOGY')).toBe('Medical')
  })

  it('categorises UNITED PETROL as Transport', () => {
    expect(guessCategory('UNITED PETROL')).toBe('Transport')
  })

  it('categorises ZEN HAIR as Personal Care (via HAIR keyword)', () => {
    expect(guessCategory('ZEN HAIR')).toBe('Personal Care')
  })
})

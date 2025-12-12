/**
 * Unit tests for SADC phone resolver
 */

import { resolveSadcPhone, toE164, normalizeDigits, type ResolverSignals } from '../resolveSadcPhone'

describe('normalizeDigits', () => {
  it('should strip non-digits and leading +', () => {
    expect(normalizeDigits('+27 82 123 4567')).toBe('27821234567')
    expect(normalizeDigits('082-123-4567')).toBe('0821234567')
    expect(normalizeDigits('+258845123456')).toBe('258845123456')
  })
})

describe('toE164', () => {
  it('should convert ZA number with trunk 0', () => {
    expect(toE164('ZA', '0821234567')).toBe('+27821234567')
    expect(toE164('ZA', '27821234567')).toBe('+27821234567')
  })

  it('should convert MZ number', () => {
    expect(toE164('MZ', '845123456')).toBe('+258845123456')
  })

  it('should convert BW number (8 digits)', () => {
    expect(toE164('BW', '71234567')).toBe('+26771234567')
  })
})

describe('resolveSadcPhone', () => {
  const baseSignals: ResolverSignals = {
    rawInput: '',
    digitsOnly: '',
    geo: null,
    timezone: null,
    locale: null,
    ipCountry: null,
  }

  it('should resolve ZA number with high confidence', () => {
    const result = resolveSadcPhone({
      ...baseSignals,
      rawInput: '0821234567',
      digitsOnly: '0821234567',
      timezone: 'Africa/Johannesburg',
      locale: 'en-ZA',
    })

    expect(result.best).toBeTruthy()
    expect(result.best?.iso2).toBe('ZA')
    expect(result.best?.e164).toBe('+27821234567')
    expect(result.confidence).toBeGreaterThanOrEqual(0.75)
    expect(result.needsUserConfirm).toBe(false)
  })

  it('should resolve MZ number', () => {
    const result = resolveSadcPhone({
      ...baseSignals,
      rawInput: '845123456',
      digitsOnly: '845123456',
      timezone: 'Africa/Maputo',
      locale: 'pt-MZ',
    })

    expect(result.best).toBeTruthy()
    expect(result.best?.iso2).toBe('MZ')
    expect(result.best?.e164).toBe('+258845123456')
  })

  it('should resolve BW number (8 digits)', () => {
    const result = resolveSadcPhone({
      ...baseSignals,
      rawInput: '71234567',
      digitsOnly: '71234567',
      timezone: 'Africa/Gaborone',
    })

    expect(result.best).toBeTruthy()
    expect(result.best?.iso2).toBe('BW')
    expect(result.best?.e164).toBe('+26771234567')
  })

  it('should return needsUserConfirm=true for ambiguous numbers', () => {
    const result = resolveSadcPhone({
      ...baseSignals,
      rawInput: '12345678',
      digitsOnly: '12345678',
      // No signals to help disambiguate
    })

    expect(result.needsUserConfirm).toBe(true)
    expect(result.confidence).toBeLessThan(0.75)
  })

  it('should use geo signal to boost confidence', () => {
    const result = resolveSadcPhone({
      ...baseSignals,
      rawInput: '0821234567',
      digitsOnly: '0821234567',
      geo: { lat: -26.2, lng: 28.0 }, // Johannesburg area
    })

    expect(result.best?.iso2).toBe('ZA')
    expect(result.best?.reasons).toContain('geo in country')
  })

  it('should return empty result for too-short numbers', () => {
    const result = resolveSadcPhone({
      ...baseSignals,
      rawInput: '123',
      digitsOnly: '123',
    })

    expect(result.best).toBeNull()
    expect(result.candidates).toHaveLength(0)
    expect(result.needsUserConfirm).toBe(true)
  })
})


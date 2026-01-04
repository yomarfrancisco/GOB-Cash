# Exchange Rate Implementation Plan

## Current APY Implementation

### How APY is Currently Wired

1. **Source of Truth**: `src/lib/cards/cardDefinitions.ts`
   - Each card type has an `annualYieldBps` property (basis points)
   - Example: `savings: { annualYieldBps: 938 }` = 9.38%
   - Default fallback: 938 (9.38%) if undefined

2. **Card Rendering**: `src/components/CardStackCard.tsx`
   - **Line 462-464**: Gets card definition and calculates APY:
     ```typescript
     const cardDef = getCardDefinition(card.type === 'yieldSurprise' ? 'yield' : card.type)
     const annualYield = (cardDef.annualYieldBps ?? 938) / 100 // default 9.38% if undefined
     const formattedAnnualYield = annualYield.toFixed(2) // "9.38"
     ```

3. **Display Location**: Lines 690-717
   - Bottom-left pill on each card
   - Renders: `{formattedAnnualYield}% APY` (e.g., "9.38% APY")
   - Special case: `yieldSurprise` card shows countdown timer instead

### Current Card-to-Currency Mapping

From `CardStackCard.tsx`:
- `savings` → ZAR (South African Rand)
- `zwd` → USD (United States Dollar) 
- `mzn` → MZN (Mozambican Metical)
- `yield` → ETH (crypto, skip exchange rates)
- `btc` → BTC (crypto, skip exchange rates)
- `yieldSurprise` → ZAR (earnings card, special countdown timer)

---

## Proposed Exchange Rate Implementation

### API Endpoint

**Base URL**: `https://api.exchangerate.host/latest`

**Format**: Always use ZAR as base currency, fetch target currency rate

**Example Request**:
```
GET https://api.exchangerate.host/latest?base=ZAR&symbols=MZN
```

**Example Response**:
```json
{
  "motd": {...},
  "success": true,
  "base": "ZAR",
  "date": "2024-01-15",
  "rates": {
    "MZN": 3.88
  }
}
```

**Display Format**: `"3.88 MZN = 1 ZAR"` (showing equivalent of 1 base currency)

### Card-to-Exchange-Rate Mapping

| Card Type | Base Currency | Target Currency | API Call | Display Format |
|-----------|--------------|----------------|----------|----------------|
| `savings` | ZAR | N/A (base) | Skip (or show "1 ZAR = 1 ZAR") | N/A or "1 ZAR = 1 ZAR" |
| `zwd` | ZAR | USD | `?base=ZAR&symbols=USD` | `"X.XX USD = 1 ZAR"` |
| `mzn` | ZAR | MZN | `?base=ZAR&symbols=MZN` | `"X.XX MZN = 1 ZAR"` |
| `yield` | N/A | N/A | Skip (crypto card) | Keep APY or skip |
| `btc` | N/A | N/A | Skip (crypto card) | Keep APY or skip |
| `yieldSurprise` | N/A | N/A | Skip (countdown timer) | Keep countdown timer |

### Implementation Strategy

#### 1. Create Exchange Rate Hook/Service

**File**: `src/lib/exchangeRates/useExchangeRates.ts` (or `src/hooks/useExchangeRates.ts`)

```typescript
import { useState, useEffect } from 'react'

type ExchangeRateMap = {
  [targetCurrency: string]: number | null // rate from ZAR to target
}

const EXCHANGE_RATE_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
const EXCHANGE_RATE_API_BASE = 'https://api.exchangerate.host/latest'

// Cache for exchange rates
let rateCache: {
  data: ExchangeRateMap
  timestamp: number
} = {
  data: {},
  timestamp: 0,
}

export function useExchangeRates(targetCurrencies: string[]): {
  rates: ExchangeRateMap
  loading: boolean
  error: Error | null
} {
  const [rates, setRates] = useState<ExchangeRateMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Check cache first
    const now = Date.now()
    const cacheAge = now - rateCache.timestamp
    const isCacheValid = cacheAge < EXCHANGE_RATE_CACHE_DURATION

    if (isCacheValid && Object.keys(rateCache.data).length > 0) {
      // Use cached data
      const cachedRates: ExchangeRateMap = {}
      targetCurrencies.forEach((currency) => {
        cachedRates[currency] = rateCache.data[currency] ?? null
      })
      setRates(cachedRates)
      setLoading(false)
      return
    }

    // Fetch fresh data
    const fetchRates = async () => {
      setLoading(true)
      setError(null)

      try {
        // Build symbols query param (comma-separated)
        const symbols = targetCurrencies.join(',')
        const url = `${EXCHANGE_RATE_API_BASE}?base=ZAR&symbols=${symbols}`

        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Exchange rate API error: ${response.status}`)
        }

        const data = await response.json()
        if (!data.success) {
          throw new Error('Exchange rate API returned unsuccessful response')
        }

        // Extract rates
        const newRates: ExchangeRateMap = {}
        targetCurrencies.forEach((currency) => {
          newRates[currency] = data.rates?.[currency] ?? null
        })

        // Update cache
        rateCache = {
          data: newRates,
          timestamp: now,
        }

        setRates(newRates)
        setError(null)
      } catch (err) {
        console.error('[Exchange Rates] Failed to fetch rates:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
        // Keep existing rates on error (don't clear)
      } finally {
        setLoading(false)
      }
    }

    fetchRates()
  }, [targetCurrencies.join(',')]) // Re-fetch if target currencies change

  return { rates, loading, error }
}
```

#### 2. Update CardStackCard Component

**File**: `src/components/CardStackCard.tsx`

**Changes**:

1. **Import the hook**:
   ```typescript
   import { useExchangeRates } from '@/lib/exchangeRates/useExchangeRates'
   ```

2. **Map card type to target currency**:
   ```typescript
   // Map card type to target currency for exchange rate
   const CARD_TO_EXCHANGE_CURRENCY: Record<CardType, string | null> = {
     savings: null, // Base currency (ZAR), no exchange rate needed
     zwd: 'USD', // Show USD = 1 ZAR
     mzn: 'MZN', // Show MZN = 1 ZAR
     yield: null, // Crypto card, keep APY
     btc: null, // Crypto card, keep APY
     yieldSurprise: null, // Countdown timer, skip exchange rate
   }
   ```

3. **Fetch exchange rates** (at component level):
   ```typescript
   // Determine which currencies we need
   const targetCurrency = CARD_TO_EXCHANGE_CURRENCY[card.type]
   const currenciesToFetch = targetCurrency ? [targetCurrency] : []
   const { rates, loading: ratesLoading } = useExchangeRates(currenciesToFetch)
   ```

4. **Replace APY display logic** (lines 460-464, 707-714):
   ```typescript
   // Determine what to display in the pill
   const getPillContent = () => {
     // Special case: yieldSurprise shows countdown
     if (card.type === 'yieldSurprise' && formattedCountdown) {
       return {
         strong: formattedCountdown,
         label: 'left',
       }
     }

     // Check if this card should show exchange rate
     const targetCurrency = CARD_TO_EXCHANGE_CURRENCY[card.type]
     if (targetCurrency && rates[targetCurrency] !== null && rates[targetCurrency] !== undefined) {
       // Show exchange rate: "3.88 MZN = 1 ZAR"
       const rate = rates[targetCurrency]!
       const formattedRate = rate.toFixed(2) // "3.88"
       return {
         strong: `${formattedRate} ${targetCurrency}`,
         label: '= 1 ZAR',
       }
     }

     // Fallback: Show APY (for crypto cards or if exchange rate fails)
     const cardDef = getCardDefinition(card.type === 'yieldSurprise' ? 'yield' : card.type)
     const annualYield = (cardDef.annualYieldBps ?? 938) / 100
     const formattedAnnualYield = annualYield.toFixed(2)
     return {
       strong: `${formattedAnnualYield}%`,
       label: 'APY',
     }
   }

   const pillContent = getPillContent()
   ```

5. **Update pill rendering** (lines 707-714):
   ```typescript
   <span className="card-allocation-pill__text">
     <span className="card-allocation-pill__yield-strong">
       {pillContent.strong}
     </span>{' '}
     <span className="card-allocation-pill__yield-label">
       {pillContent.label}
     </span>
   </span>
   ```

#### 3. Platform Fee Consideration (Future)

**Note**: User mentioned platform fees might be added later. For now, assume 0%.

**Future Implementation**:
- Add `PLATFORM_FEE_BPS` constant (basis points, e.g., 50 = 0.5%)
- Apply fee to exchange rate: `adjustedRate = rate * (1 + platformFeeBps / 10000)`
- Display: `"3.90 MZN = 1 ZAR"` (with fee) vs `"3.88 MZN = 1 ZAR"` (without fee)

**Example**:
```typescript
const PLATFORM_FEE_BPS = 0 // 0% for now, can be configured later
const platformFeeMultiplier = 1 + (PLATFORM_FEE_BPS / 10000)
const adjustedRate = rate * platformFeeMultiplier
```

---

## Implementation Checklist

- [ ] Create `src/lib/exchangeRates/useExchangeRates.ts` hook
- [ ] Add `CARD_TO_EXCHANGE_CURRENCY` mapping in `CardStackCard.tsx`
- [ ] Replace APY calculation with exchange rate logic
- [ ] Update pill rendering to show exchange rate format
- [ ] Handle loading states (show APY fallback while loading)
- [ ] Handle error states (fallback to APY if API fails)
- [ ] Test with all card types (ZAR, USD, MZN, ETH, BTC, yieldSurprise)
- [ ] Verify cache works (5-minute TTL)
- [ ] Test network failure scenarios
- [ ] Add TypeScript types for exchange rate data
- [ ] Consider adding retry logic for failed API calls
- [ ] (Future) Add platform fee configuration

---

## Edge Cases

1. **API Failure**: Fallback to APY display
2. **Network Slow**: Show APY while loading, then swap to exchange rate
3. **Invalid Currency**: Skip exchange rate, show APY
4. **Cache Miss**: Fetch fresh data
5. **Multiple Cards**: Fetch all required currencies in one API call (batch)
6. **Rate = 0 or null**: Fallback to APY

---

## Testing

1. **Manual Testing**:
   - Verify ZAR card (should show APY or "1 ZAR = 1 ZAR")
   - Verify USD card shows "X.XX USD = 1 ZAR"
   - Verify MZN card shows "X.XX MZN = 1 ZAR"
   - Verify ETH/BTC cards still show APY
   - Verify yieldSurprise shows countdown timer
   - Test with network offline (should fallback to APY)
   - Test cache (refresh page, should use cached rates for 5 minutes)

2. **API Response Validation**:
   - Test with valid response
   - Test with `success: false`
   - Test with missing currency in response
   - Test with rate = 0

---

## Notes

- **Base Currency**: Always ZAR (as per user requirement)
- **Display Format**: Always "X.XX {CURRENCY} = 1 ZAR"
- **Platform Fee**: 0% for now, can be added later
- **Crypto Cards**: Keep APY (ETH, BTC don't have fiat exchange rates)
- **Cache Duration**: 5 minutes (configurable)
- **Error Handling**: Graceful fallback to APY



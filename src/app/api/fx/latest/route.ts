import { NextRequest, NextResponse } from 'next/server'

// Switch to open.er-api.com (free, no API key required)
const EXCHANGE_RATE_API_BASE = 'https://open.er-api.com/v6/latest/ZAR'
const CACHE_DURATION_MS = 120 * 1000 // 120 seconds (2 minutes)

// In-memory cache
let rateCache: {
  data: {
    base: string
    timestamp: number
    rates: Record<string, number | null>
  } | null
  timestamp: number
} = {
  data: null,
  timestamp: 0,
}

/**
 * Fetch exchange rates from open.er-api.com (free, no key required)
 */
async function fetchExchangeRates(symbols: string[]): Promise<{
  base: string
  timestamp: number
  rates: Record<string, number | null>
}> {
  const response = await fetch(EXCHANGE_RATE_API_BASE, {
    next: { revalidate: 120 }, // Next.js revalidation (120 seconds)
  })

  if (!response.ok) {
    throw new Error(`Exchange rate API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // open.er-api.com returns { result: "success", rates: { ... } }
  if (data.result !== 'success' || !data.rates) {
    throw new Error('Exchange rate API returned unsuccessful response')
  }

  // Extract rates for requested symbols (return null if not found)
  const rates: Record<string, number | null> = {}
  symbols.forEach((symbol) => {
    const rate = data.rates?.[symbol]
    if (rate !== undefined && rate !== null && typeof rate === 'number') {
      rates[symbol] = rate
    } else {
      rates[symbol] = null
    }
  })

  return {
    base: 'ZAR',
    timestamp: Date.now(),
    rates,
  }
}

export async function GET(request: NextRequest) {
  // Always return 200 with stable JSON shape (never throw or return 5xx)
  const searchParams = request.nextUrl.searchParams
  const symbolsParam = searchParams.get('symbols')

  if (!symbolsParam) {
    return NextResponse.json({
      ok: false,
      base: 'ZAR',
      rates: {},
      source: 'error',
      ts: Date.now(),
      error: 'Missing required parameter: symbols',
    })
  }

  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0)

  if (symbols.length === 0) {
    return NextResponse.json({
      ok: false,
      base: 'ZAR',
      rates: {},
      source: 'error',
      ts: Date.now(),
      error: 'Invalid symbols parameter',
    })
  }

  // Check cache
  const now = Date.now()
  const cacheAge = now - rateCache.timestamp
  const isCacheValid = cacheAge < CACHE_DURATION_MS && rateCache.data !== null

  if (isCacheValid && rateCache.data) {
    // Return cached data (filter to only requested symbols)
    const cachedRates: Record<string, number | null> = {}
    symbols.forEach((symbol) => {
      cachedRates[symbol] = rateCache.data!.rates[symbol] ?? null
    })

    return NextResponse.json({
      ok: true,
      base: rateCache.data.base,
      rates: cachedRates,
      source: 'cache',
      ts: rateCache.data.timestamp,
    })
  }

  // Fetch fresh data
  try {
    const freshData = await fetchExchangeRates(symbols)

    // Update cache
    rateCache = {
      data: freshData,
      timestamp: now,
    }

    return NextResponse.json({
      ok: true,
      base: freshData.base,
      rates: freshData.rates,
      source: 'api',
      ts: freshData.timestamp,
    })
  } catch (fetchError) {
    // If fetch fails but we have cached data, return it even if stale
    if (rateCache.data) {
      console.warn('[FX API] Fetch failed, returning stale cache:', fetchError)
      const staleRates: Record<string, number | null> = {}
      symbols.forEach((symbol) => {
        staleRates[symbol] = rateCache.data!.rates[symbol] ?? null
      })

      return NextResponse.json({
        ok: true,
        base: rateCache.data.base,
        rates: staleRates,
        source: 'stale-cache',
        ts: rateCache.data.timestamp,
      })
    }

    // No cache available - return null rates but still 200 OK
    console.error('[FX API] Fetch failed and no cache available:', fetchError)
    const nullRates: Record<string, null> = {}
    symbols.forEach((symbol) => {
      nullRates[symbol] = null
    })

    return NextResponse.json({
      ok: false,
      base: 'ZAR',
      rates: nullRates,
      source: 'error',
      ts: now,
      error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
    })
  }
}


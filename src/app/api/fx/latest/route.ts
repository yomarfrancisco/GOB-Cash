import { NextRequest, NextResponse } from 'next/server'

const EXCHANGE_RATE_API_BASE = 'https://api.exchangerate.host/latest'
const CACHE_DURATION_MS = 120 * 1000 // 120 seconds (2 minutes)

// In-memory cache
let rateCache: {
  data: {
    base: string
    timestamp: number
    rates: Record<string, number>
  } | null
  timestamp: number
} = {
  data: null,
  timestamp: 0,
}

/**
 * Fetch exchange rates from exchangerate.host API
 */
async function fetchExchangeRates(symbols: string[]): Promise<{
  base: string
  timestamp: number
  rates: Record<string, number>
}> {
  const symbolsParam = symbols.join(',')
  const url = `${EXCHANGE_RATE_API_BASE}?base=ZAR&symbols=${symbolsParam}`

  const response = await fetch(url, {
    next: { revalidate: 120 }, // Next.js revalidation (120 seconds)
  })

  if (!response.ok) {
    throw new Error(`Exchange rate API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (!data.success) {
    throw new Error('Exchange rate API returned unsuccessful response')
  }

  // Extract rates for requested symbols
  const rates: Record<string, number> = {}
  symbols.forEach((symbol) => {
    const rate = data.rates?.[symbol]
    if (rate !== undefined && rate !== null) {
      rates[symbol] = rate
    }
  })

  return {
    base: 'ZAR',
    timestamp: Date.now(),
    rates,
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const symbolsParam = searchParams.get('symbols')

    if (!symbolsParam) {
      return NextResponse.json(
        { error: 'Missing required parameter: symbols' },
        { status: 400 }
      )
    }

    const symbols = symbolsParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0)

    if (symbols.length === 0) {
      return NextResponse.json(
        { error: 'Invalid symbols parameter' },
        { status: 400 }
      )
    }

    // Check cache
    const now = Date.now()
    const cacheAge = now - rateCache.timestamp
    const isCacheValid = cacheAge < CACHE_DURATION_MS && rateCache.data !== null

    if (isCacheValid && rateCache.data) {
      // Return cached data (filter to only requested symbols)
      const cachedRates: Record<string, number> = {}
      symbols.forEach((symbol) => {
        if (rateCache.data!.rates[symbol] !== undefined) {
          cachedRates[symbol] = rateCache.data!.rates[symbol]
        }
      })

      return NextResponse.json({
        base: rateCache.data.base,
        timestamp: rateCache.data.timestamp,
        rates: cachedRates,
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

      return NextResponse.json(freshData)
    } catch (fetchError) {
      // If fetch fails but we have cached data, return it even if stale
      if (rateCache.data) {
        console.warn('[FX API] Fetch failed, returning stale cache:', fetchError)
        const staleRates: Record<string, number> = {}
        symbols.forEach((symbol) => {
          if (rateCache.data!.rates[symbol] !== undefined) {
            staleRates[symbol] = rateCache.data!.rates[symbol]
          }
        })

        return NextResponse.json({
          base: rateCache.data.base,
          timestamp: rateCache.data.timestamp,
          rates: staleRates,
        })
      }

      // No cache available, return error
      console.error('[FX API] Fetch failed and no cache available:', fetchError)
      return NextResponse.json(
        {
          error: 'Failed to fetch exchange rates',
          message: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        },
        { status: 503 }
      )
    }
  } catch (error) {
    console.error('[FX API] Unexpected error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}


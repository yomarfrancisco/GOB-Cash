import { NextRequest, NextResponse } from 'next/server'
import { quoteMznPerZar } from '@/lib/mznZar'

const CACHE_DURATION_MS = 120 * 1000 // 120 seconds (2 minutes)

function fxLatestZarUrl(): string {
  // EXCHANGE_RATE_API_KEY is set on Vercel; Pro returns conversion_rates.
  const key = process.env.EXCHANGE_RATE_API_KEY
  if (key) return `https://v6.exchangerate-api.com/v6/${key}/latest/ZAR`
  return 'https://open.er-api.com/v6/latest/ZAR'
}

function ratesFromPayload(data: {
  conversion_rates?: Record<string, number>
  rates?: Record<string, number>
}) {
  return data.conversion_rates || data.rates
}

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
 * Fetch ZAR-based rates from ExchangeRate-API Pro, or the free feed if no key is set.
 */
async function fetchExchangeRates(symbols: string[]): Promise<{
  base: string
  timestamp: number
  rates: Record<string, number | null>
}> {
  const response = await fetch(fxLatestZarUrl(), {
    next: { revalidate: 120 },
  })

  if (!response.ok) {
    throw new Error(`Exchange rate API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const rawRates = ratesFromPayload(data)

  if (data.result !== 'success' || !rawRates) {
    throw new Error('Exchange rate API returned unsuccessful response')
  }

  const rates: Record<string, number | null> = {}
  symbols.forEach((symbol) => {
    const rate = rawRates?.[symbol]
    if (rate !== undefined && rate !== null && typeof rate === 'number') {
      rates[symbol] = symbol === 'MZN' ? quoteMznPerZar(rate) : rate
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

  const now = Date.now()
  const cacheAge = now - rateCache.timestamp
  const isCacheValid = cacheAge < CACHE_DURATION_MS && rateCache.data !== null

  if (isCacheValid && rateCache.data) {
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

  try {
    const freshData = await fetchExchangeRates(symbols)

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

import { NextRequest, NextResponse } from 'next/server'
import { quoteMznPerZar } from '@/lib/mznZar'

const CACHE_DURATION_MS = 120 * 1000 // 120 seconds (2 minutes)

/** Always keep these in the in-memory cache so Mt/$ and corridor quotes stay live. */
const CORE_SYMBOLS = ['USD', 'MZN'] as const

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

function pickRates(
  rawRates: Record<string, number>,
  symbols: string[]
): Record<string, number | null> {
  const rates: Record<string, number | null> = {}
  symbols.forEach((symbol) => {
    const rate = rawRates?.[symbol]
    if (rate !== undefined && rate !== null && typeof rate === 'number' && Number.isFinite(rate)) {
      rates[symbol] = symbol === 'MZN' ? quoteMznPerZar(rate) : rate
    } else {
      rates[symbol] = null
    }
  })
  return rates
}

/**
 * Fetch ZAR-based rates from ExchangeRate-API Pro, or the free feed if no key is set.
 * Always pulls CORE_SYMBOLS plus any extras so USD cannot go missing from a MZN-only request.
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

  const fetchSymbols = Array.from(new Set([...CORE_SYMBOLS, ...symbols]))
  return {
    base: 'ZAR',
    timestamp: Date.now(),
    rates: pickRates(rawRates, fetchSymbols),
  }
}

function cacheHasAllSymbols(symbols: string[]): boolean {
  if (!rateCache.data) return false
  return symbols.every((symbol) => Object.prototype.hasOwnProperty.call(rateCache.data!.rates, symbol))
}

function ratesForSymbols(symbols: string[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  symbols.forEach((symbol) => {
    out[symbol] = rateCache.data?.rates[symbol] ?? null
  })
  return out
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
  const isCacheValid =
    cacheAge < CACHE_DURATION_MS && rateCache.data !== null && cacheHasAllSymbols(symbols)

  if (isCacheValid && rateCache.data) {
    return NextResponse.json({
      ok: true,
      base: rateCache.data.base,
      rates: ratesForSymbols(symbols),
      source: 'cache',
      ts: rateCache.data.timestamp,
    })
  }

  try {
    const freshData = await fetchExchangeRates(symbols)
    const mergedRates = {
      ...(rateCache.data?.rates || {}),
      ...freshData.rates,
    }

    rateCache = {
      data: {
        base: freshData.base,
        timestamp: freshData.timestamp,
        rates: mergedRates,
      },
      timestamp: now,
    }

    return NextResponse.json({
      ok: true,
      base: freshData.base,
      rates: ratesForSymbols(symbols),
      source: 'api',
      ts: freshData.timestamp,
    })
  } catch (fetchError) {
    if (rateCache.data) {
      console.warn('[FX API] Fetch failed, returning stale cache:', fetchError)
      return NextResponse.json({
        ok: true,
        base: rateCache.data.base,
        rates: ratesForSymbols(symbols),
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

import { useState, useEffect } from 'react'

export type FxRates = {
  ok: boolean
  base: string
  timestamp?: number
  rates: Record<string, number | null>
  source?: string
  error?: string
}

type UseFxRatesResult = {
  rates: FxRates | null
  loading: boolean
  error: Error | null
}

type UseFxRatesOptions = {
  /** Quiet refetch interval while the desk is open (ms). */
  refreshMs?: number
}

/**
 * Hook to fetch exchange rates from our server-side API
 *
 * @param symbols - Array of currency symbols to fetch (e.g., ['USD', 'MZN'])
 * @returns Object with rates, loading state, and error
 */
export function useFxRates(symbols: string[], options?: UseFxRatesOptions): UseFxRatesResult {
  const [rates, setRates] = useState<FxRates | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const refreshMs = options?.refreshMs && options.refreshMs > 0 ? options.refreshMs : 0
  const symbolsKey = symbols.join(',')

  useEffect(() => {
    // Skip if no symbols requested
    if (symbols.length === 0) {
      setLoading(false)
      setRates(null)
      setError(null)
      return
    }

    let cancelled = false

    const fetchRates = async (quiet = false) => {
      if (!quiet) {
        setLoading(true)
        setError(null)
      }

      try {
        const url = `/api/fx/latest?symbols=${symbolsKey}`
        const response = await fetch(url)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(
            errorData.message || `Failed to fetch exchange rates: ${response.status}`
          )
        }

        const data: FxRates = await response.json()
        if (cancelled) return

        // Always set rates (even if ok=false, rates may have null values)
        setRates(data)
        setError(data.ok === false ? new Error(data.error || 'Failed to fetch rates') : null)
      } catch (err) {
        if (cancelled) return
        console.error('[useFxRates] Failed to fetch rates:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
        // Keep existing rates on error (don't clear)
      } finally {
        if (!cancelled && !quiet) setLoading(false)
      }
    }

    void fetchRates(false)
    if (!refreshMs) {
      return () => {
        cancelled = true
      }
    }

    const timer = window.setInterval(() => {
      void fetchRates(true)
    }, refreshMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [symbolsKey, refreshMs, symbols.length])

  return { rates, loading, error }
}

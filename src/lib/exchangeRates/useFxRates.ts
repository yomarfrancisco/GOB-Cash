import { useState, useEffect } from 'react'

export type FxRates = {
  base: string
  timestamp: number
  rates: Record<string, number>
}

type UseFxRatesResult = {
  rates: FxRates | null
  loading: boolean
  error: Error | null
}

/**
 * Hook to fetch exchange rates from our server-side API
 * 
 * @param symbols - Array of currency symbols to fetch (e.g., ['USD', 'MZN'])
 * @returns Object with rates, loading state, and error
 */
export function useFxRates(symbols: string[]): UseFxRatesResult {
  const [rates, setRates] = useState<FxRates | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Skip if no symbols requested
    if (symbols.length === 0) {
      setLoading(false)
      setRates(null)
      setError(null)
      return
    }

    const fetchRates = async () => {
      setLoading(true)
      setError(null)

      try {
        const symbolsParam = symbols.join(',')
        const url = `/api/fx/latest?symbols=${symbolsParam}`

        const response = await fetch(url)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(
            errorData.message || `Failed to fetch exchange rates: ${response.status}`
          )
        }

        const data: FxRates = await response.json()

        setRates(data)
        setError(null)
      } catch (err) {
        console.error('[useFxRates] Failed to fetch rates:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
        // Keep existing rates on error (don't clear)
      } finally {
        setLoading(false)
      }
    }

    fetchRates()
  }, [symbols.join(',')]) // Re-fetch if symbols change

  return { rates, loading, error }
}


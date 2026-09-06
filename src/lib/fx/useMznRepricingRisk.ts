'use client'

import { useEffect } from 'react'
import { create } from 'zustand'
import { repricingRiskAriaLevel, repricingRiskBarPercent } from './repricingRiskBar'

type RiskState = {
  dataStatus: string
  riskScore: number | null
  loaded: boolean
  barPercent: number
  ariaLevel: ReturnType<typeof repricingRiskAriaLevel>
}

const useStore = create<RiskState>(() => ({
  dataStatus: 'unavailable',
  riskScore: null,
  loaded: false,
  barPercent: 0,
  ariaLevel: 'unavailable',
}))

let fetchStarted = false

async function loadSnapshot(): Promise<void> {
  if (fetchStarted) return
  fetchStarted = true
  try {
    const response = await fetch('/api/fx/repricing-risk')
    const data = (await response.json().catch(() => null)) as {
      dataStatus?: string
      zarPayoutRiskScore?: number | null
      riskScore?: number | null
    } | null
    const next = {
      dataStatus: data?.dataStatus || 'unavailable',
      riskScore: typeof data?.zarPayoutRiskScore === 'number' ? data.zarPayoutRiskScore : null,
    }
    useStore.setState({
      ...next,
      loaded: true,
      barPercent: repricingRiskBarPercent(next),
      ariaLevel: repricingRiskAriaLevel(next),
    })
  } catch {
    useStore.setState({
      dataStatus: 'unavailable',
      riskScore: null,
      loaded: true,
      barPercent: 0,
      ariaLevel: 'unavailable',
    })
  }
}

export function useZarPayoutRiskBar(): { barPercent: number; ariaLevel: RiskState['ariaLevel'] } {
  const barPercent = useStore((state) => state.barPercent)
  const ariaLevel = useStore((state) => state.ariaLevel)

  useEffect(() => {
    void loadSnapshot()
  }, [])

  return { barPercent, ariaLevel }
}

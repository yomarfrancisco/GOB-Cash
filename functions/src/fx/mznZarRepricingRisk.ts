/**
 * One-hour ZAR/MZN benchmark repricing-risk measure.
 * Historical breach frequency of hourly MZN-per-ZAR moves. Not an executable quote.
 */

export const REPRICING_THRESHOLD_BPS = 50
export const MIN_SAMPLE_COUNT = 48
export const ROLLING_WINDOW_DAYS = 90
export const MIN_HOURLY_GAP_MS = 45 * 60 * 1000
export const MAX_HOURLY_GAP_MS = 75 * 60 * 1000
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000

export const FX_HOURLY_COLLECTION = 'fxHourlyMznZar'
export const FX_RISK_SNAPSHOT_COLLECTION = 'fxSnapshots'
export const FX_RISK_SNAPSHOT_ID = 'mznZarRepricingRisk'

export type RepricingDataStatus = 'learning' | 'ready' | 'stale' | 'unavailable'

export type HourlyMznZarObservation = {
  providerUpdatedAt: number
  retrievedAt: number
  usdZar: number
  usdMzn: number
  mznZar: number
}

export type RepricingRiskSnapshot = {
  riskScore: number
  thresholdBps: number
  sampleCount: number
  breachCount: number
  windowStart: number | null
  windowEnd: number | null
  calculatedAt: number
  dataStatus: RepricingDataStatus
  providerUpdatedAt: number | null
}

export type PersistDecision = 'save' | 'duplicate' | 'stale'

export function resolveThresholdBps(configured?: number | null): number {
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
    return configured
  }
  return REPRICING_THRESHOLD_BPS
}

export function resolveMinSampleCount(configured?: number | null): number {
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured)
  }
  return MIN_SAMPLE_COUNT
}

export function deriveMznPerZar(usdMzn: number, usdZar: number): number | null {
  if (!Number.isFinite(usdMzn) || !Number.isFinite(usdZar) || usdMzn <= 0 || usdZar <= 0) {
    return null
  }
  return usdMzn / usdZar
}

export function hourlyPercentageChange(previousMznZar: number, currentMznZar: number): number | null {
  if (
    !Number.isFinite(previousMznZar) ||
    !Number.isFinite(currentMznZar) ||
    previousMznZar <= 0 ||
    currentMznZar <= 0
  ) {
    return null
  }
  return Math.abs(currentMznZar / previousMznZar - 1)
}

export function isThresholdBreach(hourlyChange: number, thresholdBps = REPRICING_THRESHOLD_BPS): boolean {
  return hourlyChange >= thresholdBps / 10_000
}

export function isRegularHourlyGap(previousAt: number, currentAt: number): boolean {
  const gap = currentAt - previousAt
  return gap >= MIN_HOURLY_GAP_MS && gap <= MAX_HOURLY_GAP_MS
}

export function isStaleObservation(providerUpdatedAt: number, retrievedAt: number): boolean {
  return retrievedAt - providerUpdatedAt > STALE_AFTER_MS
}

export function observationPersistDecision(
  observation: HourlyMznZarObservation,
  existingProviderUpdatedAt: Iterable<number>,
  retrievedAt: number = observation.retrievedAt
): PersistDecision {
  if (isStaleObservation(observation.providerUpdatedAt, retrievedAt)) return 'stale'
  for (const existing of existingProviderUpdatedAt) {
    if (existing === observation.providerUpdatedAt) return 'duplicate'
  }
  return 'save'
}

export function parseUsdLatestPayload(
  data: {
    result?: string
    time_last_update_unix?: number
    conversion_rates?: Record<string, number>
    rates?: Record<string, number>
  },
  retrievedAt: number
): HourlyMznZarObservation | null {
  if (data?.result !== 'success') return null
  const providerUpdatedAt = Number(data.time_last_update_unix) * 1000
  if (!Number.isFinite(providerUpdatedAt) || providerUpdatedAt <= 0) return null

  const rates = data.conversion_rates || data.rates
  const usdZar = Number(rates?.ZAR)
  const usdMzn = Number(rates?.MZN)
  const mznZar = deriveMznPerZar(usdMzn, usdZar)
  if (mznZar == null) return null

  return {
    providerUpdatedAt,
    retrievedAt,
    usdZar,
    usdMzn,
    mznZar,
  }
}

export function redactSecret(text: string, secret?: string | null): string {
  if (!secret) return text
  return text.split(secret).join('[redacted]')
}

export function unavailableSnapshot(calculatedAt: number, thresholdBps = REPRICING_THRESHOLD_BPS): RepricingRiskSnapshot {
  return {
    riskScore: 0,
    thresholdBps,
    sampleCount: 0,
    breachCount: 0,
    windowStart: null,
    windowEnd: null,
    calculatedAt,
    dataStatus: 'unavailable',
    providerUpdatedAt: null,
  }
}

function uniqueSorted(observations: HourlyMznZarObservation[]): HourlyMznZarObservation[] {
  const byProvider = new Map<number, HourlyMznZarObservation>()
  for (const observation of observations) {
    if (!Number.isFinite(observation.providerUpdatedAt) || observation.mznZar <= 0) continue
    if (!byProvider.has(observation.providerUpdatedAt)) {
      byProvider.set(observation.providerUpdatedAt, observation)
    }
  }
  return [...byProvider.values()].sort((a, b) => a.providerUpdatedAt - b.providerUpdatedAt)
}

export function buildRiskSnapshot(
  observations: HourlyMznZarObservation[],
  calculatedAt: number,
  options?: { thresholdBps?: number; minSampleCount?: number }
): RepricingRiskSnapshot {
  const thresholdBps = resolveThresholdBps(options?.thresholdBps)
  const minSampleCount = resolveMinSampleCount(options?.minSampleCount)
  const unique = uniqueSorted(observations)

  if (unique.length === 0) {
    return unavailableSnapshot(calculatedAt, thresholdBps)
  }

  const windowEnd = unique[unique.length - 1].providerUpdatedAt
  const oldest = unique[0].providerUpdatedAt
  const rollingCutoff = windowEnd - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const useRollingWindow = oldest < rollingCutoff
  const windowed = useRollingWindow
    ? unique.filter((observation) => observation.providerUpdatedAt >= rollingCutoff)
    : unique
  const windowStart = windowed[0]?.providerUpdatedAt ?? null

  let sampleCount = 0
  let breachCount = 0
  for (let i = 1; i < windowed.length; i += 1) {
    const previous = windowed[i - 1]
    const current = windowed[i]
    if (!isRegularHourlyGap(previous.providerUpdatedAt, current.providerUpdatedAt)) continue
    const change = hourlyPercentageChange(previous.mznZar, current.mznZar)
    if (change == null) continue
    sampleCount += 1
    if (isThresholdBreach(change, thresholdBps)) breachCount += 1
  }

  const riskScore = sampleCount === 0 ? 0 : (100 * breachCount) / sampleCount
  const latestStale = isStaleObservation(windowEnd, calculatedAt)
  let dataStatus: RepricingDataStatus = 'ready'
  if (latestStale) dataStatus = 'stale'
  else if (sampleCount < minSampleCount) dataStatus = 'learning'

  return {
    riskScore,
    thresholdBps,
    sampleCount,
    breachCount,
    windowStart,
    windowEnd,
    calculatedAt,
    dataStatus,
    providerUpdatedAt: windowEnd,
  }
}

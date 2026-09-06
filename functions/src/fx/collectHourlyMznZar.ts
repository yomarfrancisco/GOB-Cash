/**
 * Hourly USD-based ZAR/MZN benchmark collection and repricing-risk snapshot.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import {
  FX_HOURLY_COLLECTION,
  FX_RISK_SNAPSHOT_COLLECTION,
  FX_RISK_SNAPSHOT_ID,
  buildRiskSnapshot,
  observationPersistDecision,
  parseUsdLatestPayload,
  redactSecret,
  resolveMinSampleCount,
  resolveThresholdBps,
  unavailableSnapshot,
  type HourlyMznZarObservation,
} from './mznZarRepricingRisk'

const db = admin.firestore()

function exchangerateApiKey(): string | null {
  const key = process.env.EXCHANGE_RATE_API_KEY || functions.config()?.exchangerate?.key
  return typeof key === 'string' && key.length > 0 ? key : null
}

function fxLatestUsdUrl(key: string): string {
  return `https://v6.exchangerate-api.com/v6/${key}/latest/USD`
}

function configuredThresholdBps(): number {
  return resolveThresholdBps(Number(functions.config()?.fx?.repricing_threshold_bps))
}

function configuredMinSamples(): number {
  return resolveMinSampleCount(Number(functions.config()?.fx?.repricing_min_samples))
}

async function existingProviderTimestamps(): Promise<Set<number>> {
  const snap = await db.collection(FX_HOURLY_COLLECTION).select('providerUpdatedAt').get()
  const ids = new Set<number>()
  for (const doc of snap.docs) {
    const value = Number(doc.data().providerUpdatedAt ?? doc.id)
    if (Number.isFinite(value)) ids.add(value)
  }
  return ids
}

async function loadObservations(): Promise<HourlyMznZarObservation[]> {
  const snap = await db.collection(FX_HOURLY_COLLECTION).orderBy('providerUpdatedAt', 'asc').get()
  return snap.docs.map((doc) => {
    const data = doc.data()
    return {
      providerUpdatedAt: Number(data.providerUpdatedAt),
      retrievedAt: Number(data.retrievedAt),
      usdZar: Number(data.usdZar),
      usdMzn: Number(data.usdMzn),
      mznZar: Number(data.mznZar),
    }
  })
}

async function writeSnapshot(snapshot: ReturnType<typeof buildRiskSnapshot>): Promise<void> {
  await db.collection(FX_RISK_SNAPSHOT_COLLECTION).doc(FX_RISK_SNAPSHOT_ID).set(snapshot)
}

async function markUnavailable(calculatedAt: number): Promise<void> {
  await writeSnapshot(unavailableSnapshot(calculatedAt, configuredThresholdBps()))
}

async function recomputeSnapshot(calculatedAt: number): Promise<void> {
  const observations = await loadObservations()
  await writeSnapshot(
    buildRiskSnapshot(observations, calculatedAt, {
      thresholdBps: configuredThresholdBps(),
      minSampleCount: configuredMinSamples(),
    })
  )
}

export async function collectHourlyMznZarOnce(retrievedAt = Date.now()): Promise<void> {
  const key = exchangerateApiKey()
  if (!key) {
    console.warn('[MznZarHourly] ExchangeRate-API key missing')
    await markUnavailable(retrievedAt)
    return
  }

  try {
    const response = await fetch(fxLatestUsdUrl(key))
    if (!response.ok) {
      throw new Error(`FX HTTP ${response.status}`)
    }
    const payload = await response.json()
    const observation = parseUsdLatestPayload(payload, retrievedAt)
    if (!observation) {
      console.warn('[MznZarHourly] Invalid USD latest payload')
      await markUnavailable(retrievedAt)
      return
    }

    const existing = await existingProviderTimestamps()
    const decision = observationPersistDecision(observation, existing, retrievedAt)
    if (decision === 'stale') {
      console.warn('[MznZarHourly] Provider update is stale; not stored')
      await recomputeSnapshot(retrievedAt)
      return
    }
    if (decision === 'duplicate') {
      await recomputeSnapshot(retrievedAt)
      return
    }

    await db.collection(FX_HOURLY_COLLECTION).doc(String(observation.providerUpdatedAt)).set(observation)
    await recomputeSnapshot(retrievedAt)
  } catch (error) {
    const message = redactSecret(error instanceof Error ? error.message : String(error), key)
    console.error('[MznZarHourly] Collection failed', { error: message })
    await markUnavailable(retrievedAt)
  }
}

export const collectHourlyMznZar = functions.pubsub
  .schedule('every 1 hours')
  .timeZone('UTC')
  .onRun(async () => {
    await collectHourlyMznZarOnce()
  })

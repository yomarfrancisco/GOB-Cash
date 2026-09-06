import { NextResponse } from 'next/server'
import { getDb } from '@/lib/firebase-admin'
import { repricingRiskBarPercent } from '@/lib/fx/repricingRiskBar'

const SNAPSHOT_COLLECTION = 'fxSnapshots'
const SNAPSHOT_ID = 'mznZarRepricingRisk'

export async function GET() {
  try {
    const snap = await getDb().collection(SNAPSHOT_COLLECTION).doc(SNAPSHOT_ID).get()
    if (!snap.exists) {
      return NextResponse.json({
        dataStatus: 'unavailable',
        riskScore: null,
        barPercent: 0,
      })
    }

    const data = snap.data() || {}
    const dataStatus = typeof data.dataStatus === 'string' ? data.dataStatus : 'unavailable'
    const riskScore = dataStatus === 'ready' && typeof data.riskScore === 'number' ? data.riskScore : null

    return NextResponse.json({
      dataStatus,
      riskScore,
      thresholdBps: data.thresholdBps ?? null,
      sampleCount: data.sampleCount ?? 0,
      breachCount: data.breachCount ?? 0,
      windowStart: data.windowStart ?? null,
      windowEnd: data.windowEnd ?? null,
      calculatedAt: data.calculatedAt ?? null,
      providerUpdatedAt: data.providerUpdatedAt ?? null,
      barPercent: repricingRiskBarPercent({ dataStatus, riskScore }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unavailable'
    console.error('[repricing-risk] Snapshot read failed', { error: message })
    return NextResponse.json({
      dataStatus: 'unavailable',
      riskScore: null,
      barPercent: 0,
    })
  }
}

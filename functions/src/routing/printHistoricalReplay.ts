import { replayHistoricalCases } from './replayHistoricalCases'

const replay = replayHistoricalCases()
const brief = {
  caseABands: replay.caseA.map((row) => ({
    id: row.transactionId,
    band: row.snapshot.band,
    pair7d: row.snapshot.features.pair.count7d,
    pair24h: row.snapshot.features.cluster.pair24h,
    pair6h: row.snapshot.features.cluster.pair6h,
    card7d: row.snapshot.features.card.count7d,
    cardVol7d: row.snapshot.features.card.volume7d,
    merchAge: row.snapshot.features.merchant.daysSinceActivation,
    merchLife: row.snapshot.features.merchant.lifetimeCount,
    baseline: row.snapshot.features.merchant.profileConfidence.category,
  })),
  caseBBands: replay.caseB.map((row) => ({
    id: row.transactionId,
    band: row.snapshot.band,
    pair7d: row.snapshot.features.pair.count7d,
    pair24h: row.snapshot.features.cluster.pair24h,
    merchAge: row.snapshot.features.merchant.daysSinceActivation,
    merchLife: row.snapshot.features.merchant.lifetimeCount,
    merch1d: row.snapshot.features.merchant.count1d,
    baseline: row.snapshot.features.merchant.profileConfidence.category,
    card7d: row.snapshot.features.card.count7d,
  })),
  comparison: replay.comparison,
}
console.log(JSON.stringify(brief, null, 2))

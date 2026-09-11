/**
 * Descriptive friction assessment. Observe and explain. Never routes.
 */

import { formatZar } from './conversionRouter'
import type { FrictionSnapshot } from './frictionFeatures'
import { buildFrictionSnapshot } from './frictionFeatures'
import type { DeskReview, DeskTx, MerchantProfile } from './frictionHistory'
import { merchantProfile } from './frictionHistory'
import { resolveNamedCardIds, resolveNamedMachineIds } from './inventory'

export type FrictionBand = 'low' | 'elevated' | 'high' | 'insufficient_history'

export type FrictionAssessment = {
  band: FrictionBand
  title: string
  body: string
  line: string | null
  dimensions: {
    card: FrictionBand
    merchant: FrictionBand
    pair: FrictionBand
    profile: FrictionBand
    review: FrictionBand
  }
  resemble: Array<'high_severity_cross_institution_review' | 'new_merchant_algorithmic_profile_review'>
}

export type KnownCase = {
  tag: 'high_severity_cross_institution_review' | 'new_merchant_algorithmic_profile_review'
  label: string
  facts: string
}

export const KNOWN_CASES: KnownCase[] = [
  {
    tag: 'high_severity_cross_institution_review',
    label: 'BIM/FNB long review',
    facts:
      'A BIM/FNB case on file ran about 5–6 weeks. Observed traits: repeated high-value card-present activity, high card×merchant concentration, same-day repeats, a fast step-up from little prior card history, and an acquirer question about split sales. Issuer and acquirer were both involved. Network escalation and same-name ownership are hypotheses only.',
  },
  {
    tag: 'new_merchant_algorithmic_profile_review',
    label: 'Capitec new-merchant flag',
    facts:
      'A Capitec acquiring profile activated 15 July 2026 was flagged around 20 July after 7 transactions totalling about R71,200 (R100–R21,000). The analyst said the algorithm flagged it and asked what normal should look like — industry, typical ticket, local vs international mix. Too few observations to establish a pattern. After that calibration the merchant ran without a further apparent problem.',
  },
]

function pct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'n/a'
  return `${Math.round(value * 100)}%`
}

function bandMax(...bands: FrictionBand[]): FrictionBand {
  if (bands.includes('high')) return 'high'
  if (bands.includes('elevated')) return 'elevated'
  if (bands.includes('insufficient_history')) return 'insufficient_history'
  return 'low'
}

function cardBand(snap: FrictionSnapshot): FrictionBand {
  const vs = snap.card.amountVsMedian30d
  if (snap.card.declineCount30d > 0) return 'elevated'
  if (vs != null && vs >= 2 && snap.card.count30d >= 4) return 'elevated'
  if (snap.card.count1d >= 3 || snap.card.volume7d >= 80_000) return 'elevated'
  return 'low'
}

function pairBand(snap: FrictionSnapshot): FrictionBand {
  if (snap.cluster.pair6h >= 3 || snap.cluster.pair24h >= 4) return 'high'
  const thinMerchant =
    snap.merchant.daysSinceActivation != null && snap.merchant.daysSinceActivation <= 14
  if (thinMerchant) return 'low'
  if (snap.pair.count7d >= 3 || (snap.pair.shareOfCard30d != null && snap.pair.shareOfCard30d >= 0.55)) {
    return 'elevated'
  }
  return 'low'
}

function merchantBand(snap: FrictionSnapshot): FrictionBand {
  const age = snap.merchant.daysSinceActivation
  if (age != null && age <= 14 && snap.merchant.lifetimeCount <= 12) return 'insufficient_history'
  if (
    age != null &&
    snap.merchant.lifetimeCount > 0 &&
    snap.merchant.lifetimeCount < 8 &&
    snap.merchant.profileConfidence < 0.25
  ) {
    return 'insufficient_history'
  }
  return 'low'
}

function profileBand(snap: FrictionSnapshot): FrictionBand {
  return merchantBand(snap)
}

function reviewBand(snap: FrictionSnapshot): FrictionBand {
  if (snap.card.reviewCount30d >= 2 || snap.card.declineCount30d >= 1) return 'elevated'
  const pair = pairBand(snap)
  if (pair === 'high' && snap.card.volume7d >= 40_000) return 'high'
  if (pair === 'elevated') return 'elevated'
  return 'low'
}

function resembleOf(snap: FrictionSnapshot): FrictionAssessment['resemble'] {
  const out: FrictionAssessment['resemble'] = []
  if (
    (snap.cluster.pair6h >= 3 || snap.cluster.pair24h >= 4) &&
    (snap.pair.shareOfCard30d == null || snap.pair.shareOfCard30d >= 0.4) &&
    snap.card.count7d >= 4
  ) {
    out.push('high_severity_cross_institution_review')
  }
  if (
    snap.merchant.daysSinceActivation != null &&
    snap.merchant.daysSinceActivation <= 10 &&
    snap.merchant.lifetimeCount <= 10
  ) {
    out.push('new_merchant_algorithmic_profile_review')
  }
  return out
}

export function assessFriction(snap: FrictionSnapshot): FrictionAssessment {
  const dimensions = {
    card: cardBand(snap),
    merchant: merchantBand(snap),
    pair: pairBand(snap),
    profile: profileBand(snap),
    review: reviewBand(snap),
  }
  const resemble = resembleOf(snap)
  const band = bandMax(dimensions.card, dimensions.merchant, dimensions.pair, dimensions.review)
  const reasons: string[] = []

  if (dimensions.merchant === 'insufficient_history') {
    const age =
      snap.merchant.daysSinceActivation == null
        ? 'unknown age'
        : `${Math.max(1, Math.round(snap.merchant.daysSinceActivation))} days old`
    reasons.push(
      `${snap.merchantName} is ${age} with ${snap.merchant.lifetimeCount} observed transaction${
        snap.merchant.lifetimeCount === 1 ? '' : 's'
      }. Current ticket ${formatZar(snap.amountZar)} sits on a thin merchant baseline.`
    )
    if (dimensions.card === 'low') {
      reasons.push('Card-side history does not show a material anomaly from the available consortium data.')
    }
  }
  if (dimensions.pair === 'high' || dimensions.pair === 'elevated') {
    const window =
      snap.cluster.pair6h >= 3 ? `${snap.cluster.pair6h} times in 6 hours` : `${snap.cluster.pair24h} times in 24 hours`
    if (snap.cluster.pair6h >= 2 || snap.cluster.pair24h >= 2) {
      reasons.push(
        `Same card/merchant pair has been used ${window}. 7-day pair concentration is ${pct(
          snap.pair.shareOfCard30d
        )} of this card.`
      )
    } else if (snap.pair.count7d >= 3) {
      reasons.push(
        `${snap.cardName} on ${snap.merchantName} has ${snap.pair.count7d} desk swipes in 7 days.`
      )
    }
    if (resemble.includes('high_severity_cross_institution_review')) {
      reasons.push('This resembles a previously reviewed clustering pattern. That resemblance is not a cause.')
    }
  }
  if (dimensions.card === 'elevated' && snap.card.amountVsMedian30d && snap.card.amountVsMedian30d >= 1.5) {
    reasons.push(
      `This swipe is ${snap.card.amountVsMedian30d.toFixed(1)}× ${snap.cardName}'s 30-day median.`
    )
  }
  if (snap.card.declineCount30d > 0) {
    reasons.push(`${snap.cardName} has ${snap.card.declineCount30d} decline${snap.card.declineCount30d === 1 ? '' : 's'} on file in 30 days.`)
  }

  if (band === 'low') {
    return {
      band,
      title: 'Friction: Low',
      body: `${snap.cardName} on ${snap.merchantName} does not materially differ from the available desk baseline.`,
      line: null,
      dimensions,
      resemble,
    }
  }

  const title =
    band === 'high'
      ? 'Friction: High'
      : band === 'insufficient_history'
        ? 'Friction: Insufficient history'
        : 'Friction: Elevated'
  const body = reasons.join(' ')
  return {
    band,
    title,
    body,
    line: `${title}\n${body}`,
    dimensions,
    resemble,
  }
}

export function assessProposedRoute(params: {
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
  history: DeskTx[]
  reviews?: DeskReview[]
  nowMs: number
  profiles?: MerchantProfile[]
}): FrictionAssessment | null {
  if (!params.assignments.length) return null
  const ranked = params.assignments.map((row) => {
    const snap = buildFrictionSnapshot({
      proposed: row,
      history: params.history,
      reviews: params.reviews,
      nowMs: params.nowMs,
      merchant: merchantProfile(row.machineId, params.profiles),
    })
    return assessFriction(snap)
  })
  const order: FrictionBand[] = ['high', 'elevated', 'insufficient_history', 'low']
  ranked.sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band))
  return ranked[0] || null
}

export function formatObserveLine(assessment: FrictionAssessment | null): string | null {
  if (!assessment || assessment.band === 'low' || !assessment.line) return null
  return assessment.line
}

export { isFrictionAsk } from './routingTime'

function snapshotForAsk(params: {
  message: string
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
  history: DeskTx[]
  reviews?: DeskReview[]
  nowMs: number
}): FrictionSnapshot | null {
  const namedCard = resolveNamedCardIds(params.message)[0]
  const namedPos = resolveNamedMachineIds(params.message)[0]
  const fallback = params.assignments[0]
  const cardId = namedCard || fallback?.cardId
  const machineId = namedPos || fallback?.machineId
  const amount = fallback?.amount || 0
  if (!cardId || !machineId) return null
  return buildFrictionSnapshot({
    proposed: { cardId, machineId, amount },
    history: params.history,
    reviews: params.reviews,
    nowMs: params.nowMs,
  })
}

export function answerFrictionAsk(params: {
  message: string
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
  history: DeskTx[]
  reviews?: DeskReview[]
  nowMs: number
}): { title: string; body: string } {
  const text = params.message.trim().toLowerCase()
  const snap = snapshotForAsk(params)
  const assessment = snap ? assessFriction(snap) : null

  if (/\bwhy did capitec\b/.test(text) || (/\bcapitec\b/.test(text) && /\bflag\b/.test(text))) {
    return {
      title: 'Capitec case on file',
      body: KNOWN_CASES[1].facts,
    }
  }
  if (/\bsimilar to (?:the )?bim\b/.test(text) || /\bbim case\b/.test(text)) {
    const overlap = assessment?.resemble.includes('high_severity_cross_institution_review')
    return {
      title: overlap ? 'Overlaps the BIM/FNB pattern' : 'BIM/FNB case on file',
      body: [
        KNOWN_CASES[0].facts,
        overlap
          ? 'The open pair shows short-window clustering and high pair concentration, which overlaps those observed traits. Overlap is not proof of the same review path.'
          : assessment
            ? 'The open pair does not currently match that clustering signature from the available desk history.'
            : 'There is no open pair to compare.',
      ].join(' '),
    }
  }
  if (/\bhow old is (?:this |the )?merchant\b/.test(text) || /\bmerchant profile\b/.test(text)) {
    if (!snap) {
      return { title: 'No merchant on the desk', body: 'There is no open restock pair and no named POS to age.' }
    }
    const age =
      snap.merchant.daysSinceActivation == null
        ? `${snap.merchantName} has no activation date on file.`
        : `${snap.merchantName} is ${Math.max(1, Math.round(snap.merchant.daysSinceActivation))} days since the activation date on file.`
    return {
      title: `${snap.merchantName} profile`,
      body: `${age} Lifetime ${snap.merchant.lifetimeCount} transactions, ${formatZar(
        snap.merchant.lifetimeVolume
      )}. Profile confidence ${snap.merchant.profileConfidence.toFixed(
        2
      )} — that is confidence in the observed baseline, not a fraud probability.`,
    }
  }
  if (/\bconsortium\b/.test(text)) {
    if (!snap) return { title: 'No card on the desk', body: 'Name a card, or open a restock, to read consortium share.' }
    return {
      title: `${snap.cardName} consortium share`,
      body: `Of ${snap.cardName}'s last 30 days on the desk log, ${pct(
        snap.card.consortiumShare30d
      )} is marked consortium. Imported statements can lower that share once they are backfilled.`,
    }
  }
  if (/\bhow many times\b/.test(text)) {
    if (!snap) return { title: 'No pair on the desk', body: 'Name a card and POS, or open a restock.' }
    return {
      title: `${snap.cardName} on ${snap.merchantName}`,
      body: `This week: ${snap.pair.count7d} swipe${snap.pair.count7d === 1 ? '' : 's'} (${formatZar(
        snap.pair.volume7d
      )}). Last 24 hours: ${snap.pair.count1d}. Lifetime on this pair in the desk log: ${snap.pair.lifetimeCount}.`,
    }
  }
  if (/\bunusual for (?:this |the )?card\b/.test(text)) {
    if (!snap) return { title: 'No card on the desk', body: 'Name a card or open a restock.' }
    const vs = snap.card.amountVsMedian30d
    return {
      title: `${snap.cardName} vs its baseline`,
      body:
        vs == null
          ? `${snap.cardName} has no 30-day median on the desk log yet. ${snap.card.count30d} swipe${
              snap.card.count30d === 1 ? '' : 's'
            } in 30 days.`
          : `This ticket is ${vs.toFixed(1)}× the 30-day median (${formatZar(
              snap.card.median30d || 0
            )}). 7-day count ${snap.card.count7d}, 7-day volume ${formatZar(snap.card.volume7d)}.`,
    }
  }
  if (/\bunusual for (?:this |the )?merchant\b/.test(text)) {
    if (!snap) return { title: 'No merchant on the desk', body: 'Name a POS or open a restock.' }
    return {
      title: `${snap.merchantName} vs its baseline`,
      body: `Lifetime ${snap.merchant.lifetimeCount} txs, median ticket ${
        snap.merchant.medianTicket == null ? 'n/a' : formatZar(snap.merchant.medianTicket)
      }. Profile confidence ${snap.merchant.profileConfidence.toFixed(2)}. ${
        assessment?.dimensions.merchant === 'insufficient_history'
          ? 'Merchant history is too thin to establish normal.'
          : 'Available merchant history does not show a material divergence.'
      }`,
    }
  }
  if (/\bwhat(?:'s| is) different\b/.test(text)) {
    const lastClean = [...(params.reviews || [])]
      .filter((row) => row.outcome === 'approved_no_friction' || row.outcome === 'review_cleared')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      title: 'Vs last clean outcome',
      body: lastClean
        ? `Last clean outcome on file was ${lastClean.outcome} at that time. Open assessment: ${
            assessment?.line || 'low — no material difference from the available desk baseline.'
          }`
        : `No clean outcome is on the review log yet. Open assessment: ${
            assessment?.line || 'the dated review log is empty.'
          }`,
    }
  }
  if (/\bsplit sales?\b/.test(text)) {
    if (!snap) {
      return {
        title: 'Clustering, not a split-sale label',
        body: 'The desk records short-window pair counts. It does not call a pattern a split sale.',
      }
    }
    return {
      title: 'Clustering, not a split-sale label',
      body: `Same pair in the last 6 hours: ${snap.cluster.pair6h}. Last 24 hours: ${snap.cluster.pair24h}. Short-window amount including this swipe: ${formatZar(
        snap.cluster.shortWindowAmount6h
      )}. That may merit documentation. It is not labelled a split sale.`,
    }
  }

  if (assessment) {
    return {
      title: assessment.title,
      body:
        assessment.band === 'low'
          ? assessment.body
          : `${assessment.body} Review friction may be elevated. This is not a prediction that a bank will flag it.`,
    }
  }
  return {
    title: 'No friction snapshot',
    body: 'The dated desk log has nothing to compare, and there is no open restock pair. Backfill history or name a card and POS.',
  }
}

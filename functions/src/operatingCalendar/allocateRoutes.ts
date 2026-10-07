import type { UnsignedSlot } from './paymentBook'
import {
  OPERATING_POLICY_V1,
  type CardId,
  type NetworkColdState,
  type TerminalId,
  acquirerOfTerminal,
  merchantPrincipalOfTerminal,
  networkDailyCeilingZar,
} from './operatingPolicyV1'
import { REFERENCE_CARDS_M1, REFERENCE_TERMINALS, NEW_CARD_M2, type CardRecord } from './referenceNetwork'

export type PlannedPayment = UnsignedSlot & {
  invoiceId: string
  instructionId: string
  economicPaymentId: string
  cardId: CardId
  issuerBankId: string
  merchantPrincipalId: string
  terminalId: TerminalId
  merchantId: string
  acquirerBankId: string
  zarBeneficiaryId: string
  legalEligibilityRef: string
  lifecycleState: 'planned'
  outcome: 'pending_model_usable'
  rootAttemptId: string
  parentAttemptId: null
  liveExecutable: boolean
}

type Pair = { cardId: CardId; terminalId: TerminalId }

function cardIssuer(cardId: CardId, cards: CardRecord[]): string {
  return cards.find((c) => c.cardId === cardId)?.issuerBankId || 'UNKNOWN'
}

function segmentOf(date: string): number {
  const d = Number(date.slice(8, 10))
  if (d <= 7) return 0
  if (d <= 14) return 1
  if (d <= 21) return 2
  if (d <= 28) return 3
  return 4
}

/**
 * Deterministic route allocator for reference months.
 * Enforces OperatingPolicyV1 hard constraints while chasing Month 1 continuity targets.
 */
export function allocateRoutes(params: {
  slots: UnsignedSlot[]
  networkState: NetworkColdState
  cards: CardRecord[]
  monthLabel: string
  includeNewCardRamp?: boolean
}): PlannedPayment[] {
  const { slots, networkState, cards, monthLabel } = params
  const policy = OPERATING_POLICY_V1
  const terminals = REFERENCE_TERMINALS.map((t) => t.terminalId)
  const cardIds = cards.map((c) => c.cardId)

  const pairUses = new Map<string, number>()
  const cardUses = new Map<CardId, number>()
  const termUses = new Map<TerminalId, number>()
  const termValue = new Map<TerminalId, number>()
  const cardTermUses = new Map<string, number>()
  const payments: PlannedPayment[] = []

  const lastCardMin = new Map<string, number>() // date|card -> last min
  const lastPosMin = new Map<string, number>()
  const dayCardCount = new Map<string, number>()
  const dayCardValue = new Map<string, number>()
  const dayPrincipal = new Map<string, number>() // date|card|principal
  const dayPosCount = new Map<string, number>()
  const dayPosValue = new Map<string, number>()
  const rollingCardDates = new Map<CardId, string[]>()
  const rollingPrincipal = new Map<string, string[]>() // card|principal -> dates

  const newCardClean = new Map<CardId, number>()
  /** Econometrica (and any cold route) graduates through the same R5k/R6.5k stages before the R15k ceiling. */
  const ecmClean = { n: 0 }

  function key(...parts: Array<string | number>) {
    return parts.join('|')
  }

  function rollingCount(dates: string[] | undefined, asOf: string, windowDays: number): number {
    if (!dates?.length) return 0
    const asOfMs = Date.parse(asOf + 'T12:00:00Z')
    const cut = asOfMs - (windowDays - 1) * 86400000
    return dates.filter((d) => Date.parse(d + 'T12:00:00Z') >= cut && d <= asOf).length
  }

  function maxCardAttemptsToday(networkDay1: number, cardId: CardId): number {
    if (params.includeNewCardRamp && cardId === 'NEW_CARD_M2') {
      const clean = newCardClean.get(cardId) || 0
      if (clean < policy.newCard.stageA.maxCleanOutcomesExclusive) return policy.newCard.stageA.attemptsPerDay
      if (clean < policy.newCard.stageB.maxCleanOutcomesExclusive) return policy.newCard.stageB.attemptsPerDay
      return policy.card.establishedAttemptsPerDay
    }
    if (networkState === 'cold_start' && networkDay1 <= policy.network.coldNetworkDays) {
      return policy.card.coldAttemptsPerDay
    }
    return policy.card.establishedAttemptsPerDay
  }

  function maxPosAttemptsToday(networkDay1: number, terminalId: TerminalId): number {
    // Econometrica stage A/B: tighter attempt cadence while graduating to the R15k ceiling.
    if (terminalId === 'Econometrica') {
      if (ecmClean.n < policy.newCard.stageA.maxCleanOutcomesExclusive) return policy.newCard.stageA.attemptsPerDay
      if (ecmClean.n < policy.newCard.stageB.maxCleanOutcomesExclusive) return policy.newCard.stageB.attemptsPerDay
    }
    if (networkState === 'cold_start' && networkDay1 <= policy.pos.coldPosNetworkDays) {
      return policy.pos.coldAttemptsPerDay
    }
    return policy.pos.establishedAttemptsPerDay
  }

  function maxAttemptZar(cardId: CardId, terminalId: TerminalId): number {
    let max: number = policy.payment.maxAmountZar
    if (params.includeNewCardRamp && cardId === 'NEW_CARD_M2') {
      const clean = newCardClean.get(cardId) || 0
      if (clean < policy.newCard.stageA.maxCleanOutcomesExclusive) max = Math.min(max, policy.newCard.stageA.maxAttemptZar)
      else if (clean < policy.newCard.stageB.maxCleanOutcomesExclusive) max = Math.min(max, policy.newCard.stageB.maxAttemptZar)
    }
    if (terminalId === 'Econometrica') {
      if (ecmClean.n < policy.newCard.stageA.maxCleanOutcomesExclusive) max = Math.min(max, policy.newCard.stageA.maxAttemptZar)
      else if (ecmClean.n < policy.newCard.stageB.maxCleanOutcomesExclusive) max = Math.min(max, policy.newCard.stageB.maxAttemptZar)
    }
    return max
  }

  function scorePair(
    cardId: CardId,
    terminalId: TerminalId,
    amount: number,
    date: string
  ): number {
    const ct = key(cardId, terminalId)
    const cardN = cardUses.get(cardId) || 0
    const termN = termUses.get(terminalId) || 0
    const termV = termValue.get(terminalId) || 0
    const ctN = cardTermUses.get(ct) || 0
    // Prefer underused card-terminal for continuity; balance terminals and cards
    let s = ctN * 1000 + termN * 40 + cardN * 30 + termV / 1000
    // Keep combined Capitec inside the reference band while still using both Capitec terminals.
    const acq = acquirerOfTerminal(terminalId)
    const totalN = Math.max(1, payments.length)
    const capitecN = payments.filter((p) => p.acquirerBankId === 'capitec').length
    const capitecShare = capitecN / totalN
    if (acq === 'capitec') {
      if (capitecShare > 0.3) s += 220
      else if (capitecShare > 0.28) s += 80
      else if (capitecShare < 0.26) s -= 40
    } else if (capitecShare < 0.26) {
      s += 30
    }
    // Prefer Econometrica participation when underused relative to BricsCapitec
    const ecmN = termUses.get('Econometrica') || 0
    const bricsCapN = termUses.get('BricsCapitec') || 0
    if (terminalId === 'Econometrica' && ecmN < bricsCapN) s -= 35
    if (terminalId === 'BricsCapitec' && bricsCapN > ecmN + 2) s += 40
    // While Econometrica is still staging, prefer fitting small invoices onto it.
    if (terminalId === 'Econometrica' && ecmClean.n < policy.newCard.stageB.maxCleanOutcomesExclusive) {
      if (amount <= maxAttemptZar(cardId, 'Econometrica')) s -= 60
    }
    // New card: prefer early diversity of principals
    if (cardId === 'NEW_CARD_M2') s -= 10
    s += amount * 0.0001
    s += date.charCodeAt(9) * 0.01
    return s
  }

  function feasible(
    slot: UnsignedSlot,
    cardId: CardId,
    terminalId: TerminalId,
    networkDay1: number
  ): boolean {
    const amount = slot.amountZar
    if (amount > maxAttemptZar(cardId, terminalId)) return false
    if (amount > policy.payment.maxAmountZar) return false

    const dCard = key(slot.date, cardId)
    const dPos = key(slot.date, terminalId)
    const principal = merchantPrincipalOfTerminal(terminalId)
    const dPrin = key(slot.date, cardId, principal)

    if ((dayCardCount.get(dCard) || 0) >= maxCardAttemptsToday(networkDay1, cardId)) return false
    const cardDayCap =
      params.includeNewCardRamp &&
      cardId === 'NEW_CARD_M2' &&
      (newCardClean.get(cardId) || 0) >= policy.newCard.stageA.maxCleanOutcomesExclusive &&
      (newCardClean.get(cardId) || 0) < policy.newCard.stageB.maxCleanOutcomesExclusive
        ? policy.newCard.stageB.maxDayZar
        : policy.card.maxValuePerDayZar
    if ((dayCardValue.get(dCard) || 0) + amount > cardDayCap + 0.05) return false
    if ((dayPrincipal.get(dPrin) || 0) >= policy.cardPrincipal.maxPerLocalDay) return false
    if ((dayPosCount.get(dPos) || 0) >= maxPosAttemptsToday(networkDay1, terminalId)) return false
    const posDayCap =
      terminalId === 'Econometrica' &&
      ecmClean.n >= policy.newCard.stageA.maxCleanOutcomesExclusive &&
      ecmClean.n < policy.newCard.stageB.maxCleanOutcomesExclusive
        ? policy.newCard.stageB.maxDayZar
        : policy.pos.maxValuePerDayZar
    if ((dayPosValue.get(dPos) || 0) + amount > posDayCap + 0.05) return false

    const cardRoll = rollingCount(rollingCardDates.get(cardId), slot.date, 7)
    if (cardRoll >= policy.card.maxAttemptsRolling7Days) return false
    const prinRoll = rollingCount(rollingPrincipal.get(key(cardId, principal)), slot.date, 7)
    if (prinRoll >= policy.cardPrincipal.maxRolling7Days) return false

    const lastC = lastCardMin.get(dCard)
    if (lastC != null && Math.abs(slot.attemptMin - lastC) < policy.card.sameCardSpacingMinutes) return false
    const lastP = lastPosMin.get(dPos)
    if (lastP != null && Math.abs(slot.attemptMin - lastP) < policy.pos.samePosSpacingMinutes) return false

    // Adjacent slots < 120 min must not share card or POS (rulebook §7.3)
    const prev = payments[payments.length - 1]
    if (prev && prev.date === slot.date && Math.abs(slot.attemptMin - prev.attemptMin) < 120) {
      if (prev.cardId === cardId || prev.terminalId === terminalId) return false
    }

    // Prospective month POS share soft check (hard check at end)
    const totalSoFar = payments.reduce((s, p) => s + p.amountZar, 0) + amount
    const tv = (termValue.get(terminalId) || 0) + amount
    if (totalSoFar > 50_000 && tv / totalSoFar > policy.pos.maxShareValue + 0.02) return false

    // Prospective Capitec share hard guard (count + value) — stay under 35% with headroom.
    const acq = acquirerOfTerminal(terminalId)
    if (acq === 'capitec' && totalSoFar > 30_000) {
      const capV =
        payments.filter((p) => p.acquirerBankId === 'capitec').reduce((s, p) => s + p.amountZar, 0) + amount
      const capN = payments.filter((p) => p.acquirerBankId === 'capitec').length + 1
      if (capV / totalSoFar > 0.34) return false
      if (capN / (payments.length + 1) > 0.34) return false
    }

    return true
  }

  let seq = 0
  for (const slot of slots) {
    const networkDay1 = slot.dayIndex0 + 1
    const ceiling = networkDailyCeilingZar(networkDay1, networkState)
    const dayValue = slots.filter((s) => s.date === slot.date).reduce((s, x) => s + x.amountZar, 0)
    if (dayValue > ceiling + 0.05) {
      throw new Error(`Day ${slot.date} target ${dayValue} exceeds network ceiling ${ceiling}`)
    }

    const candidates: Pair[] = []
    for (const cardId of cardIds) {
      for (const terminalId of terminals) {
        if (feasible(slot, cardId, terminalId, networkDay1)) {
          candidates.push({ cardId, terminalId })
        }
      }
    }
    if (!candidates.length) {
      throw new Error(
        `No feasible (card, terminal) for ${slot.date} ${slot.timeSast} amount=${slot.amountZar} (assigned ${payments.length})`
      )
    }
    candidates.sort((a, b) => {
      const sa = scorePair(a.cardId, a.terminalId, slot.amountZar, slot.date)
      const sb = scorePair(b.cardId, b.terminalId, slot.amountZar, slot.date)
      if (sa !== sb) return sa - sb
      const ka = `${a.cardId}:${a.terminalId}`
      const kb = `${b.cardId}:${b.terminalId}`
      return ka < kb ? -1 : ka > kb ? 1 : 0
    })
    const pick = candidates[0]!
    const term = REFERENCE_TERMINALS.find((t) => t.terminalId === pick.terminalId)!
    const principal = merchantPrincipalOfTerminal(pick.terminalId)
    seq++
    const invoiceId = `INV-${monthLabel}-${String(seq).padStart(4, '0')}`
    const paymentId = `PAY-${monthLabel}-${String(seq).padStart(4, '0')}`
    const instructionId = `INST-${invoiceId}`

    const planned: PlannedPayment = {
      ...slot,
      invoiceId,
      instructionId,
      economicPaymentId: paymentId,
      cardId: pick.cardId,
      issuerBankId: cardIssuer(pick.cardId, cards),
      merchantPrincipalId: principal,
      terminalId: pick.terminalId,
      merchantId: term.liveMerchantId || `MODELLED-${pick.terminalId}`,
      acquirerBankId: acquirerOfTerminal(pick.terminalId),
      zarBeneficiaryId: principal,
      legalEligibilityRef: `REF-ELIG-${pick.cardId}-${pick.terminalId}`,
      lifecycleState: 'planned',
      outcome: 'pending_model_usable',
      rootAttemptId: paymentId,
      parentAttemptId: null,
      liveExecutable: term.liveExecutable,
    }
    payments.push(planned)

    // update counters
    const dCard = key(slot.date, pick.cardId)
    const dPos = key(slot.date, pick.terminalId)
    const dPrin = key(slot.date, pick.cardId, principal)
    dayCardCount.set(dCard, (dayCardCount.get(dCard) || 0) + 1)
    dayCardValue.set(dCard, (dayCardValue.get(dCard) || 0) + slot.amountZar)
    dayPrincipal.set(dPrin, (dayPrincipal.get(dPrin) || 0) + 1)
    dayPosCount.set(dPos, (dayPosCount.get(dPos) || 0) + 1)
    dayPosValue.set(dPos, (dayPosValue.get(dPos) || 0) + slot.amountZar)
    lastCardMin.set(dCard, slot.attemptMin)
    lastPosMin.set(dPos, slot.attemptMin)
    cardUses.set(pick.cardId, (cardUses.get(pick.cardId) || 0) + 1)
    termUses.set(pick.terminalId, (termUses.get(pick.terminalId) || 0) + 1)
    termValue.set(pick.terminalId, (termValue.get(pick.terminalId) || 0) + slot.amountZar)
    const ct = key(pick.cardId, pick.terminalId)
    cardTermUses.set(ct, (cardTermUses.get(ct) || 0) + 1)
    pairUses.set(ct, (pairUses.get(ct) || 0) + 1)
    const rd = rollingCardDates.get(pick.cardId) || []
    rd.push(slot.date)
    rollingCardDates.set(pick.cardId, rd)
    const rpKey = key(pick.cardId, principal)
    const rp = rollingPrincipal.get(rpKey) || []
    rp.push(slot.date)
    rollingPrincipal.set(rpKey, rp)

    // Reference fixture models every planned payment as eventually usable for Month 1→2 carry
    if (params.includeNewCardRamp && pick.cardId === 'NEW_CARD_M2') {
      newCardClean.set(pick.cardId, (newCardClean.get(pick.cardId) || 0) + 1)
    }
    if (pick.terminalId === 'Econometrica') {
      ecmClean.n += 1
    }

    void segmentOf
  }

  return payments
}

export function cardsForMonth(month: 1 | 2): CardRecord[] {
  if (month === 1) return [...REFERENCE_CARDS_M1]
  return [...REFERENCE_CARDS_M1, NEW_CARD_M2]
}

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
import { REFERENCE_CARDS_M1, REFERENCE_TERMINALS, type CardRecord } from './referenceNetwork'
import {
  FAMILY_CARD_SPLIT,
  eligibleCardsForPayer,
  isMozaCard,
  payerFamilyOfCard,
  type PayerFamilyId,
} from './payerCardRegistry'
import {
  assertFinalDeskLedger,
  assignmentPreservesFinalCountBands,
  repairRolling7PosConcentration,
} from './finalLedgerConstraints'

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
  payerFamilyId?: PayerFamilyId
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
 *
 * Payer-family eligibility: when a slot carries payerFamilyId, only registry cards
 * for that family are candidates. Wolf/Goblin demand is not doubled for Moza —
 * family share is scored first; within-family BCI/Moza aims at 40–60% when evidence is equal.
 *
 * Econometrica is fully eligible at the R15k ceiling (no POS staging). Moza cards
 * cold-start through newCard stages until clean usable outcomes graduate them.
 */
export function allocateDeskRoutes(params: {
  slots: UnsignedSlot[]
  networkState: NetworkColdState
  cards: CardRecord[]
  monthLabel: string
  includeNewCardRamp?: boolean
  /** Optional sealed history — never reassigned. */
  sealedPayments?: PlannedPayment[]
  /**
   * When true, only liveExecutable terminals may receive volume (desk production).
   * Reference fixtures keep modeled-eligible terminals even if MID is pending.
   */
  requireLiveExecutable?: boolean
  /**
   * A/B observation mode: ignore payer-family exclusivity and Moza stage amount
   * caps; chase roughly even card count/value shares. POS/principal/acquirer
   * month bands still bind on the finished ledger.
   */
  equitableCardShares?: boolean
  /**
   * When true with requireLiveExecutable, still run R7 repair but skip the
   * fail-closed final ledger assert (caller must assert after any post-repair).
   */
  skipFinalLedgerAssert?: boolean
}): PlannedPayment[] {
  const { slots, networkState, cards, monthLabel } = params
  const equitable = !!params.equitableCardShares
  const policy = OPERATING_POLICY_V1
  const terminals = REFERENCE_TERMINALS.filter((t) => t.modeledEligible).map((t) => t.terminalId)
  const cardIds = cards.map((c) => c.cardId)
  const cardTargetN = Math.max(1, Math.round((slots.length + (params.sealedPayments?.length || 0)) / Math.max(1, cardIds.length)))
  const cardTargetShare = 1 / Math.max(1, cardIds.length)
  const liveCleanPos = REFERENCE_TERMINALS.filter((t) => t.modeledEligible && t.liveExecutable).map(
    (t) => t.terminalId
  )
  const targets = policy.posPlanningTargets
  const ecmActivatedOn = policy.econometricaActivatedOn

  const payments: PlannedPayment[] = [...(params.sealedPayments || [])]
  const pairUses = new Map<string, number>()
  const cardUses = new Map<CardId, number>()
  const familyUses = new Map<string, number>()
  const familyValue = new Map<string, number>()
  const termUses = new Map<TerminalId, number>()
  const termValue = new Map<TerminalId, number>()
  const principalUses = new Map<string, number>()
  const principalValue = new Map<string, number>()
  const cardTermUses = new Map<string, number>()
  const lastCardMin = new Map<string, number>()
  const lastPosMin = new Map<string, number>()
  const dayCardCount = new Map<string, number>()
  const dayCardValue = new Map<string, number>()
  const dayPrincipal = new Map<string, number>()
  const dayPosCount = new Map<string, number>()
  const dayPosValue = new Map<string, number>()
  const rollingCardDates = new Map<CardId, string[]>()
  const rollingPrincipal = new Map<string, string[]>()
  const lastPairDate = new Map<string, string>()
  const cardTerminalSet = new Map<CardId, Set<TerminalId>>()
  const cardAcquirerSet = new Map<CardId, Set<string>>()
  const cardPrincipalSet = new Map<CardId, Set<string>>()
  const newCardClean = new Map<CardId, number>()
  const mozaClean = new Map<CardId, number>()

  function seedFromSealed() {
    for (const p of payments) {
      cardUses.set(p.cardId, (cardUses.get(p.cardId) || 0) + 1)
      termUses.set(p.terminalId, (termUses.get(p.terminalId) || 0) + 1)
      termValue.set(p.terminalId, (termValue.get(p.terminalId) || 0) + p.amountZar)
      principalUses.set(p.merchantPrincipalId, (principalUses.get(p.merchantPrincipalId) || 0) + 1)
      principalValue.set(
        p.merchantPrincipalId,
        (principalValue.get(p.merchantPrincipalId) || 0) + p.amountZar
      )
      const fam = p.payerFamilyId || payerFamilyOfCard(p.cardId)?.payerFamilyId
      if (fam) {
        familyUses.set(fam, (familyUses.get(fam) || 0) + 1)
        familyValue.set(fam, (familyValue.get(fam) || 0) + p.amountZar)
      }
      const ct = key(p.cardId, p.terminalId)
      cardTermUses.set(ct, (cardTermUses.get(ct) || 0) + 1)
      lastPairDate.set(ct, p.date)
      if (isMozaCard(p.cardId)) mozaClean.set(p.cardId, (mozaClean.get(p.cardId) || 0) + 1)
    }
  }

  function key(...parts: Array<string | number>) {
    return parts.join('|')
  }

  function rollingCount(dates: string[] | undefined, asOf: string, windowDays: number): number {
    if (!dates?.length) return 0
    const asOfMs = Date.parse(asOf + 'T12:00:00Z')
    const cut = asOfMs - (windowDays - 1) * 86400000
    return dates.filter((d) => Date.parse(d + 'T12:00:00Z') >= cut && d <= asOf).length
  }

  function mozaStageClean(cardId: CardId): number {
    return mozaClean.get(cardId) || 0
  }

  function maxCardAttemptsToday(networkDay1: number, cardId: CardId): number {
    if (params.includeNewCardRamp && cardId === 'NEW_CARD_M2') {
      const clean = newCardClean.get(cardId) || 0
      if (clean < policy.newCard.stageA.maxCleanOutcomesExclusive) return policy.newCard.stageA.attemptsPerDay
      if (clean < policy.newCard.stageB.maxCleanOutcomesExclusive) return policy.newCard.stageB.attemptsPerDay
      return policy.card.establishedAttemptsPerDay
    }
    // Equitable A/B mode: Moza uses the same daily attempt band as established cards.
    if (!equitable && isMozaCard(cardId)) {
      const clean = mozaStageClean(cardId)
      if (clean < policy.newCard.stageA.maxCleanOutcomesExclusive) return policy.newCard.stageA.attemptsPerDay
      if (clean < policy.newCard.stageB.maxCleanOutcomesExclusive) return policy.newCard.stageB.attemptsPerDay
      return policy.card.establishedAttemptsPerDay
    }
    if (networkState === 'cold_start' && networkDay1 <= policy.network.coldNetworkDays) {
      return policy.card.coldAttemptsPerDay
    }
    return policy.card.establishedAttemptsPerDay
  }

  /** Desk: Econometrica is fully eligible. Reference fixtures keep legacy ECM stage caps. */
  const ecmClean = { n: 0 }

  function maxPosAttemptsToday(networkDay1: number, terminalId: TerminalId): number {
    if (!params.requireLiveExecutable && terminalId === 'Econometrica') {
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
      else if (clean < policy.newCard.stageB.maxCleanOutcomesExclusive)
        max = Math.min(max, policy.newCard.stageB.maxAttemptZar)
    }
    // Moza cold-start only — after graduation, same R15k ceiling as BCI.
    // Equitable A/B mode lifts Moza stage caps so every card can take mature invoices.
    if (!equitable && isMozaCard(cardId)) {
      const clean = mozaStageClean(cardId)
      if (clean < policy.newCard.stageA.maxCleanOutcomesExclusive) max = Math.min(max, policy.newCard.stageA.maxAttemptZar)
      else if (clean < policy.newCard.stageB.maxCleanOutcomesExclusive)
        max = Math.min(max, policy.newCard.stageB.maxAttemptZar)
    }
    // Reference-fixture Econometrica staging (not used on live desk).
    if (!params.requireLiveExecutable && terminalId === 'Econometrica') {
      if (ecmClean.n < policy.newCard.stageA.maxCleanOutcomesExclusive)
        max = Math.min(max, policy.newCard.stageA.maxAttemptZar)
      else if (ecmClean.n < policy.newCard.stageB.maxCleanOutcomesExclusive)
        max = Math.min(max, policy.newCard.stageB.maxAttemptZar)
    }
    return max
  }

  function cardsForSlot(slot: UnsignedSlot): CardId[] {
    // Equitable A/B: every live card may take any invoice (no payer-family lock).
    if (equitable) return cardIds
    if (slot.payerFamilyId) {
      return eligibleCardsForPayer(slot.payerFamilyId).filter((c) => cardIds.includes(c))
    }
    return cardIds
  }

  function scorePair(cardId: CardId, terminalId: TerminalId, amount: number, date: string): number {
    const ct = key(cardId, terminalId)
    const cardN = cardUses.get(cardId) || 0
    const termN = termUses.get(terminalId) || 0
    const termV = termValue.get(terminalId) || 0
    const ctN = cardTermUses.get(ct) || 0
    const totalN = Math.max(1, payments.length)
    const totalV = Math.max(1, payments.reduce((s, p) => s + p.amountZar, 0))
    const shareN = termN / totalN
    const shareV = termV / totalV
    const prin = merchantPrincipalOfTerminal(terminalId)
    const acq = acquirerOfTerminal(terminalId)
    const seenT = cardTerminalSet.get(cardId) || new Set()
    const seenA = cardAcquirerSet.get(cardId) || new Set()
    const seenP = cardPrincipalSet.get(cardId) || new Set()

    // Reference fixtures keep the lighter continuity score (Month 1 golden).
    if (!params.requireLiveExecutable) {
      const targetPerCard = Math.max(1, Math.round((slots.length || 1) / Math.max(1, cardIds.length)))
      let s = ctN * 1400 + termN * 55 + Math.abs(cardN - targetPerCard) * 45 + termV / 800
      if (!seenT.has(terminalId) && seenT.size < policy.continuity.minTerminals) s -= 180
      if (!seenA.has(acq) && seenA.size < policy.continuity.minAcquirers) s -= 160
      if (!seenP.has(prin) && seenP.size < policy.continuity.minPrincipals) s -= 120
      if (ctN >= 4) s += 500
      if (ctN >= 5) s += 800
      const capitecN = payments.filter((p) => p.acquirerBankId === 'capitec').length
      const capitecShare = capitecN / totalN
      if (acq === 'capitec') {
        if (capitecShare > 0.3) s += 220
        else if (capitecShare > 0.28) s += 80
        else if (capitecShare < 0.26) s -= 40
      } else if (capitecShare < 0.26) s += 30
      const ecmN = termUses.get('Econometrica') || 0
      const bricsCapN = termUses.get('BricsCapitec') || 0
      if (terminalId === 'Econometrica' && ecmN < bricsCapN) s -= 35
      if (terminalId === 'BricsCapitec' && bricsCapN > ecmN + 2) s += 40
      if (terminalId === 'Econometrica' && ecmClean.n < policy.newCard.stageB.maxCleanOutcomesExclusive) {
        if (amount <= maxAttemptZar(cardId, 'Econometrica')) s -= 60
      }
      if (cardId === 'NEW_CARD_M2') s -= 10
      s += amount * 0.0001
      s += date.charCodeAt(9) * 0.01
      return s
    }

    const ideal = targets[terminalId as keyof typeof targets] ?? 0.2
    const fam = payerFamilyOfCard(cardId)
    const famN = fam ? familyUses.get(fam.payerFamilyId) || 0 : cardN
    const activeFamilies = Math.max(1, new Set([...familyUses.keys()]).size || 5)
    const famTarget = Math.max(1, Math.round((slots.length + payments.length) / activeFamilies))
    const cardV = payments.filter((p) => p.cardId === cardId).reduce((s, p) => s + p.amountZar, 0)
    const cardShareV = cardV / totalV
    const cardShareN = cardN / totalN

    let s = 0
    if (equitable) {
      // Card equity first — not family exclusivity. Soft band around 1/N cards.
      s += Math.abs(cardN - cardTargetN) * 220
      s += Math.abs(cardShareV - cardTargetShare) * 18000
      s += Math.abs(cardShareN - cardTargetShare) * 12000
      if (cardN === 0) s -= 1200
      s += ctN * 400 + Math.abs(shareV - ideal) * 4000 + Math.abs(shareN - ideal) * 3000
    } else {
      // Family demand first (do not double-count Moza as extra payer demand).
      s = Math.abs(famN - famTarget) * 80
      s += ctN * 900 + Math.abs(shareV - ideal) * 4000 + Math.abs(shareN - ideal) * 3000

      // Within-family 40–60% BCI/Moza when both cards are live (value + count).
      if (fam && fam.cardIds.length >= 2) {
        const aN = cardUses.get(fam.cardIds[0]!) || 0
        const bN = cardUses.get(fam.cardIds[1]!) || 0
        const famTotalN = Math.max(1, aN + bN)
        const thisN = cardUses.get(cardId) || 0
        const thisShareN = thisN / famTotalN
        if (thisShareN < FAMILY_CARD_SPLIT.minShare) s -= (FAMILY_CARD_SPLIT.minShare - thisShareN) * 12000
        if (thisShareN > FAMILY_CARD_SPLIT.maxShare) s += (thisShareN - FAMILY_CARD_SPLIT.maxShare) * 12000
        if (isMozaCard(cardId) && thisN === 0) s -= 800
      } else {
        s += Math.abs(cardN - Math.round(slots.length / Math.max(1, cardIds.length))) * 25
      }
    }

    if (liveCleanPos.includes(terminalId)) {
      if (shareV < policy.pos.minShareValue) s -= (policy.pos.minShareValue - shareV) * 14000
      if (shareN < policy.pos.minShareCount) s -= (policy.pos.minShareCount - shareN) * 14000
      if (shareV > policy.pos.maxShareValue - 0.03) s += (shareV - (policy.pos.maxShareValue - 0.03)) * 9000
      if (shareN > policy.pos.maxShareCount - 0.03) s += (shareN - (policy.pos.maxShareCount - 0.03)) * 9000
    }

    const prinShareN = (principalUses.get(prin) || 0) / totalN
    const prinShareV = (principalValue.get(prin) || 0) / totalV
    if (prinShareV > policy.principal.maxShareValue - 0.04)
      s += (prinShareV - (policy.principal.maxShareValue - 0.04)) * 10000
    if (prinShareN > policy.principal.maxShareCount - 0.04)
      s += (prinShareN - (policy.principal.maxShareCount - 0.04)) * 10000

    if (!seenT.has(terminalId) && seenT.size < policy.continuity.minTerminals) s -= 180
    if (!seenA.has(acq) && seenA.size < policy.continuity.minAcquirers) s -= 160
    if (!seenP.has(prin) && seenP.size < policy.continuity.minPrincipals) s -= 120
    if (ctN >= 4) s += 500
    if (ctN >= 5) s += 800

    const capitecN = payments.filter((p) => p.acquirerBankId === 'capitec').length
    const capitecShare = capitecN / totalN
    if (acq === 'capitec') {
      if (capitecShare > 0.32) s += 200
      else if (capitecShare < policy.acquirer.referenceCapitecMinShare) s -= 80
    } else if (capitecShare < policy.acquirer.referenceCapitecMinShare) {
      s += 40
    }

    if (terminalId === 'Econometrica') {
      if (shareV < targets.Econometrica) s -= (targets.Econometrica - shareV) * 5000
      if (shareN < targets.Econometrica) s -= (targets.Econometrica - shareN) * 5000
    }

    if (terminalId === 'BricsFNB') s -= 15
    if (terminalId === 'BricsCapitec') {
      s -= 25
      if (shareV < policy.pos.minShareValue) s -= (policy.pos.minShareValue - shareV) * 18000
      if (shareN < policy.pos.minShareCount) s -= (policy.pos.minShareCount - shareN) * 18000
    }

    if (!equitable && isMozaCard(cardId)) {
      const clean = mozaStageClean(cardId)
      if (clean < policy.newCard.stageB.maxCleanOutcomesExclusive) {
        if (amount <= maxAttemptZar(cardId, terminalId)) s -= 200
        const mozaSeenA = cardAcquirerSet.get(cardId) || new Set()
        if (mozaSeenA.size === 1 && !mozaSeenA.has(acq)) s -= 400
      } else {
        s -= 20
      }
    }

    if (cardId === 'NEW_CARD_M2') s -= 10
    s += amount * 0.0001
    s += date.charCodeAt(9) * 0.01
    s += termN * 0.01
    return s
  }

  function rejectReason(
    slot: UnsignedSlot,
    cardId: CardId,
    terminalId: TerminalId,
    networkDay1: number
  ): string | null {
    const amount = slot.amountZar
    if (amount > maxAttemptZar(cardId, terminalId)) return 'stageCap'
    if (amount > policy.payment.maxAmountZar) return 'maxAmount'
    if (terminalId === 'Econometrica' && slot.date < ecmActivatedOn) return 'ecmActivation'
    const term = REFERENCE_TERMINALS.find((t) => t.terminalId === terminalId)
    if (!term?.modeledEligible) return 'notModeled'
    if (params.requireLiveExecutable && !term.liveExecutable) return 'notLive'

    const dCard = key(slot.date, cardId)
    const dPos = key(slot.date, terminalId)
    const principal = merchantPrincipalOfTerminal(terminalId)
    const dPrin = key(slot.date, cardId, principal)

    if ((dayCardCount.get(dCard) || 0) >= maxCardAttemptsToday(networkDay1, cardId)) return 'cardDayN'
    const cardDayCap =
      !equitable &&
      isMozaCard(cardId) &&
      mozaStageClean(cardId) >= policy.newCard.stageA.maxCleanOutcomesExclusive &&
      mozaStageClean(cardId) < policy.newCard.stageB.maxCleanOutcomesExclusive
        ? policy.newCard.stageB.maxDayZar
        : policy.card.maxValuePerDayZar
    if ((dayCardValue.get(dCard) || 0) + amount > cardDayCap + 0.05) return 'cardDayV'
    if ((dayPrincipal.get(dPrin) || 0) >= policy.cardPrincipal.maxPerLocalDay) return 'cardPrinDay'
    if ((dayPosCount.get(dPos) || 0) >= maxPosAttemptsToday(networkDay1, terminalId)) return 'posDayN'
    const posDayCap =
      !params.requireLiveExecutable &&
      terminalId === 'Econometrica' &&
      ecmClean.n >= policy.newCard.stageA.maxCleanOutcomesExclusive &&
      ecmClean.n < policy.newCard.stageB.maxCleanOutcomesExclusive
        ? policy.newCard.stageB.maxDayZar
        : policy.pos.maxValuePerDayZar
    if ((dayPosValue.get(dPos) || 0) + amount > posDayCap + 0.05) return 'posDayV'

    const cardRoll = rollingCount(rollingCardDates.get(cardId), slot.date, 7)
    if (cardRoll >= policy.card.maxAttemptsRolling7Days) return `cardR7=${cardRoll}`
    const prinRoll = rollingCount(rollingPrincipal.get(key(cardId, principal)), slot.date, 7)
    if (prinRoll >= policy.cardPrincipal.maxRolling7Days) return `prinR7=${prinRoll}`

    const lastC = lastCardMin.get(dCard)
    if (lastC != null && Math.abs(slot.attemptMin - lastC) < policy.card.sameCardSpacingMinutes)
      return 'cardSpacing'
    const lastP = lastPosMin.get(dPos)
    if (lastP != null && Math.abs(slot.attemptMin - lastP) < policy.pos.samePosSpacingMinutes)
      return 'posSpacing'

    const pairKey = key(cardId, terminalId)
    if (params.requireLiveExecutable) {
      const prevPairDate = lastPairDate.get(pairKey)
      if (prevPairDate) {
        const gapDays =
          (Date.parse(slot.date + 'T12:00:00Z') - Date.parse(prevPairDate + 'T12:00:00Z')) / 86400000
        if (gapDays > 0 && gapDays < 2 - 1e-9) return `pairGap=${gapDays}`
      }
    }

    const prev = payments[payments.length - 1]
    if (prev && prev.date === slot.date && Math.abs(slot.attemptMin - prev.attemptMin) < 120) {
      if (prev.cardId === cardId || prev.terminalId === terminalId) return 'adjacentSame'
    }

    const totalSoFar = payments.reduce((s, p) => s + p.amountZar, 0) + amount
    const tv = (termValue.get(terminalId) || 0) + amount
    const tn = (termUses.get(terminalId) || 0) + 1
    const pv = (principalValue.get(principal) || 0) + amount
    const pn = (principalUses.get(principal) || 0) + 1
    if (params.requireLiveExecutable) {
      if (tv / deskTotalV > policy.pos.maxShareValue + 1e-9) return 'posMonthV'
      if (pv / deskTotalV > policy.principal.maxShareValue + 1e-9) return 'prinMonthV'
      if (tn > Math.floor(policy.pos.maxShareCount * deskTotalN + 1e-12)) return 'posMonthN'
      if (pn > Math.floor(policy.principal.maxShareCount * deskTotalN + 1e-12)) return 'prinMonthN'
      if (
        !assignmentPreservesFinalCountBands({
          totalN: deskTotalN,
          assignedCounts: termUses,
          assignedSoFar: payments.length,
          nextTerminalId: terminalId,
        })
      ) {
        return 'finalBands'
      }
      // Rolling-7 POS concentration is enforced on the finished ledger via
      // repairRolling7PosConcentration + validateOperatingCalendar — not as a
      // mid-schedule hard cut that can box the month bands into a dead end.
    } else if (totalSoFar > 50_000 && tv / totalSoFar > policy.pos.maxShareValue + 0.02) {
      return 'refPosHeadroom'
    }

    const acq = acquirerOfTerminal(terminalId)
    if (acq === 'capitec') {
      const capV =
        payments.filter((p) => p.acquirerBankId === 'capitec').reduce((s, p) => s + p.amountZar, 0) +
        amount
      const capN = payments.filter((p) => p.acquirerBankId === 'capitec').length + 1
      if (params.requireLiveExecutable) {
        if (capV / deskTotalV > policy.acquirer.maxShare + 1e-9) return 'capMonthV'
        if (capN > Math.floor(policy.acquirer.maxShare * deskTotalN + 1e-12)) return 'capMonthN'
      } else if (totalSoFar > 30_000) {
        if (capV / totalSoFar > 0.34 + 1e-9) return 'refCapV'
        if (capN / (payments.length + 1) > 0.34 + 1e-9) return 'refCapN'
      }
    }
    return null
  }

  function feasible(
    slot: UnsignedSlot,
    cardId: CardId,
    terminalId: TerminalId,
    networkDay1: number
  ): boolean {
    return rejectReason(slot, cardId, terminalId, networkDay1) == null
  }

  seedFromSealed()
  const sealedIds = new Set(payments.map((p) => p.invoiceId))
  /** Finished month size — sealed history + remaining unsigned slots. */
  const deskTotalN = payments.length + slots.length
  /** Finished month value — sealed + remaining slot amounts (hard value-ceiling denominator). */
  const deskTotalV = Math.max(
    1e-9,
    payments.reduce((s, p) => s + p.amountZar, 0) + slots.reduce((s, x) => s + x.amountZar, 0)
  )
  let seq = payments.length

  for (const slot of slots) {
    const networkDay1 = slot.dayIndex0 + 1
    const ceiling = networkDailyCeilingZar(networkDay1, networkState)
    const dayValue = slots.filter((s) => s.date === slot.date).reduce((s, x) => s + x.amountZar, 0)
    if (dayValue > ceiling + 0.05) {
      throw new Error(`Day ${slot.date} target ${dayValue} exceeds network ceiling ${ceiling}`)
    }

    const eligibleCards = cardsForSlot(slot)
    let candidates: Pair[] = []
    for (const cardId of eligibleCards) {
      for (const terminalId of terminals) {
        if (feasible(slot, cardId, terminalId, networkDay1)) {
          candidates.push({ cardId, terminalId })
        }
      }
    }

    // Reference fixtures: prefer Econometrica while staging on stage-sized tickets.
    if (
      !params.requireLiveExecutable &&
      ecmClean.n < policy.newCard.stageB.maxCleanOutcomesExclusive &&
      slot.amountZar <=
        (ecmClean.n < policy.newCard.stageA.maxCleanOutcomesExclusive
          ? policy.newCard.stageA.maxAttemptZar
          : policy.newCard.stageB.maxAttemptZar) +
          1e-9
    ) {
      const ecmOnly = candidates.filter((c) => c.terminalId === 'Econometrica')
      if (ecmOnly.length) candidates = ecmOnly
    }

    // Desk only: prefer POS still short of final count floors / Econometrica 16% target.
    // Maturity is only a score tie-breaker later — floors bind via feasible() lookahead.
    if (params.requireLiveExecutable && candidates.length) {
      const remainingIncluding = deskTotalN - payments.length
      const shortFinal = candidates.filter((c) => {
        if (!liveCleanPos.includes(c.terminalId)) return false
        const have = termUses.get(c.terminalId) || 0
        const need =
          c.terminalId === 'Econometrica'
            ? Math.ceil(policy.posPlanningTargets.Econometrica * deskTotalN - 1e-12)
            : Math.ceil(policy.pos.minShareCount * deskTotalN - 1e-12)
        return have < need
      })
      const capShort =
        remainingIncluding > 0 &&
        (() => {
          const capHave =
            (termUses.get('BricsCapitec') || 0) + (termUses.get('Econometrica') || 0)
          const capNeed = Math.ceil(policy.acquirer.referenceCapitecMinShare * deskTotalN - 1e-12)
          return capHave < capNeed
        })()
      const capitecOnly = candidates.filter(
        (c) => c.terminalId === 'Econometrica' || c.terminalId === 'BricsCapitec'
      )
      if (shortFinal.length) candidates = shortFinal
      else if (capShort && capitecOnly.length) candidates = capitecOnly
    }

    // Moza staging: prefer Moza on stage-sized family invoices until graduated.
    // Skipped in equitable A/B mode — card equity preference below owns selection.
    if (
      !equitable &&
      (slot.payerFamilyId === 'wolf' || slot.payerFamilyId === 'goblin')
    ) {
      const mozaId = slot.payerFamilyId === 'wolf' ? 'WolfMoza' : 'GoblinMoza'
      const clean = mozaStageClean(mozaId as CardId)
      if (
        clean < policy.newCard.stageB.maxCleanOutcomesExclusive &&
        slot.amountZar <= maxAttemptZar(mozaId as CardId, 'WolfFNB') + 1e-9
      ) {
        const mozaOnly = candidates.filter((c) => c.cardId === mozaId)
        if (mozaOnly.length) candidates = mozaOnly
      }
    }

    // Equitable A/B: prefer cards still short of 1/N count (then value).
    if (equitable && candidates.length) {
      const totalNNow = Math.max(1, payments.length)
      const totalVNow = Math.max(1, payments.reduce((s, p) => s + p.amountZar, 0))
      const shortCount = candidates.filter((c) => {
        const n = cardUses.get(c.cardId) || 0
        return n / totalNNow < cardTargetShare - 0.02 || n < cardTargetN
      })
      const shortValue = candidates.filter((c) => {
        const v = payments.filter((p) => p.cardId === c.cardId).reduce((s, p) => s + p.amountZar, 0)
        return v / totalVNow < cardTargetShare - 0.02
      })
      if (shortCount.length) candidates = shortCount
      else if (shortValue.length) candidates = shortValue
    }

    if (!candidates.length) {
      const liveCounts = liveCleanPos
        .map((t) => {
          const have = termUses.get(t) || 0
          const need =
            t === 'Econometrica'
              ? Math.ceil(policy.posPlanningTargets.Econometrica * deskTotalN - 1e-12)
              : Math.ceil(policy.pos.minShareCount * deskTotalN - 1e-12)
          const v = termValue.get(t) || 0
          const dayN = dayPosCount.get(key(slot.date, t)) || 0
          const dayV = dayPosValue.get(key(slot.date, t)) || 0
          return `${t}:n=${have}/${need} v=${Math.round(v)}/${Math.round(policy.pos.maxShareValue * deskTotalV)} day=${dayN}/${dayV}`
        })
        .join(' | ')
      const capHave =
        (termUses.get('BricsCapitec') || 0) + (termUses.get('Econometrica') || 0)
      const why = eligibleCards
        .flatMap((cardId) =>
          terminals.map((terminalId) => {
            const reason = rejectReason(slot, cardId, terminalId, networkDay1)
            return reason ? `${cardId}×${terminalId}:${reason}` : null
          })
        )
        .filter(Boolean)
        .slice(0, 12)
      throw new Error(
        `No feasible (card, terminal) for ${slot.date} ${slot.timeSast} amount=${slot.amountZar} payer=${slot.payerFamilyId || 'any'} (assigned ${payments.length}/${deskTotalN}) — final POS/principal bands unreachable without bypass · ${liveCounts} · capitec=${capHave}/${Math.ceil(policy.acquirer.referenceCapitecMinShare * deskTotalN - 1e-12)} lemon=${(termUses.get('BricsFNB') || 0) + (termUses.get('BricsCapitec') || 0)}/${Math.floor(policy.principal.maxShareCount * deskTotalN + 1e-12)} · blocked=${why.join(',')}`
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
    if (sealedIds.has(invoiceId)) {
      throw new Error(`Invoice id collision with sealed history: ${invoiceId}`)
    }
    const paymentId = `PAY-${monthLabel}-${String(seq).padStart(4, '0')}`
    const instructionId = `INST-${invoiceId}`
    const famId =
      slot.payerFamilyId || payerFamilyOfCard(pick.cardId)?.payerFamilyId || undefined

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
      payerFamilyId: famId,
    }
    payments.push(planned)

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
    principalUses.set(principal, (principalUses.get(principal) || 0) + 1)
    principalValue.set(principal, (principalValue.get(principal) || 0) + slot.amountZar)
    if (famId) {
      familyUses.set(famId, (familyUses.get(famId) || 0) + 1)
      familyValue.set(famId, (familyValue.get(famId) || 0) + slot.amountZar)
    }
    const ct = key(pick.cardId, pick.terminalId)
    cardTermUses.set(ct, (cardTermUses.get(ct) || 0) + 1)
    pairUses.set(ct, (pairUses.get(ct) || 0) + 1)
    lastPairDate.set(ct, slot.date)
    const tSet = cardTerminalSet.get(pick.cardId) || new Set<TerminalId>()
    tSet.add(pick.terminalId)
    cardTerminalSet.set(pick.cardId, tSet)
    const aSet = cardAcquirerSet.get(pick.cardId) || new Set<string>()
    aSet.add(acquirerOfTerminal(pick.terminalId))
    cardAcquirerSet.set(pick.cardId, aSet)
    const pSet = cardPrincipalSet.get(pick.cardId) || new Set<string>()
    pSet.add(principal)
    cardPrincipalSet.set(pick.cardId, pSet)
    const rd = rollingCardDates.get(pick.cardId) || []
    rd.push(slot.date)
    rollingCardDates.set(pick.cardId, rd)
    const rpKey = key(pick.cardId, principal)
    const rp = rollingPrincipal.get(rpKey) || []
    rp.push(slot.date)
    rollingPrincipal.set(rpKey, rp)

    if (params.includeNewCardRamp && pick.cardId === 'NEW_CARD_M2') {
      newCardClean.set(pick.cardId, (newCardClean.get(pick.cardId) || 0) + 1)
    }
    if (isMozaCard(pick.cardId)) {
      mozaClean.set(pick.cardId, (mozaClean.get(pick.cardId) || 0) + 1)
    }
    if (!params.requireLiveExecutable && pick.terminalId === 'Econometrica') {
      ecmClean.n += 1
    }

    void segmentOf
    void pairUses
  }

  // Fail closed on the finished scheduled ledger — scoring cannot paper over this.
  if (params.requireLiveExecutable) {
    const repaired = repairRolling7PosConcentration(payments)
    payments.length = 0
    payments.push(...repaired)
    if (!params.skipFinalLedgerAssert) {
      assertFinalDeskLedger(payments, {
        enforceReferenceCapitecBand: true,
        label: `allocateDeskRoutes(${monthLabel})`,
      })
    }
  }

  return payments
}

/** October desk mesh: five payers + Wolf/Goblin Moza equivalent-capacity twins. */
export function cardsForOctoberDesk(): CardRecord[] {
  return REFERENCE_CARDS_M1.filter((c) => c.cardId !== 'Kayman')
}

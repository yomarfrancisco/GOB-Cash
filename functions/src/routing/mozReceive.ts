/**
 * Ranked Moz receive-account choice for a ZAR sale.
 * One inbound credit, one debit account, with an inspectable reason.
 */

import type { RoutingOverlay } from './constraints'
import type { RoutingState } from './conversionRouter'
import {
  cardMozBank,
  cardMozBankId,
  cardShortName,
  formatReceiveAccount,
  type MozBankId,
} from './inventory'

export type ReceiveHint = {
  payerName: string | null
  payerBanks: MozBankId[]
}

export type ReceiveChoice = {
  cardId: number
  bankId: MozBankId
  bank: string
  reason: string
}

type BankRail = {
  id: MozBankId
  label: string
  metix: boolean
  largeFit: number
}

const RAILS: Record<MozBankId, BankRail> = {
  bci: { id: 'bci', label: 'BCI', metix: true, largeFit: 3 },
  bim: { id: 'bim', label: 'BIM', metix: true, largeFit: 3 },
  fnb: { id: 'fnb', label: 'FNB Mozambique', metix: true, largeFit: 2 },
  standard: { id: 'standard', label: 'Standard Bank Mozambique', metix: true, largeFit: 2 },
  absa: { id: 'absa', label: 'ABSA', metix: false, largeFit: 1 },
  moza: { id: 'moza', label: 'Moza Banco', metix: false, largeFit: 1 },
  vista: { id: 'vista', label: 'Vista', metix: false, largeFit: 0 },
}

export const DEFAULT_RECEIVE_HINT: ReceiveHint = {
  payerName: 'Mahomed',
  payerBanks: ['bci', 'bim'],
}

const BANK_ALIASES: Array<{ id: MozBankId; pattern: RegExp }> = [
  { id: 'bci', pattern: /\bbci\b/i },
  { id: 'bim', pattern: /\bbim\b/i },
  { id: 'fnb', pattern: /\bfnb(?:\s+mozambique)?\b/i },
  { id: 'standard', pattern: /\bstandard(?:\s+bank)?\b/i },
  { id: 'vista', pattern: /\bvista\b/i },
  { id: 'moza', pattern: /\bmoza(?:\s+banco)?\b/i },
  { id: 'absa', pattern: /\babsa\b/i },
]

export function parseReceiveHint(message: string, fallback: ReceiveHint = DEFAULT_RECEIVE_HINT): ReceiveHint {
  const text = message.trim().toLowerCase()
  if (
    /\b(not mahomed|not mohamed|different payer|another payer|new payer|unknown payer)\b/.test(text)
  ) {
    return { payerName: null, payerBanks: [] }
  }
  if (/\b(mahomed|mohamed|muhammad)\b/.test(text)) {
    return { payerName: 'Mahomed', payerBanks: ['bci', 'bim'] }
  }
  const banks = BANK_ALIASES.filter((row) => row.pattern.test(text)).map((row) => row.id)
  if (banks.length && /\b(payer|paying|pays|they (?:use|bank)|sender|operator)\b/.test(text)) {
    return {
      payerName: fallback.payerName,
      payerBanks: [...new Set(banks.filter((id) => id !== 'vista'))],
    }
  }
  return fallback
}

export function applyReceiveChoice(state: RoutingState, cardId: number): RoutingState {
  const receiveCounts = { ...(state.receiveCounts || {}) }
  receiveCounts[cardId] = (receiveCounts[cardId] || 0) + 1
  return {
    ...state,
    receiveCounts,
    lastReceiveCardId: cardId,
  }
}

function railForCard(cardId: number): BankRail | null {
  const id = cardMozBankId(cardId)
  return id ? RAILS[id] : null
}

function receiveCount(state: RoutingState, cardId: number): number {
  return (state.receiveCounts || {})[cardId] || 0
}

function bankReceiveCount(state: RoutingState, bankId: MozBankId): number {
  return state.cards
    .filter((card) => cardMozBankId(card.id) === bankId)
    .reduce((sum, card) => sum + receiveCount(state, card.id), 0)
}

function compareReceiveCandidates(
  state: RoutingState,
  a: { id: number },
  b: { id: number },
  swipeIds: Set<number>,
  hint: ReceiveHint,
  largeAmount: boolean,
  cycleNumber: number
): number {
  const aRail = railForCard(a.id)
  const bRail = railForCard(b.id)
  if (!aRail || !bRail) return a.id - b.id
  const payer = new Set(hint.payerBanks)
  const aPayer = payer.size && payer.has(aRail.id) ? 0 : 1
  const bPayer = payer.size && payer.has(bRail.id) ? 0 : 1
  if (aPayer !== bPayer) return aPayer - bPayer
  const aSwipe = swipeIds.has(a.id) ? 0 : 1
  const bSwipe = swipeIds.has(b.id) ? 0 : 1
  if (aSwipe !== bSwipe) return aSwipe - bSwipe
  if (largeAmount && aRail.largeFit !== bRail.largeFit) return bRail.largeFit - aRail.largeFit
  const aCardRecv = receiveCount(state, a.id)
  const bCardRecv = receiveCount(state, b.id)
  if (aCardRecv !== bCardRecv) return aCardRecv - bCardRecv
  const aBankRecv = bankReceiveCount(state, aRail.id)
  const bBankRecv = bankReceiveCount(state, bRail.id)
  if (aBankRecv !== bBankRecv) return aBankRecv - bBankRecv
  const aLast = state.lastReceiveCardId === a.id ? 1 : 0
  const bLast = state.lastReceiveCardId === b.id ? 1 : 0
  if (aLast !== bLast) return aLast - bLast
  const aCard = state.cards.find((row) => row.id === a.id)
  const bCard = state.cards.find((row) => row.id === b.id)
  if ((aCard?.volume || 0) !== (bCard?.volume || 0)) return (aCard?.volume || 0) - (bCard?.volume || 0)
  const aJust = aCard?.lastCycleUsed === cycleNumber - 1
  const bJust = bCard?.lastCycleUsed === cycleNumber - 1
  if (aJust !== bJust) return aJust ? 1 : -1
  if ((aCard?.restCycles || 0) !== (bCard?.restCycles || 0)) {
    return (bCard?.restCycles || 0) - (aCard?.restCycles || 0)
  }
  return a.id - b.id
}

function describeReceivePick(params: {
  state: RoutingState
  chosenId: number
  runnerUpId: number | undefined
  swipeIds: Set<number>
  hint: ReceiveHint
  amountZar: number
  largeAmount: boolean
}): string {
  const { state, chosenId, runnerUpId, swipeIds, hint, largeAmount } = params
  const chosenRail = railForCard(chosenId)
  const chosen = formatReceiveAccount(chosenId)
  const bits: string[] = []
  if (chosenRail?.metix) {
    bits.push(
      `${chosenRail.label} is on METIX, so this is a real-time local credit. Vista is not used (small bank, high fees).`
    )
  }
  if (hint.payerName && chosenRail && hint.payerBanks.includes(chosenRail.id)) {
    const banks = hint.payerBanks.map((id) => RAILS[id].label).join(' and ')
    bits.push(
      `${hint.payerName} pays from ${banks}, so a ${chosenRail.label} credit is same-bank.`
    )
  }
  if (swipeIds.has(chosenId)) {
    bits.push(`${cardShortName(chosenId)} is the debit account you will swipe to restock ZAR.`)
  } else if (swipeIds.size) {
    const swipeNames = [...swipeIds].map((id) => cardShortName(id)).join(', ')
    bits.push(`Next swipe uses ${swipeNames}; this receive still lands on a METIX debit account.`)
  }
  if (largeAmount && chosenRail) {
    bits.push(`${chosenRail.label} is suited to a large MZN credit.`)
  }
  if (state.lastReceiveCardId && state.lastReceiveCardId !== chosenId) {
    bits.push(
      `Last inbound went to ${formatReceiveAccount(state.lastReceiveCardId)}; this sale diversifies.`
    )
  } else if (runnerUpId != null && runnerUpId !== chosenId) {
    const other = formatReceiveAccount(runnerUpId)
    if (receiveCount(state, chosenId) < receiveCount(state, runnerUpId)) {
      bits.push(`${chosen} has taken fewer recent receives than ${other}.`)
    } else {
      const chosenBank = railForCard(chosenId)
      const otherBank = railForCard(runnerUpId)
      if (
        chosenBank &&
        otherBank &&
        bankReceiveCount(state, chosenBank.id) < bankReceiveCount(state, otherBank.id)
      ) {
        bits.push(`${chosenBank.label} has taken less recent inbound volume than ${otherBank.label}.`)
      }
    }
  }
  return bits.join(' ')
}

export function chooseReceiveAccount(params: {
  state: RoutingState
  overlay?: RoutingOverlay
  amountZar: number
  cycleNumber: number
  swipeCardIds: number[]
  hint?: ReceiveHint
}): ReceiveChoice | null {
  const overlay = params.overlay
  const excluded = new Set(overlay?.excludedCardIds || [])
  const hint = params.hint || DEFAULT_RECEIVE_HINT
  const swipeIds = new Set(params.swipeCardIds)
  const largeAmount = params.amountZar >= (params.state.config.maxCardAmount || 15_000)
  const candidates = params.state.cards.filter((card) => {
    if (excluded.has(card.id)) return false
    const rail = railForCard(card.id)
    return Boolean(rail?.metix)
  })
  if (!candidates.length) return null
  candidates.sort((a, b) =>
    compareReceiveCandidates(
      params.state,
      a,
      b,
      swipeIds,
      hint,
      largeAmount,
      params.cycleNumber
    )
  )
  const chosen = candidates[0]
  const rail = railForCard(chosen.id)
  if (!rail) return null
  return {
    cardId: chosen.id,
    bankId: rail.id,
    bank: cardMozBank(chosen.id),
    reason: describeReceivePick({
      state: params.state,
      chosenId: chosen.id,
      runnerUpId: candidates[1]?.id,
      swipeIds,
      hint,
      amountZar: params.amountZar,
      largeAmount,
    }),
  }
}

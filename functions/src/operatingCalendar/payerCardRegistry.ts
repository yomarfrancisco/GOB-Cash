/**
 * Payer → card registry for OperatingPolicyV1.
 * Invoice eligibility is by payer family; multi-card families resolve to the
 * family set, then capacity / route evidence / diversification choose the card.
 */
import type { CardId } from './operatingPolicyV1'

export type PayerFamilyId = 'brics' | 'ginav' | 'vidrotec' | 'wolf' | 'goblin' | 'kayman'

export type PayerFamilyRecord = {
  payerFamilyId: PayerFamilyId
  /** Commercial invoice / debtor label. */
  label: string
  /** Eligible cards for this payer — never hard-code a singleton when the family has peers. */
  cardIds: CardId[]
  /** Established BCI (or primary) card when the family has a Moza twin. */
  primaryCardId: CardId
  /** Moza twin when equivalent-capacity; null for single-card payers. */
  mozaCardId: CardId | null
}

/** External Moz daily capacity (MZN) — Moza equals BCI for Wolf / Goblin. */
export const EXTERNAL_DAILY_CAPACITY_MZN = 350_000

/**
 * Within a multi-card family, target band when route evidence is equivalent.
 * Learned settlement outcomes may move the split.
 */
export const FAMILY_CARD_SPLIT = {
  minShare: 0.4,
  maxShare: 0.6,
} as const

export const PAYER_FAMILIES: PayerFamilyRecord[] = [
  {
    payerFamilyId: 'brics',
    label: 'BRICS',
    cardIds: ['BRICS'],
    primaryCardId: 'BRICS',
    mozaCardId: null,
  },
  {
    payerFamilyId: 'ginav',
    label: 'Ginav',
    cardIds: ['Ginav'],
    primaryCardId: 'Ginav',
    mozaCardId: null,
  },
  {
    payerFamilyId: 'vidrotec',
    label: 'Vidrotec',
    cardIds: ['Vidrotec'],
    primaryCardId: 'Vidrotec',
    mozaCardId: null,
  },
  {
    payerFamilyId: 'wolf',
    label: 'Wolf',
    cardIds: ['Wolf', 'WolfMoza'],
    primaryCardId: 'Wolf',
    mozaCardId: 'WolfMoza',
  },
  {
    payerFamilyId: 'goblin',
    label: 'Goblin',
    cardIds: ['Goblin', 'GoblinMoza'],
    primaryCardId: 'Goblin',
    mozaCardId: 'GoblinMoza',
  },
  {
    payerFamilyId: 'kayman',
    label: 'Kayman',
    cardIds: ['Kayman'],
    primaryCardId: 'Kayman',
    mozaCardId: null,
  },
]

/** Active October desk payers (Kayman held out of the reference month unless enabled). */
export const OCTOBER_ACTIVE_PAYER_FAMILIES: PayerFamilyId[] = [
  'brics',
  'ginav',
  'vidrotec',
  'wolf',
  'goblin',
]

export function payerFamilyOf(id: PayerFamilyId): PayerFamilyRecord {
  const row = PAYER_FAMILIES.find((f) => f.payerFamilyId === id)
  if (!row) throw new Error(`Unknown payer family ${id}`)
  return row
}

export function payerFamilyOfCard(cardId: CardId): PayerFamilyRecord | null {
  return PAYER_FAMILIES.find((f) => f.cardIds.includes(cardId)) || null
}

export function eligibleCardsForPayer(payerFamilyId: PayerFamilyId): CardId[] {
  return [...payerFamilyOf(payerFamilyId).cardIds]
}

export function isMozaCard(cardId: CardId): boolean {
  return cardId === 'WolfMoza' || cardId === 'GoblinMoza'
}

export function siblingCard(cardId: CardId): CardId | null {
  const fam = payerFamilyOfCard(cardId)
  if (!fam || fam.cardIds.length < 2) return null
  return fam.cardIds.find((c) => c !== cardId) || null
}

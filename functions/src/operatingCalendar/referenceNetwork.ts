/**
 * Reference network for OperatingPolicyV1.
 * Econometrica is model-eligible throughout Month 1/2 but live-ineligible until a real Capitec MID is recorded.
 */
import type { AcquirerId, CardId, MerchantPrincipalId, TerminalId } from './operatingPolicyV1'
import { acquirerOfTerminal, merchantPrincipalOfTerminal } from './operatingPolicyV1'
import { COMPANIES, RAILS } from '../settlement/register'

export type TerminalRecord = {
  terminalId: TerminalId
  merchantPrincipalId: MerchantPrincipalId
  acquirerBankId: AcquirerId
  /** Production machine id when mapped (1–4 live rails; 5 = Econometrica model-only). */
  machineId: number
  /** Live execution requires a non-empty real merchant MID on the acquirer. */
  liveMerchantId: string | null
  modeledEligible: boolean
  liveExecutable: boolean
  legalName: string
}

export type CardRecord = {
  cardId: CardId
  issuerBankId: string
  inventoryCardId: number | null
}

export const REFERENCE_CARDS_M1: CardRecord[] = [
  { cardId: 'BRICS', issuerBankId: 'FNB Mozambique', inventoryCardId: 1 },
  { cardId: 'Ginav', issuerBankId: 'Standard Bank Mozambique', inventoryCardId: 2 },
  { cardId: 'Vidrotec', issuerBankId: 'BIM', inventoryCardId: 3 },
  { cardId: 'Wolf', issuerBankId: 'BCI', inventoryCardId: 4 },
  { cardId: 'Goblin', issuerBankId: 'BCI', inventoryCardId: 5 },
  { cardId: 'Kayman', issuerBankId: 'FNB Mozambique', inventoryCardId: 6 },
]

export const NEW_CARD_M2: CardRecord = {
  cardId: 'NEW_CARD_M2',
  issuerBankId: 'PENDING_ISSUER',
  inventoryCardId: null,
}

function liveMidForMachine(machineId: number): string | null {
  const rail = RAILS.find((r) => {
    if (machineId === 1) return r.id === 'lemon_fnb'
    if (machineId === 2) return r.id === 'imani_fnb'
    if (machineId === 3) return r.id === 'lemon_capitec'
    if (machineId === 4) return r.id === 'wolf_fnb'
    return false
  })
  return rail?.merchantId || null
}

export const REFERENCE_TERMINALS: TerminalRecord[] = [
  {
    terminalId: 'WolfFNB',
    merchantPrincipalId: 'wolf_and_sons',
    acquirerBankId: 'fnb',
    machineId: 4,
    liveMerchantId: liveMidForMachine(4),
    modeledEligible: true,
    liveExecutable: Boolean(liveMidForMachine(4)),
    legalName: COMPANIES.wolf_and_sons?.legalName || 'Wolf and Sons',
  },
  {
    terminalId: 'BricsFNB',
    merchantPrincipalId: 'lemon_economics',
    acquirerBankId: 'fnb',
    machineId: 1,
    liveMerchantId: liveMidForMachine(1),
    modeledEligible: true,
    liveExecutable: Boolean(liveMidForMachine(1)),
    legalName: COMPANIES.lemon_economics?.legalName || 'Lemon Economics',
  },
  {
    terminalId: 'BricsCapitec',
    merchantPrincipalId: 'lemon_economics',
    acquirerBankId: 'capitec',
    machineId: 3,
    liveMerchantId: liveMidForMachine(3),
    modeledEligible: true,
    liveExecutable: Boolean(liveMidForMachine(3)),
    legalName: COMPANIES.lemon_economics?.legalName || 'Lemon Economics',
  },
  {
    terminalId: 'Imani',
    merchantPrincipalId: 'imani',
    acquirerBankId: 'fnb',
    machineId: 2,
    liveMerchantId: liveMidForMachine(2),
    modeledEligible: true,
    liveExecutable: Boolean(liveMidForMachine(2)),
    legalName: COMPANIES.imani?.legalName || 'Imani Beauty Distributors',
  },
  {
    terminalId: 'Econometrica',
    merchantPrincipalId: 'econometrica',
    acquirerBankId: 'capitec',
    machineId: 5,
    /** Do not invent a MID — live execution remains blocked until recorded. */
    liveMerchantId: null,
    modeledEligible: true,
    liveExecutable: false,
    legalName: 'Econometrica (Pty) Ltd',
  },
]

/** Simulation-only: every reference card may use every reference terminal (fixture assumes documented basis). */
export function modeledEligiblePairs(cards: CardRecord[] = REFERENCE_CARDS_M1): Array<{
  cardId: CardId
  terminalId: TerminalId
  merchantPrincipalId: MerchantPrincipalId
  acquirerBankId: AcquirerId
  liveExecutable: boolean
  legalEligibilityRef: string
}> {
  const out: Array<{
    cardId: CardId
    terminalId: TerminalId
    merchantPrincipalId: MerchantPrincipalId
    acquirerBankId: AcquirerId
    liveExecutable: boolean
    legalEligibilityRef: string
  }> = []
  for (const card of cards) {
    for (const term of REFERENCE_TERMINALS) {
      out.push({
        cardId: card.cardId,
        terminalId: term.terminalId,
        merchantPrincipalId: merchantPrincipalOfTerminal(term.terminalId),
        acquirerBankId: acquirerOfTerminal(term.terminalId),
        liveExecutable: term.liveExecutable,
        legalEligibilityRef: `REF-ELIG-${card.cardId}-${term.terminalId}`,
      })
    }
  }
  return out
}

export function terminalById(id: TerminalId): TerminalRecord {
  const row = REFERENCE_TERMINALS.find((t) => t.terminalId === id)
  if (!row) throw new Error(`Unknown terminal ${id}`)
  return row
}

export function assertLiveExecutable(terminalId: TerminalId): void {
  const term = terminalById(terminalId)
  if (!term.liveExecutable) {
    throw new Error(
      `Terminal ${terminalId} is model-eligible but not live-executable (missing real acquirer merchant ID)`
    )
  }
}

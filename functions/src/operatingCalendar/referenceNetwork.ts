/**
 * Reference network for OperatingPolicyV1.
 * Econometrica (machine 5) is live-executable once its Capitec MID/TID are on the rail register.
 */
import type { AcquirerId, CardId, MerchantPrincipalId, TerminalId } from './operatingPolicyV1'
import { acquirerOfTerminal, merchantPrincipalOfTerminal } from './operatingPolicyV1'
import { COMPANIES, RAILS } from '../settlement/register'

export type TerminalRecord = {
  terminalId: TerminalId
  merchantPrincipalId: MerchantPrincipalId
  acquirerBankId: AcquirerId
  /** Production machine id when mapped (1–5 live rails). */
  machineId: number
  /** Live execution requires a non-empty real merchant MID on the acquirer. */
  liveMerchantId: string | null
  /** Acquirer terminal / TID when recorded. */
  liveTerminalId: string | null
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
  /** Equivalent-capacity Moza twins for Wolf / Goblin payer families (desk ids 7–8). */
  { cardId: 'WolfMoza', issuerBankId: 'Moza', inventoryCardId: 7 },
  { cardId: 'GoblinMoza', issuerBankId: 'Moza', inventoryCardId: 8 },
]

export const NEW_CARD_M2: CardRecord = {
  cardId: 'NEW_CARD_M2',
  issuerBankId: 'PENDING_ISSUER',
  inventoryCardId: null,
}

function railForMachine(machineId: number) {
  return (
    RAILS.find((r) => {
      if (machineId === 1) return r.id === 'lemon_fnb'
      if (machineId === 2) return r.id === 'imani_fnb'
      if (machineId === 3) return r.id === 'lemon_capitec'
      if (machineId === 4) return r.id === 'wolf_fnb'
      if (machineId === 5) return r.id === 'econometrica_capitec'
      return false
    }) || null
  )
}

function liveMidForMachine(machineId: number): string | null {
  return railForMachine(machineId)?.merchantId || null
}

function liveTidForMachine(machineId: number): string | null {
  return railForMachine(machineId)?.terminalId || null
}

export const REFERENCE_TERMINALS: TerminalRecord[] = [
  {
    terminalId: 'WolfFNB',
    merchantPrincipalId: 'wolf_and_sons',
    acquirerBankId: 'fnb',
    machineId: 4,
    liveMerchantId: liveMidForMachine(4),
    liveTerminalId: liveTidForMachine(4),
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
    liveTerminalId: liveTidForMachine(1),
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
    liveTerminalId: liveTidForMachine(3),
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
    liveTerminalId: liveTidForMachine(2),
    modeledEligible: true,
    liveExecutable: Boolean(liveMidForMachine(2)),
    legalName: COMPANIES.imani?.legalName || 'Imani Beauty Distributors',
  },
  {
    terminalId: 'Econometrica',
    merchantPrincipalId: 'econometrica',
    acquirerBankId: 'capitec',
    machineId: 5,
    liveMerchantId: liveMidForMachine(5),
    liveTerminalId: liveTidForMachine(5),
    modeledEligible: true,
    liveExecutable: Boolean(liveMidForMachine(5)),
    legalName: COMPANIES.econometrica?.legalName || 'Econometrica',
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

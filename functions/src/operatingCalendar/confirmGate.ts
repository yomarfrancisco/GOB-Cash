/**
 * Confirm enforcement for OperatingPolicyV1.
 * Rejects early / stale / liquidity / commercial / live-ineligible routes.
 */
import { assertLiveExecutable, terminalById } from './referenceNetwork'
import {
  OPERATING_POLICY_V1,
  OPERATING_POLICY_VERSION,
  merchantPrincipalOfTerminal,
  type TerminalId,
} from './operatingPolicyV1'
import { pendingExposureZar, type ContinuityStateV1 } from './continuityState'

export type ConfirmInstruction = {
  instructionId: string
  invoiceId: string
  /** Mozambique debtor / card holder label. */
  mozambiqueDebtor: string
  cardId: string
  issuerBankId: string
  merchantPrincipalId: string
  invoiceIssuerId: string
  terminalId: TerminalId
  acquirerBankId: string
  zarRecipientId: string
  amountZar: number
  legalEligibilityRef: string
  earliestAt: string
  /** Fingerprint of the issued plan — Confirm must match or be rejected as stale. */
  planHash: string
  liveExecutable: boolean
}

export type ConfirmGateResult =
  | { ok: true; policyVersion: typeof OPERATING_POLICY_VERSION }
  | {
      ok: false
      code:
        | 'early'
        | 'stale'
        | 'commercial'
        | 'principal_mismatch'
        | 'live_ineligible'
        | 'liquidity'
        | 'frozen_card'
        | 'frozen_terminal'
        | 'amount'
        | 'spacing'
      message: string
      updatedInstruction?: ConfirmInstruction
    }

export function validateCommercialIdentity(inst: ConfirmInstruction): string | null {
  const required: Array<[string, string]> = [
    ['invoiceId', inst.invoiceId],
    ['mozambiqueDebtor', inst.mozambiqueDebtor],
    ['cardId', inst.cardId],
    ['issuerBankId', inst.issuerBankId],
    ['merchantPrincipalId', inst.merchantPrincipalId],
    ['invoiceIssuerId', inst.invoiceIssuerId],
    ['terminalId', inst.terminalId],
    ['acquirerBankId', inst.acquirerBankId],
    ['zarRecipientId', inst.zarRecipientId],
    ['legalEligibilityRef', inst.legalEligibilityRef],
  ]
  for (const [k, v] of required) {
    if (!v || !String(v).trim()) return `Missing ${k}`
  }
  if (!(inst.amountZar > 0)) return 'Missing full invoice amount'
  if (inst.amountZar > OPERATING_POLICY_V1.payment.maxAmountZar) {
    return `Amount ${inst.amountZar} exceeds max ${OPERATING_POLICY_V1.payment.maxAmountZar}`
  }
  return null
}

export function evaluateConfirmGate(params: {
  instruction: ConfirmInstruction
  nowIso: string
  /** Current plan hash for this instruction after any replan. */
  currentPlanHash: string
  continuity: ContinuityStateV1
  /** Peak unsettled + buffer requirement for the operating window. */
  requiredWorkingLiquidityZar: number
  availableWorkingLiquidityZar: number
  /** Optional updated instruction returned on early/stale. */
  updatedInstruction?: ConfirmInstruction
}): ConfirmGateResult {
  const inst = params.instruction
  const commercial = validateCommercialIdentity(inst)
  if (commercial) {
    return { ok: false, code: 'commercial', message: commercial }
  }

  const expectedPrincipal = merchantPrincipalOfTerminal(inst.terminalId)
  if (
    inst.merchantPrincipalId !== expectedPrincipal ||
    inst.invoiceIssuerId !== expectedPrincipal ||
    inst.zarRecipientId !== expectedPrincipal
  ) {
    return {
      ok: false,
      code: 'principal_mismatch',
      message:
        'Invoice principal, POS merchant principal and ZAR recipient must match the terminal merchant',
    }
  }

  if (params.continuity.frozenCardIds.includes(inst.cardId as never)) {
    return { ok: false, code: 'frozen_card', message: `Card ${inst.cardId} is frozen pending outcome` }
  }
  if (params.continuity.frozenTerminalIds.includes(inst.terminalId)) {
    return {
      ok: false,
      code: 'frozen_terminal',
      message: `Terminal ${inst.terminalId} is frozen`,
    }
  }

  if (inst.planHash !== params.currentPlanHash) {
    return {
      ok: false,
      code: 'stale',
      message: 'Instruction was replanned — confirm the updated instruction',
      updatedInstruction: params.updatedInstruction,
    }
  }

  const now = Date.parse(params.nowIso)
  const earliest = Date.parse(inst.earliestAt)
  if (Number.isFinite(earliest) && now < earliest) {
    return {
      ok: false,
      code: 'early',
      message: `Confirm rejected: attempt is before ${inst.earliestAt}`,
      updatedInstruction: params.updatedInstruction || inst,
    }
  }

  if (!inst.liveExecutable) {
    try {
      assertLiveExecutable(inst.terminalId)
    } catch (e) {
      return {
        ok: false,
        code: 'live_ineligible',
        message: e instanceof Error ? e.message : 'Route is not live-executable',
      }
    }
  }

  const term = terminalById(inst.terminalId)
  if (!term.liveExecutable || !term.liveMerchantId) {
    return {
      ok: false,
      code: 'live_ineligible',
      message: `Terminal ${inst.terminalId} is model-eligible but missing a real acquirer merchant ID`,
    }
  }

  const pending = pendingExposureZar(params.continuity)
  const headroom = params.availableWorkingLiquidityZar - params.requiredWorkingLiquidityZar
  if (pending + inst.amountZar > params.availableWorkingLiquidityZar + 0.05) {
    return {
      ok: false,
      code: 'liquidity',
      message: `Pending exposure ${pending + inst.amountZar} exceeds available working liquidity ${params.availableWorkingLiquidityZar}`,
    }
  }
  if (headroom < 0) {
    return {
      ok: false,
      code: 'liquidity',
      message: `Working liquidity headroom is negative (required ${params.requiredWorkingLiquidityZar}, available ${params.availableWorkingLiquidityZar})`,
    }
  }

  return { ok: true, policyVersion: OPERATING_POLICY_VERSION }
}

/**
 * Map live desk machine id → operating-calendar terminal when known.
 * Machine 5 (Econometrica) is model-only until MID is recorded.
 */
export function terminalIdFromMachineId(machineId: number): TerminalId | null {
  if (machineId === 1) return 'BricsFNB'
  if (machineId === 2) return 'Imani'
  if (machineId === 3) return 'BricsCapitec'
  if (machineId === 4) return 'WolfFNB'
  if (machineId === 5) return 'Econometrica'
  return null
}

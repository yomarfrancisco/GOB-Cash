export type AutonomousDeskSnapshot = {
  status: string
  cyclePhase: string
  deskStep: number
  awaitingKind: string
  expectedZar: number
  expectedMzn: number
  spendableZar: number
  spendableMzn: number
}

/** Daily 09:00 SAST batch — not a 5-minute micro-settlement loop. */
export const AUTONOMOUS_EVALUATION_INTERVAL = 'every day 09:00'

export type AutonomousDecision =
  | 'advance_internal'
  | 'execute_integrated_send'
  | 'confirm_from_bank_evidence'
  | 'pending_funding'
  | 'pending_physical_evidence'
  | 'idle'

/**
 * The autonomous worker may only advance state that is implemented inside the
 * backend. Card/POS/EFT execution remains pending until bank evidence lands.
 */
export function decideAutonomousAction(snapshot: AutonomousDeskSnapshot): AutonomousDecision {
  if (snapshot.status !== 'active') return 'idle'
  if (snapshot.cyclePhase === 'hold') return 'idle'

  if (snapshot.awaitingKind === 'replenish') {
    return 'confirm_from_bank_evidence'
  }

  if (snapshot.cyclePhase === 'order_open' || snapshot.cyclePhase === 'awaiting_invoice') {
    if (!(snapshot.expectedZar > 0)) return 'idle'
    return snapshot.spendableZar + 0.005 >= snapshot.expectedZar
      ? 'advance_internal'
      : 'pending_funding'
  }

  if (snapshot.cyclePhase === 'awaiting_mzn' && snapshot.deskStep < 4) {
    return snapshot.spendableMzn + 0.005 >= snapshot.expectedMzn
      ? 'advance_internal'
      : 'pending_funding'
  }

  if (
    snapshot.cyclePhase === 'awaiting_send' ||
    snapshot.cyclePhase === 'awaiting_continue' ||
    snapshot.awaitingKind === 'deploy'
  ) {
    if (!(snapshot.expectedZar > 0)) return 'idle'
    return snapshot.spendableZar + 0.005 >= snapshot.expectedZar
      ? 'execute_integrated_send'
      : 'pending_funding'
  }

  if (snapshot.cyclePhase === 'awaiting_recycle') {
    return 'confirm_from_bank_evidence'
  }

  if (snapshot.cyclePhase === 'awaiting_day_close' || snapshot.deskStep === 6) {
    return 'advance_internal'
  }

  return 'idle'
}

export function sastDateKey(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs))
}

export function autonomousTickRunId(nowMs: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Johannesburg',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs))
  const hour = parts.find((part) => part.type === 'hour')?.value || '00'
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0)
  const fiveMinute = String(Math.floor(minute / 5) * 5).padStart(2, '0')
  return `${sastDateKey(nowMs)}-${hour}${fiveMinute}`
}

export type ExposureSnapshot = {
  walletZar: number
  walletMzn: number
  committedZar: number
  inTransitZar: number
}

export function normalizeExposure(input: ExposureSnapshot): ExposureSnapshot & {
  spendableZar: number
  spendableMzn: number
} {
  const money = (value: number) =>
    Math.round((Number.isFinite(value) ? Math.max(0, value) : 0) * 100) / 100
  const walletZar = money(input.walletZar)
  const walletMzn = money(input.walletMzn)
  return {
    walletZar,
    walletMzn,
    // Wallet balances are the spendable source of truth. Exposure is reported
    // separately because EN_ROUTE amounts have already left their source wallet.
    spendableZar: walletZar,
    spendableMzn: walletMzn,
    committedZar: money(input.committedZar),
    inTransitZar: money(input.inTransitZar),
  }
}

export function canClaimAutonomousRun(input: {
  status?: string
  heartbeatMs?: number
  nowMs: number
  leaseMs: number
}): boolean {
  if (input.status === 'completed') return false
  if (
    input.status === 'running' &&
    input.nowMs - Math.max(0, input.heartbeatMs || 0) < input.leaseMs
  ) {
    return false
  }
  return true
}

/** ZAR remains in custody when a booking moves it from cashZAR to EN ROUTE. */
export function zarCustodyTotal(input: Pick<ExposureSnapshot, 'walletZar' | 'inTransitZar'>): number {
  return Math.round((Math.max(0, input.walletZar) + Math.max(0, input.inTransitZar)) * 100) / 100
}

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

export const AUTONOMOUS_WEEKDAY_BATCHES = ['09:00', '15:00'] as const

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

  if (snapshot.awaitingKind === 'replenish') {
    return 'confirm_from_bank_evidence'
  }

  if (snapshot.cyclePhase === 'order_open' || snapshot.cyclePhase === 'awaiting_invoice') {
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

export function scheduledRunId(slot: '09' | '15', nowMs: number): string {
  return `${sastDateKey(nowMs)}-${slot}00`
}

export function dueScheduledSlots(nowMs: number): Array<'09' | '15'> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs))
  const weekday = parts.find((part) => part.type === 'weekday')?.value || ''
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || -1)
  if (weekday === 'Sat' || weekday === 'Sun' || hour < 9) return []
  return hour >= 15 ? ['09', '15'] : ['09']
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

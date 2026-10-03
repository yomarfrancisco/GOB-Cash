/**
 * Continuous calendar cycle phases.
 * Orders are already scheduled; Continue walks the schedule; $ lengthens days
 * within the same daily ceiling unless infrastructure changes.
 */

export type CyclePhase =
  | 'order_open' // Sam: Day n order on calendar
  | 'awaiting_mzn' // Amina: invoice raised; waiting for MZN batch in full
  | 'awaiting_continue' // Leo short on ZAR float; need inject / Continue
  | 'awaiting_send' // Leo: ZAR send ready (deploy confirm)
  | 'awaiting_recycle' // Sam/Amina: mandatory MZN→ZAR for invoice
  | 'hold' // No ticket today; residual unchanged
  | 'window_done'

export function isAwaitingMznPhase(phase: string | undefined | null): boolean {
  return phase === 'awaiting_mzn'
}

export function isAwaitingContinuePhase(phase: string | undefined | null): boolean {
  return phase === 'awaiting_continue'
}

export function isLeoSendPhase(phase: string | undefined | null, awaitingKind?: string | null): boolean {
  return phase === 'awaiting_send' || (!phase && awaitingKind === 'deploy')
}

export function isRecyclePhase(phase: string | undefined | null, awaitingKind?: string | null): boolean {
  return phase === 'awaiting_recycle' || awaitingKind === 'replenish'
}

export function expectedMznForOrder(orderZar: number, sellRate: number): number {
  if (!(orderZar > 0) || !(sellRate > 0)) return 0
  return Math.round(orderZar * sellRate * 100) / 100
}

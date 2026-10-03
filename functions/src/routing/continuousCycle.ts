/**
 * Continuous calendar cycle.
 * Day 0 = capital inject / window open. Days 1…n walk this loop without a clock pause.
 *
 * Step 1 · Order     — Sam posts the day's ZAR order
 * Step 2 · Invoice   — Amina raises invoices
 * Step 3 · MZN       — full MZN cover clears the gate
 * Step 4 · Send      — Leo sends ZAR (or Continue if float is short)
 * Step 5 · Recycle   — Amina restocks MZN→ZAR @ COST
 * Step 6 · Next day  — book advances; Step 1 opens on Day n+1
 */

export type CyclePhase =
  | 'order_open' // Step 1 — Sam order; Continue → invoice
  | 'awaiting_invoice' // Step 2 — invoices on desk; Continue → MZN gate
  | 'awaiting_mzn' // Step 3 — waiting for MZN cover; Continue → send
  | 'awaiting_continue' // Step 4 short ZAR
  | 'awaiting_send' // Step 4 ready
  | 'awaiting_recycle' // Step 5
  | 'hold'
  | 'window_done'

export type DeskStepNumber = 1 | 2 | 3 | 4 | 5 | 6

export const DESK_STEP: Record<
  DeskStepNumber,
  { n: DeskStepNumber; short: string; title: string }
> = {
  1: { n: 1, short: 'Order', title: 'Step 1 · Order' },
  2: { n: 2, short: 'Invoice', title: 'Step 2 · Invoice' },
  3: { n: 3, short: 'MZN', title: 'Step 3 · MZN' },
  4: { n: 4, short: 'Send', title: 'Step 4 · Send' },
  5: { n: 5, short: 'Recycle', title: 'Step 5 · Recycle' },
  6: { n: 6, short: 'Next day', title: 'Step 6 · Next day' },
}

export function stepTitle(step: DeskStepNumber, detail: string): string {
  return `${DESK_STEP[step].title} · ${detail}`
}

export function stepForPhase(phase: string | undefined | null): DeskStepNumber | null {
  switch (phase) {
    case 'order_open':
      return 1
    case 'awaiting_invoice':
      return 2
    case 'awaiting_mzn':
      return 3
    case 'awaiting_continue':
    case 'awaiting_send':
      return 4
    case 'awaiting_recycle':
      return 5
    default:
      return null
  }
}

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

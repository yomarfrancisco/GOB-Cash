/**
 * Transaction State Machine
 * Defines allowed state transitions for transaction workflow
 */

export type TxStatus =
  | 'AWAITING_DEPOSIT'
  | 'DEPOSIT_SENT'
  | 'DEPOSIT_RECEIVED'
  | 'CREDITED'
  | 'LOCKED'
  | 'READY_FOR_WITHDRAWAL'
  | 'WITHDRAWAL_REQUESTED'
  | 'WITHDRAWAL_CONFIRMED'
  | 'WITHDRAWAL_SENDING'
  | 'WITHDRAWAL_SENT'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED'

/**
 * Allowed state transitions
 * Maps from current state to array of allowed next states
 */
export const allowedTransitions: Record<TxStatus, TxStatus[]> = {
  AWAITING_DEPOSIT: ['DEPOSIT_SENT', 'CANCELLED'],
  DEPOSIT_SENT: ['DEPOSIT_RECEIVED', 'DISPUTED', 'CANCELLED'],
  DEPOSIT_RECEIVED: ['CREDITED', 'LOCKED'], // Allow direct to LOCKED for simplicity
  CREDITED: ['LOCKED'],
  LOCKED: ['READY_FOR_WITHDRAWAL'],
  READY_FOR_WITHDRAWAL: ['WITHDRAWAL_REQUESTED', 'CANCELLED'],
  WITHDRAWAL_REQUESTED: ['WITHDRAWAL_CONFIRMED', 'DISPUTED'],
  WITHDRAWAL_CONFIRMED: ['WITHDRAWAL_SENDING', 'WITHDRAWAL_SENT'], // Allow direct to SENT for simplicity
  WITHDRAWAL_SENDING: ['WITHDRAWAL_SENT'],
  WITHDRAWAL_SENT: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [], // Terminal state
  DISPUTED: [], // Terminal state (can be reopened later if needed)
  CANCELLED: [], // Terminal state
}

/**
 * Assert that a state transition is valid
 * Throws an error if the transition is not allowed
 */
export function assertTransition(from: TxStatus, to: TxStatus): void {
  const allowed = allowedTransitions[from]
  if (!allowed) {
    throw new Error(`Invalid source state: ${from}`)
  }
  
  if (!allowed.includes(to)) {
    throw new Error(`Invalid transition: ${from} -> ${to}. Allowed: ${allowed.join(', ')}`)
  }
}


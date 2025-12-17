/**
 * Transaction Types
 * Core data models for transaction threads
 */

export type TxStatus =
  | 'AWAITING_DEPOSIT'
  | 'DEPOSIT_SENT'
  | 'DEPOSIT_RECEIVED'
  | 'LOCKED'
  | 'READY_FOR_WITHDRAWAL'
  | 'WITHDRAWAL_REQUESTED'
  | 'WITHDRAWAL_CONFIRMED'
  | 'WITHDRAWAL_SENDING'
  | 'WITHDRAWAL_SENT'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED'

export type Transaction = {
  id: string
  type: 'BANK_DEPOSIT_TO_USDT_TRON' | 'PAYMENT_TO_USER'
  userId?: string // For BANK_DEPOSIT_TO_USDT_TRON
  senderId?: string // For PAYMENT_TO_USER
  receiverId: string
  participants: string[]
  status: TxStatus
  createdAt: any
  statusUpdatedAt?: any
  unlockAt?: any
  amountZar?: number
  amountUSDT?: number // For PAYMENT_TO_USER
  fxRateZARperUSDT?: number // For PAYMENT_TO_USER
  receiverHandle?: string // For PAYMENT_TO_USER
  withdrawal?: {
    network?: 'TRON'
    tronAddress?: string
    amountUsdt?: number
    txHash?: string
    withdrawalId?: string
  }
}


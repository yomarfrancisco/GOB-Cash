/**
 * Transaction types for deposit chat flow
 */

// TxStatus type definition (matches functions/src/tx/state.ts)
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

export type ChatStep =
  | 'INTRO_CONFIRM_INTENT'
  | 'WAITING_FOR_SENT_PROOF'
  | 'WAITING_FOR_WALLET_ADDRESS'
  | 'WAITING_FOR_AGENT_CONFIRMATION'
  | 'DEPOSIT_CONFIRMED_LOCKED_DONE'

export type SenderType = 'USER' | 'SAMBA' | 'SYSTEM' | 'CUSTOMER' | 'AGENT'

export interface TransactionMessage {
  id: string
  txId: string
  senderType: SenderType
  senderUid?: string // For CUSTOMER and AGENT
  text: string
  createdAt: any // Firestore Timestamp
  metadata?: {
    status?: TxStatus
    reference?: string
    [key: string]: any
  }
}

export interface BankDepositTransaction {
  id: string
  type: 'BANK_DEPOSIT_TO_USDT_TRON'
  status: TxStatus
  userId: string // Customer UID
  receiverId: string // Agent UID (hardcoded for v1)
  participants: string[] // [customerUid, agentUid, 'samba']
  bankCountry: 'MZ' | 'ZA'
  bankId: 'ABSA' | 'BCI' | 'FNB'
  depositCurrency: 'ZAR' | 'MZN'
  depositReference: string
  amountMzn: number
  amountZar: number
  withdrawalAddressCandidate?: string // TRON address collected from user
  chatStep: ChatStep
  createdAt: any
  updatedAt: any
  statusUpdatedAt: any
  expiresAt?: any
  unlockAt?: any
  withdrawal: Record<string, any>
  depositDetails?: { // Stored deposit details for Samba messages (from persisted amount)
    amount: number
    currency: 'USD' | 'ZAR' | 'MZN'
    country: string
    bankName: string
    reference: string
  }
}

export interface PaymentTransaction {
  id: string
  type: 'PAYMENT_TO_USER'
  status: TxStatus // SENT | COMPLETED
  senderId: string // Payer UID
  receiverId: string // Payee UID
  participants: string[] // [senderId, receiverId, 'samba']
  amountMzn: number
  amountZar: number
  fxRateMZNperZAR: number // Snapshot of rate used
  receiverHandle: string // For display/search
  createdAt: any
  updatedAt: any
  statusUpdatedAt: any
}

// Hardcoded agent UID for v1
export const AGENT_UID = 'xHKmkizXhPOU25vwTIB6dxhMzSH2' // ygor.francisco@gmail.com
export const SAMBA_UID = 'samba' // Virtual UID for Samba


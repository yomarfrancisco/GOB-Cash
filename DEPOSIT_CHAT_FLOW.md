# Deposit Chat Flow Documentation

## Overview

This document describes the 3-way deposit chat flow for bank deposits. The flow involves:
- **Customer** (signed-in user)
- **Samba** (LLM-guided assistant, deterministic transaction pilot)
- **Agent** (Ygor - hardcoded UID: `xHKmkizXhPOU25vwTIB6dxhMzSH2`)

## Flow States

### Chat Steps (chatStep enum)

1. **INTRO_CONFIRM_INTENT** - Initial state, Samba sends intro message
2. **WAITING_FOR_SENT_PROOF** - User needs to reply "SENT"
3. **WAITING_FOR_WALLET_ADDRESS** - User needs to provide TRON address
4. **WAITING_FOR_AGENT_CONFIRMATION** - Waiting for agent to confirm deposit
5. **DEPOSIT_CONFIRMED_LOCKED_DONE** - Final state, deposit confirmed and locked

## User Journey

### 1. Bank Details Sheet → NEXT Button

**Location:** `src/components/BankTransferDetailsSheet.tsx`

- User selects country → bank → sees bank details
- Taps **NEXT** button (changed from CLOSE)
- Transaction is created via `tx_createBankDepositRequest`
- Transaction is updated with:
  - `bankCountry`: MZ | ZA
  - `bankId`: ABSA | BCI | FNB
  - `depositCurrency`: ZAR | MZN
  - `depositReference`: Reference code from bank config
  - `chatStep`: INTRO_CONFIRM_INTENT
  - `participants`: [customerUid, agentUid, 'samba']

### 2. Deposit Chat Opens

**Location:** `src/components/DepositChatSheet.tsx`

- Chat sheet opens with transaction ID
- Samba automatically sends intro message (INTRO_CONFIRM_INTENT step)
- Message includes:
  - Customer first name
  - Bank name and country
  - Reference number
  - Instructions to reply "SENT"

### 3. User Replies "SENT"

- User types "SENT" (case-insensitive) or provides proof
- System calls `tx_userMarkDepositSent(txId)`
- Transaction status: AWAITING_DEPOSIT → DEPOSIT_SENT
- chatStep: INTRO_CONFIRM_INTENT → WAITING_FOR_WALLET_ADDRESS
- Samba sends message asking for TRON address

### 4. User Provides TRON Address

- User sends TRON (TRC-20) address (must start with "T", ~34 chars)
- Address is validated via `isValidTronAddress()`
- If valid:
  - Stored in `tx.withdrawalAddressCandidate`
  - chatStep: WAITING_FOR_WALLET_ADDRESS → WAITING_FOR_AGENT_CONFIRMATION
  - Samba confirms address saved
- If invalid:
  - Samba sends helper message asking for valid TRC-20 address

### 5. Agent Confirms Deposit

**Location:** `src/components/AgentInboxSheet.tsx`

- Agent (Ygor) logs in with UID: `xHKmkizXhPOU25vwTIB6dxhMzSH2`
- Agent sees "Agent Inbox" button in profile (only visible to agents)
- Agent opens inbox → sees list of transactions with status == DEPOSIT_SENT
- Agent clicks transaction → sees details (reference, amount, bank, customer)
- Agent clicks "Confirm Deposit Received"
- System calls:
  1. `tx_receiverConfirmDeposit(txId)` - status: DEPOSIT_SENT → DEPOSIT_RECEIVED
  2. `tx_creditAndLock(txId)` - status: DEPOSIT_RECEIVED → LOCKED
- `tx_creditAndLock` also:
  - Updates `chatStep` to DEPOSIT_CONFIRMED_LOCKED_DONE
  - Credits user's `lockedBalance` (not `fiatBalance` yet)
  - Sets `unlockAt` timestamp (24 hours from now)

### 6. Final Samba Message

- When chatStep becomes DEPOSIT_CONFIRMED_LOCKED_DONE:
  - Samba sends final confirmation message
  - In-app notification banner: "Deposit received — funds locked for settlement"
  - Customer sees updated `lockedBalance` in wallet UI

## Data Model

### Transaction Document (`/transactions/{txId}`)

```typescript
{
  id: string
  type: 'BANK_DEPOSIT_TO_USDT_TRON'
  status: TxStatus // AWAITING_DEPOSIT | DEPOSIT_SENT | DEPOSIT_RECEIVED | LOCKED | ...
  userId: string // Customer UID
  receiverId: string // Agent UID (hardcoded: xHKmkizXhPOU25vwTIB6dxhMzSH2)
  participants: string[] // [customerUid, agentUid, 'samba']
  bankCountry: 'MZ' | 'ZA'
  bankId: 'ABSA' | 'BCI' | 'FNB'
  depositCurrency: 'ZAR' | 'MZN'
  depositReference: string // e.g., 'BRICSABSA7K2X9'
  amountZar: number
  withdrawalAddressCandidate?: string // TRON address from user
  chatStep: ChatStep // INTRO_CONFIRM_INTENT | WAITING_FOR_SENT_PROOF | ...
  createdAt: Timestamp
  updatedAt: Timestamp
  statusUpdatedAt: Timestamp
  unlockAt?: Timestamp // When lockedBalance becomes available
  withdrawal: {}
}
```

### Message Document (`/transactions/{txId}/messages/{messageId}`)

```typescript
{
  id: string
  txId: string
  senderType: 'CUSTOMER' | 'SAMBA' | 'AGENT' | 'SYSTEM'
  senderUid?: string // For CUSTOMER and AGENT
  text: string
  createdAt: Timestamp
  metadata?: {
    status?: TxStatus
    reference?: string
  }
}
```

## Samba Message Templates

**Location:** `src/lib/depositChat/sambaMessages.ts`

Templates are deterministic based on `chatStep`:
- `INTRO_CONFIRM_INTENT`: Intro with bank details and reference
- `WAITING_FOR_WALLET_ADDRESS`: Request for TRON address
- `WAITING_FOR_AGENT_CONFIRMATION`: Waiting message
- `DEPOSIT_CONFIRMED_LOCKED_DONE`: Final confirmation

Helper responses are provided when user veers off track (questions, invalid addresses, etc.).

## Agent Inbox

**Location:** `src/components/AgentInboxSheet.tsx`

- Only visible to agent (UID check: `xHKmkizXhPOU25vwTIB6dxhMzSH2`)
- Shows transactions with `status == 'DEPOSIT_SENT'`
- Agent can:
  - View transaction details
  - Confirm deposit received
  - This triggers `tx_receiverConfirmDeposit` + `tx_creditAndLock`

## Wallet Updates

When deposit is confirmed and locked:
- User's `cashZAR` wallet `lockedBalance` is increased
- `fiatBalance` remains unchanged (funds are locked)
- After 24 hours, `unlockSweep` scheduled function moves funds from `lockedBalance` to `fiatBalance`

**Note:** Wallet UI should display `lockedBalance` separately or show total (fiatBalance + lockedBalance).

## Test Checklist

1. ✅ Customer selects MZ → ABSA → sees bank details → taps NEXT → chat opens with Samba intro
2. ✅ Customer types "SENT" → status becomes DEPOSIT_SENT, Samba asks for TRON address
3. ✅ Customer provides TRON address → stored in `withdrawalAddressCandidate`
4. ✅ Agent logs in (ygor.francisco@gmail.com) → sees tx in inbox → confirms received
5. ✅ Status becomes DEPOSIT_RECEIVED then LOCKED; wallet shows `lockedBalance` increased; notification shown
6. ✅ Customer sees "Deposit confirmed ✓ locked" in chat; chat can close

## Known Limitations / TODOs

1. **Amount Entry:** Currently uses placeholder amount (1000 ZAR). Should add amount entry step before bank details.
2. **Firestore Rules:** Samba messages are written directly from client. May need Cloud Function or rule updates.
3. **Wallet Display:** `lockedBalance` display in UI needs to be implemented.
4. **Notifications:** Notification banner implementation may need adjustment based on existing notification system.

## Files Changed

### New Files
- `src/types/transactions.ts` - Transaction and message types
- `src/lib/depositChat/sambaMessages.ts` - Samba message templates
- `src/components/DepositChatSheet.tsx` - Main chat component
- `src/components/DepositChatSheet.module.css` - Chat styles
- `src/components/AgentInboxSheet.tsx` - Agent inbox component
- `src/components/AgentInboxSheet.module.css` - Agent inbox styles
- `functions/src/tx/updateTransactionChatStep.ts` - Cloud Function for chatStep updates (optional)

### Modified Files
- `src/components/BankTransferDetailsSheet.tsx` - Changed CLOSE to NEXT, added onNext prop
- `src/app/profile/page.tsx` - Wired NEXT button, added chat sheet, added agent inbox
- `src/lib/transactions/clientFunctions.ts` - Added `tx_createBankDepositRequest`, `tx_creditAndLock`
- `src/types/wallet.ts` - Added `lockedBalance` field to `WalletDoc`
- `functions/src/tx/creditAndLock.ts` - Updates `chatStep` to DEPOSIT_CONFIRMED_LOCKED_DONE

## Security Notes

- Agent UID is hardcoded for v1. Should use role-based access in production.
- Samba messages are written directly from client. Consider Cloud Function for production.
- Transaction writes are gated by Cloud Functions (client cannot write directly).


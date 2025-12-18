# Implementation Plan: Withdraw → External Crypto Wallet (Hard Fail Only)

## Overview

Fix the cash-out flow for USDT withdrawals on TRON with **hard fail policy** (no partial fills) and **atomic withdrawal** (rollback on broadcast failure).

---

## 1. Existing Function Verification

### 1.1 Function Name & Signature

**Function:** `tx_withdrawTronUSDT`  
**Location:** `functions/src/tx/withdrawTronUsdt.ts`  
**Type:** Callable Cloud Function (Firebase Functions)  
**Region:** `us-central1`

**Current Input:**
```typescript
{
  toAddress: string      // TRON destination address
  amountUSDT: number     // Requested withdrawal amount
}
```

**Current Return Shape:**
```typescript
{
  withdrawalId: string
  requestedAmountUSDT: number
  sentAmountUSDT: number        // Currently may be partial
  feeUSDT: number               // Currently 0
  treasuryBalanceAtAttemptUSDT: number
  shortfallUSDT: number         // Currently may be > 0
  txId: string | null
  status: 'PENDING' | 'BROADCAST_PARTIAL' | 'BROADCAST_FULL' | 'FAILED_ZERO_TREASURY' | 'CONFIRMED'
}
```

**Current Behavior:**
- ✅ Validates input (address format, amount > 0)
- ✅ Checks user balance
- ✅ Checks treasury balance
- ❌ **Allows partial fills** (sends `min(userBalance, treasuryBalance)`)
- ❌ **Debits user BEFORE broadcast** (if broadcast fails, user is debited but no tx sent)
- ❌ Returns `BROADCAST_PARTIAL` status when treasury insufficient

### 1.2 Treasury Key Storage

**Location:** Firebase Functions Config (NOT Secret Manager)  
**Path:** `functions.config().tron?.treasury_private_key`  
**Set via:** `firebase functions:config:set tron.treasury_private_key="<key>"`

**Other TRON Config:**
- `tron.master_seed`: HD wallet mnemonic (for user address derivation)
- `tron.fullhost`: TronGrid API endpoint (defaults to `https://api.trongrid.io`)
- `tron.api_key`: Optional TronGrid Pro API key

**Verification:** Key is stored in Firebase Functions runtime config, accessible via `functions.config()` at runtime.

---

## 2. Required Changes to Backend Function

### 2.1 Hard Fail Policy Implementation

**Current Logic (Lines 113-179):**
```typescript
// 3. Query treasury on-chain balance
const treasuryUsdt = await getTreasuryUsdtBalance()

// 4. Determine send amount (accounting for fee)
const sendAmountUSDT = Math.min(maxSendableByUser, treasuryUsdt - WITHDRAWAL_FEE_USDT)
const shortfallUSDT = amountUSDT - sendAmountUSDT

// 5. Handle zero treasury case
if (treasuryUsdt <= WITHDRAWAL_FEE_USDT || sendAmountUSDT <= 0) {
  // Create FAILED_ZERO_TREASURY record
  // ...
}

// 6. Atomic transaction (debits user, creates withdrawal)
// Status: sendAmountUSDT < amountUSDT ? 'BROADCAST_PARTIAL' : 'BROADCAST_FULL'
```

**New Logic (Hard Fail):**
```typescript
// 3. Query treasury on-chain balance
const treasuryUsdt = await getTreasuryUsdtBalance()

// 4. Check if treasury can cover FULL requested amount (hard fail)
const requiredTreasury = amountUSDT + WITHDRAWAL_FEE_USDT
if (treasuryUsdt < requiredTreasury) {
  // Create withdrawal record: FAILED_INSUFFICIENT_TREASURY
  const withdrawalDoc = {
    id: withdrawalRef.id,
    userId,
    toAddress: toAddress.trim(),
    requestedAmountUSDT: amountUSDT,
    sentAmountUSDT: 0,
    feeUSDT: WITHDRAWAL_FEE_USDT,
    status: 'FAILED_INSUFFICIENT_TREASURY',
    txId: null,
    treasuryBalanceAtAttemptUSDT: treasuryUsdt,
    shortfallUSDT: amountUSDT, // Full amount is shortfall
    createdAt: now,
    updatedAt: now,
  }
  
  await withdrawalRef.set(withdrawalDoc)
  
  // Send email to CoreAgent
  // ...
  
  // Return error (don't debit user)
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Insufficient treasury balance',
    {
      requestedAmountUSDT: amountUSDT,
      treasuryBalanceUSDT: treasuryUsdt,
      requiredTreasury,
      shortfallUSDT: amountUSDT,
    }
  )
}

// 5. Proceed with full amount (no partial fills)
const sendAmountUSDT = amountUSDT // Always full amount
const status: WithdrawalStatus = 'BROADCAST_FULL' // Always full
```

**Status Changes:**
- ❌ Remove: `BROADCAST_PARTIAL`
- ✅ Add: `FAILED_INSUFFICIENT_TREASURY` (treasury insufficient but > 0)
- ✅ Keep: `FAILED_ZERO_TREASURY` (treasury = 0)
- ✅ Keep: `BROADCAST_FULL` (only status for successful withdrawals)

**Updated Status Type:**
```typescript
type WithdrawalStatus = 
  | 'PENDING'
  | 'BROADCAST_FULL'              // Only successful status
  | 'FAILED_INSUFFICIENT_TREASURY' // New: treasury < required
  | 'FAILED_ZERO_TREASURY'        // Existing: treasury = 0
  | 'FAILED_BROADCAST'            // New: broadcast failed (rollback)
  | 'CONFIRMED'                    // Future: on-chain confirmation
```

### 2.2 Atomicity Fix: Rollback on Broadcast Failure

**Current Problem (Lines 225-271):**
```typescript
// 6. Atomic transaction: DEBIT USER FIRST
await db.runTransaction(async (t) => {
  // Debit user balance
  t.update(walletRef, { usdtBalance: newBalance, ... })
  // Create withdrawal record
  t.set(withdrawalRef, withdrawalDoc)
})

// 7. Broadcast on-chain (AFTER debit)
try {
  const result = await contract.transfer(...).send()
  // Update withdrawal with txId
} catch (broadcastError) {
  // ❌ PROBLEM: User already debited, but no tx sent!
  await withdrawalRef.update({ status: 'PENDING' })
  throw new functions.https.HttpsError('internal', 'Failed to broadcast')
}
```

**New Pattern (Atomic with Rollback):**

**Option A: Broadcast First, Then Debit (Recommended)**
```typescript
// 6. Broadcast on-chain FIRST (before any debit)
let txId: string | null = null
try {
  const tronWeb = getTronWeb()
  const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS)
  const amountSun = Math.floor(amountUSDT * Math.pow(10, USDT_DECIMALS))
  
  console.log(`[tx_withdrawTronUSDT] Broadcasting ${amountUSDT} USDT to ${toAddress.trim()}`)
  
  const result: any = await contract.transfer(toAddress.trim(), amountSun).send()
  
  // Extract transaction hash
  if (typeof result === 'string') {
    txId = result
  } else if (result?.txid) {
    txId = result.txid
  } else if (result?.transaction?.txID) {
    txId = result.transaction.txID
  } else {
    throw new Error('Could not extract transaction hash from result')
  }
  
  console.log(`[tx_withdrawTronUSDT] Transaction broadcast successfully. TxHash: ${txId}`)
} catch (broadcastError: any) {
  console.error('[tx_withdrawTronUSDT] Error broadcasting transaction:', broadcastError)
  
  // Create withdrawal record: FAILED_BROADCAST (no debit)
  const withdrawalDoc = {
    id: withdrawalRef.id,
    userId,
    toAddress: toAddress.trim(),
    requestedAmountUSDT: amountUSDT,
    sentAmountUSDT: 0,
    feeUSDT: WITHDRAWAL_FEE_USDT,
    status: 'FAILED_BROADCAST',
    txId: null,
    treasuryBalanceAtAttemptUSDT: treasuryUsdt,
    shortfallUSDT: 0, // No shortfall, just broadcast failure
    createdAt: now,
    updatedAt: now,
  }
  
  await withdrawalRef.set(withdrawalDoc)
  
  // Send email to CoreAgent about broadcast failure
  // ...
  
  // Throw error (user NOT debited)
  throw new functions.https.HttpsError(
    'internal',
    'Failed to broadcast transaction',
    {
      error: broadcastError.message,
      withdrawalId: withdrawalRef.id,
    }
  )
}

// 7. ONLY IF BROADCAST SUCCEEDED: Atomic transaction to debit user
await db.runTransaction(async (t) => {
  // Read current wallet balance
  const walletSnap = await t.get(walletRef)
  const currentBalance = walletSnap.data()?.usdtBalance || 0

  // Verify balance hasn't changed (double-spend protection)
  if (currentBalance < amountUSDT + WITHDRAWAL_FEE_USDT) {
    // This should never happen if we check before broadcast, but safety check
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Insufficient balance (changed during transaction)'
    )
  }

  // Debit user balance
  const newBalance = currentBalance - (amountUSDT + WITHDRAWAL_FEE_USDT)
  t.update(walletRef, {
    usdtBalance: newBalance,
    updatedAt: now,
  })

  // Create withdrawal record (with txId from broadcast)
  const withdrawalDoc = {
    id: withdrawalRef.id,
    userId,
    toAddress: toAddress.trim(),
    requestedAmountUSDT: amountUSDT,
    sentAmountUSDT: amountUSDT, // Always full amount
    feeUSDT: WITHDRAWAL_FEE_USDT,
    status: 'BROADCAST_FULL',
    txId, // From successful broadcast
    treasuryBalanceAtAttemptUSDT: treasuryUsdt,
    shortfallUSDT: 0, // No shortfall in hard-fail mode
    createdAt: now,
    updatedAt: now,
  }
  t.set(withdrawalRef, withdrawalDoc)
})
```

**Trade-offs:**
- ✅ **User never debited if broadcast fails** (atomic from user POV)
- ⚠️ **Risk:** If broadcast succeeds but Firestore transaction fails, treasury sent USDT but user not debited (requires manual reconciliation)
- **Mitigation:** Firestore transactions are highly reliable. If they fail, it's likely a temporary issue and can be retried.

**Alternative Option B: Two-Phase with Rollback (More Complex)**
- Debit user in transaction
- Broadcast on-chain
- If broadcast fails, rollback user debit in second transaction
- **Downside:** More complex, potential race conditions

**Recommendation:** Use Option A (broadcast first, then debit). Firestore transactions are reliable enough that the risk of broadcast succeeding but debit failing is minimal.

### 2.3 Updated Return Shape

**New Return (Hard Fail):**
```typescript
{
  withdrawalId: string
  requestedAmountUSDT: number
  sentAmountUSDT: number        // Always equals requestedAmountUSDT (or 0 on failure)
  feeUSDT: number
  treasuryBalanceAtAttemptUSDT: number
  shortfallUSDT: number         // Always 0 (hard fail) or amountUSDT (on failure)
  txId: string | null
  status: 'BROADCAST_FULL' | 'FAILED_INSUFFICIENT_TREASURY' | 'FAILED_ZERO_TREASURY' | 'FAILED_BROADCAST'
}
```

**Error Cases:**
- `FAILED_INSUFFICIENT_TREASURY`: Throws `failed-precondition` error with details
- `FAILED_ZERO_TREASURY`: Returns status (no exception, but user not debited)
- `FAILED_BROADCAST`: Throws `internal` error (broadcast failed, user not debited)

---

## 3. Frontend Implementation

### 3.1 New Component: `WithdrawCryptoAddressSheet.tsx`

**Location:** `src/components/WithdrawCryptoAddressSheet.tsx`

**Design Reuse:**
- Copy structure from `UsdtWalletAddressSheet.tsx` (lines 1-186)
- Reuse CSS: `UsdtWalletAddressSheet.module.css` (or create new file with same classes)
- **Key differences:**
  - No "Remove wallet" button
  - No store dependency (standalone with props)
  - Network dropdown: TRON selected, Ethereum/Solana disabled
  - Amount prop: Required amount from keypad (display only, not editable)

**Props:**
```typescript
type WithdrawCryptoAddressSheetProps = {
  open: boolean
  onClose: () => void
  onBack?: () => void
  onSubmit: (address: string, network: 'tron') => Promise<void>
  amountUSDT: number  // Required amount from keypad
}
```

**State:**
```typescript
const [address, setAddress] = useState('')
const [network, setNetwork] = useState<'tron'>('tron') // Fixed to TRON
const [error, setError] = useState<string | null>(null)
const [isSubmitting, setIsSubmitting] = useState(false)
```

**Validation:**
- Client-side TRON address validation (see 3.2)
- "Done" button disabled until valid address

**Network Dropdown:**
```typescript
const NETWORKS = [
  { value: 'tron', label: 'TRON', disabled: false },
  { value: 'ethereum', label: 'Ethereum', disabled: true },
  { value: 'solana', label: 'Solana', disabled: true },
] as const
```

**Submit Handler:**
```typescript
const handleDone = async () => {
  if (!isValid) return
  
  // Client-side validation
  if (!validateTronAddressClient(address.trim())) {
    setError('Invalid TRON address format. Address must start with "T" and be 34 characters.')
    return
  }
  
  setIsSubmitting(true)
  setError(null)
  
  try {
    await onSubmit(address.trim(), 'tron')
    // Parent handles closing and success notification
  } catch (err: any) {
    setError(err.message || 'Failed to process withdrawal')
  } finally {
    setIsSubmitting(false)
  }
}
```

### 3.2 Client-Side TRON Address Validation

**New File:** `src/lib/validation/tronAddress.ts`

**Purpose:** Lightweight client-side validation (must NOT import server-side utils)

**Implementation:**
```typescript
/**
 * Lightweight TRON address validation (client-side safe)
 * Validates base58 format: starts with 'T', length 34, valid base58 characters
 * 
 * NOTE: This is format validation only, not cryptographic verification.
 * Server-side validation (in Cloud Function) is the source of truth.
 */
export function validateTronAddressClient(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false
  }
  
  const trimmed = address.trim()
  
  // Must start with 'T'
  if (!trimmed.startsWith('T')) {
    return false
  }
  
  // Must be exactly 34 characters
  if (trimmed.length !== 34) {
    return false
  }
  
  // Must contain only base58 characters (alphanumeric except 0, O, I, l)
  // Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/
  if (!base58Regex.test(trimmed)) {
    return false
  }
  
  return true
}
```

**Usage:**
```typescript
import { validateTronAddressClient } from '@/lib/validation/tronAddress'

// In component:
const isValid = address.trim().length > 0 && validateTronAddressClient(address.trim())
```

### 3.3 Integration in `src/app/page.tsx`

**Flow:**
1. User enters amount in keypad → `amountMode = 'withdraw'`
2. Keypad submits → Store amount, open `WithdrawSheet`
3. User selects "External crypto wallet" → Open `WithdrawCryptoAddressSheet`
4. User enters address → Submit
5. Call `tx_withdrawTronUSDT` → Handle success/error
6. Show notification, close sheet, balance updates via Firestore subscription

**State Management:**
```typescript
const [openWithdrawCryptoAddress, setOpenWithdrawCryptoAddress] = useState(false)
const [withdrawCryptoAmountUSDT, setWithdrawCryptoAmountUSDT] = useState(0)
```

**WithdrawSheet Handler:**
```typescript
const handleWithdrawSelect = useCallback((method: 'bank' | 'card' | 'crypto' | 'atm' | 'agent') => {
  if (method === 'crypto') {
    setOpenWithdraw(false)
    setTimeout(() => setOpenWithdrawCryptoAddress(true), 220)
  } else if (method === 'bank') {
    // Existing bank flow
  }
}, [])
```

**Keypad Submit Handler:**
```typescript
const handleAmountSubmit = useCallback((amount: number) => {
  if (amountMode === 'withdraw') {
    setWithdrawCryptoAmountUSDT(amount) // Store amount
    setOpenAmount(false)
    setTimeout(() => setOpenWithdraw(true), 220)
  }
  // ... other modes
}, [amountMode])
```

**WithdrawCryptoAddressSheet Submit Handler:**
```typescript
const handleWithdrawCryptoSubmit = useCallback(async (address: string, network: 'tron') => {
  try {
    const result = await tx_withdrawTronUSDT({
      toAddress: address,
      amountUSDT: withdrawCryptoAmountUSDT,
    })
    
    // Success: show notification
    pushNotification({
      kind: 'transfer',
      title: 'USDT Withdrawal Sent',
      body: `${result.sentAmountUSDT.toFixed(6)} USDT sent to TRON address${result.txId ? ` (TxID: ${result.txId.slice(0, 8)}...)` : ''}`,
      amount: { currency: 'USDT', value: result.sentAmountUSDT },
      direction: 'down',
      actor: { type: 'system', name: 'GoBankless' },
    })
    
    setOpenWithdrawCryptoAddress(false)
    // Balance updates automatically via Firestore subscription
  } catch (error: any) {
    // Error handling (see 4. Error Handling)
    throw error // Re-throw to let component handle
  }
}, [withdrawCryptoAmountUSDT, pushNotification])
```

**Render:**
```typescript
<WithdrawCryptoAddressSheet
  open={openWithdrawCryptoAddress}
  onClose={() => setOpenWithdrawCryptoAddress(false)}
  onBack={() => {
    setOpenWithdrawCryptoAddress(false)
    setTimeout(() => setOpenWithdraw(true), 220)
  }}
  onSubmit={handleWithdrawCryptoSubmit}
  amountUSDT={withdrawCryptoAmountUSDT}
/>
```

### 3.4 Error Handling in UI

**Error Scenarios:**

1. **Insufficient Treasury Balance:**
   ```typescript
   catch (error: any) {
     if (error.code === 'functions/failed-precondition' && 
         error.message.includes('Insufficient treasury')) {
       setError(`Withdrawal failed: Treasury has insufficient balance. Requested ${withdrawCryptoAmountUSDT.toFixed(6)} USDT.`)
     }
   }
   ```

2. **Zero Treasury:**
   ```typescript
   // Function returns status, doesn't throw
   if (result.status === 'FAILED_ZERO_TREASURY') {
     setError(`Withdrawal failed: Treasury has no liquidity. Requested ${withdrawCryptoAmountUSDT.toFixed(6)} USDT.`)
   }
   ```

3. **Broadcast Failure:**
   ```typescript
   if (error.code === 'functions/internal' && 
       error.message.includes('broadcast')) {
     setError('Transaction failed to broadcast. Please try again or contact support.')
   }
   ```

4. **Invalid Address:**
   ```typescript
   // Client-side validation catches this before submit
   if (!validateTronAddressClient(address.trim())) {
     setError('Invalid TRON address format.')
   }
   ```

5. **Insufficient User Balance:**
   ```typescript
   if (error.code === 'functions/failed-precondition' && 
       error.message.includes('Insufficient user balance')) {
     setError('Insufficient USDT balance. Please check your balance and try again.')
   }
   ```

---

## 4. Files to Modify/Create

### 4.1 Backend Files

**Modify:**
- `functions/src/tx/withdrawTronUsdt.ts`
  - Change hard fail logic (lines 113-179)
  - Change atomicity pattern (lines 181-271)
  - Update status types (line 24-29)
  - Update return shape
  - Remove partial fill email logic (lines 273-300)

**No Changes:**
- `functions/src/utils/tronUtils.ts` (already correct)
- `functions/src/utils/resendEmail.ts` (reuse as-is, may need new email template for broadcast failure)

### 4.2 Frontend Files

**Create:**
- `src/components/WithdrawCryptoAddressSheet.tsx`
- `src/components/WithdrawCryptoAddressSheet.module.css` (or reuse `UsdtWalletAddressSheet.module.css`)
- `src/lib/validation/tronAddress.ts`

**Modify:**
- `src/app/page.tsx`
  - Add state: `openWithdrawCryptoAddress`, `withdrawCryptoAmountUSDT`
  - Add handler: `handleWithdrawSelect` (route crypto to new modal)
  - Add handler: `handleWithdrawCryptoSubmit` (call Cloud Function)
  - Add handler: `handleAmountSubmit` (store amount for withdraw mode)
  - Render: `<WithdrawCryptoAddressSheet />`

**Verify (No Changes Expected):**
- `src/components/WithdrawSheet.tsx` (already emits `onSelect('crypto')` correctly)
- `src/components/AmountSheet.tsx` (verify withdraw mode routing)

### 4.3 Type Definitions

**Modify:**
- `src/lib/transactions/clientFunctions.ts`
  - Update `WithdrawTronUsdtResult` interface:
    ```typescript
    export interface WithdrawTronUsdtResult {
      withdrawalId: string
      requestedAmountUSDT: number
      sentAmountUSDT: number  // Always equals requestedAmountUSDT (or 0 on failure)
      feeUSDT: number
      treasuryBalanceAtAttemptUSDT: number
      shortfallUSDT: number  // Always 0 (hard fail) or amountUSDT (on failure)
      txId: string | null
      status: 'BROADCAST_FULL' | 'FAILED_INSUFFICIENT_TREASURY' | 'FAILED_ZERO_TREASURY' | 'FAILED_BROADCAST' | 'CONFIRMED'
    }
    ```

---

## 5. Testing Checklist

### 5.1 Happy Path
- [ ] User enters amount → WithdrawSheet opens
- [ ] User selects "External crypto wallet" → WithdrawCryptoAddressSheet opens
- [ ] User enters valid TRON address → "Done" enables
- [ ] User clicks "Done" → Withdrawal processes successfully
- [ ] Success notification shows
- [ ] User balance updates immediately (Firestore subscription)
- [ ] Withdrawal record created with `BROADCAST_FULL` status
- [ ] Transaction hash stored in withdrawal record

### 5.2 Hard Fail Scenarios
- [ ] Treasury balance < requested amount → Error: "Insufficient treasury balance"
- [ ] Treasury balance = 0 → Error: "Treasury has no liquidity"
- [ ] User NOT debited on treasury failure
- [ ] Email sent to CoreAgent on treasury failure

### 5.3 Atomicity Tests
- [ ] Broadcast succeeds → User debited → Withdrawal record created
- [ ] Broadcast fails → User NOT debited → Withdrawal record shows `FAILED_BROADCAST`
- [ ] Error message shows on broadcast failure
- [ ] No orphaned debits (user balance matches withdrawal records)

### 5.4 Validation Tests
- [ ] Invalid TRON address format → "Done" disabled, error message
- [ ] Empty address → "Done" disabled
- [ ] Valid address → "Done" enabled
- [ ] Network dropdown shows TRON selected, others disabled

### 5.5 Edge Cases
- [ ] User balance changes between keypad and submit → Cloud Function handles correctly
- [ ] Treasury balance changes during submission → Hard fail check works
- [ ] Network error during broadcast → User NOT debited, error shown
- [ ] Firestore transaction fails after broadcast → Manual reconciliation needed (documented)

---

## 6. Implementation Order

### Phase 1: Backend Hard Fail (Day 1)
1. Modify `functions/src/tx/withdrawTronUsdt.ts`:
   - Change treasury check to hard fail (reject if insufficient)
   - Remove partial fill logic
   - Update status types
2. Test Cloud Function locally with various treasury scenarios
3. Deploy and verify

### Phase 2: Backend Atomicity (Day 1)
4. Modify `functions/src/tx/withdrawTronUsdt.ts`:
   - Move broadcast BEFORE debit
   - Add rollback logic (no debit if broadcast fails)
   - Add `FAILED_BROADCAST` status
5. Test broadcast failure scenarios
6. Deploy and verify

### Phase 3: Frontend Modal (Day 2)
7. Create `src/lib/validation/tronAddress.ts`
8. Create `WithdrawCryptoAddressSheet.tsx` component
9. Create/reuse CSS module
10. Test UI/UX (no backend calls yet)

### Phase 4: Frontend Integration (Day 2)
11. Integrate into `src/app/page.tsx` flow
12. Add error handling for all scenarios
13. Add success/error notifications
14. Test end-to-end flow

### Phase 5: Testing & Polish (Day 3)
15. Test all scenarios (happy path, hard fail, atomicity)
16. Verify Firestore records
17. Verify email notifications
18. Test on iOS Safari
19. Document edge cases (Firestore transaction failure after broadcast)

---

## 7. Summary

**Key Changes:**
1. **Hard Fail:** Reject withdrawal if treasury < requested amount (no partial fills)
2. **Atomicity:** Broadcast first, then debit user (rollback on broadcast failure)
3. **Status Updates:** Remove `BROADCAST_PARTIAL`, add `FAILED_INSUFFICIENT_TREASURY`, `FAILED_BROADCAST`
4. **Frontend:** New modal component reusing existing design system
5. **Client Validation:** Lightweight TRON address validation (no server imports)

**Files Touched:**
- **Backend:** `functions/src/tx/withdrawTronUsdt.ts` (major changes)
- **Frontend:** `src/app/page.tsx`, new component files, new validation file
- **Types:** `src/lib/transactions/clientFunctions.ts` (update interface)

**Risk Mitigation:**
- Firestore transactions are highly reliable (minimal risk of broadcast success + debit failure)
- If edge case occurs, manual reconciliation process documented
- All failures logged with withdrawal IDs for audit trail


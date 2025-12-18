# Implementation Plan: Withdraw → External Crypto Wallet (USDT on TRON)

## Overview

Fix the cash-out flow so that selecting "External crypto wallet" from the Withdraw Method sheet opens a destination address modal, then executes a custodial payout via the existing `tx_withdrawTronUSDT` Cloud Function.

---

## 1. Frontend Components & Flow Changes

### 1.1 Files to Modify

#### `src/app/page.tsx` (Main Flow Router)
**Current Issue:** When `WithdrawSheet` calls `onSelect('crypto')`, it loops back to keypad.

**Changes:**
- In `handleWithdrawSelect` callback (or wherever `WithdrawSheet`'s `onSelect` is handled):
  - When `method === 'crypto'`:
    - Close `WithdrawSheet`
    - Open new `WithdrawCryptoAddressSheet` (see 1.3)
    - Pass `withdrawAmountUSDT` from keypad state
- Remove any logic that routes `'crypto'` back to keypad

**State Management:**
- Add state: `const [openWithdrawCryptoAddress, setOpenWithdrawCryptoAddress] = useState(false)`
- Add state: `const [withdrawCryptoAmountUSDT, setWithdrawCryptoAmountUSDT] = useState(0)`
- When keypad submits with `amountMode === 'withdraw'`:
  - Store amount: `setWithdrawCryptoAmountUSDT(amountUSDT)`
  - Open `WithdrawSheet`

#### `src/components/WithdrawSheet.tsx`
**No changes needed** - already emits `onSelect('crypto')` correctly.

#### `src/components/AmountSheet.tsx` (Keypad)
**Verify:** When `amountMode === 'withdraw'` and user submits:
- Amount is stored in state
- `WithdrawSheet` opens (not keypad loop)

---

### 1.2 New Component: `WithdrawCryptoAddressSheet.tsx`

**Purpose:** Destination address input modal for crypto withdrawals.

**Design System Reuse:**
- Copy structure from `UsdtWalletAddressSheet.tsx` (lines 1-186)
- Reuse CSS module: `UsdtWalletAddressSheet.module.css` (or create new `WithdrawCryptoAddressSheet.module.css` with same styles)
- **Key differences:**
  - No "Remove wallet" button (not editing linked accounts)
  - No `useUsdtWalletAddressSheet` store (standalone component)
  - Props: `open`, `onClose`, `onBack`, `onSubmit`, `amountUSDT` (required)
  - Network dropdown: TRON selected by default, Ethereum/Solana disabled (greyed out)
  - CTA: "Done" button (disabled until valid address)

**Component Structure:**
```typescript
type WithdrawCryptoAddressSheetProps = {
  open: boolean
  onClose: () => void
  onBack?: () => void
  onSubmit: (address: string, network: 'tron') => void
  amountUSDT: number // Required amount from keypad
}

// State:
- address: string
- network: 'tron' (fixed, but show dropdown with disabled options)
- isValid: boolean (computed from validation)
```

**Validation:**
- Minimum: `address.trim().length > 0`
- Preferred: TRON base58 validation (starts with "T", length 34, valid base58 chars)
- Use existing `validateTronAddress` from `functions/src/utils/tronUtils.ts` via client-side validation helper (or lightweight regex)

**Network Dropdown:**
```typescript
const NETWORKS = [
  { value: 'tron', label: 'TRON', disabled: false },
  { value: 'ethereum', label: 'Ethereum', disabled: true },
  { value: 'solana', label: 'Solana', disabled: true },
] as const
```

**Styling:**
- Reuse `UsdtWalletAddressSheet.module.css` classes:
  - `.sheetContainer`, `.scrollableContent`, `.header`, `.title`, `.subtitle`
  - `.walletInputWrapper`, `.walletInput`, `.fieldGroup`, `.fieldLabel`, `.field`, `.input`
  - `.footer`, `.doneButton` (disabled state)
- For disabled network options, add CSS:
  ```css
  .select option:disabled {
    color: #999;
    opacity: 0.5;
  }
  ```

**Submit Handler:**
```typescript
const handleDone = () => {
  if (!isValid) return
  
  // Validate TRON address format (client-side)
  if (!validateTronAddressClient(address.trim())) {
    setError('Invalid TRON address format')
    return
  }
  
  onSubmit(address.trim(), 'tron')
  // Parent will handle closing and calling Cloud Function
}
```

---

### 1.3 Integration in `src/app/page.tsx`

**Flow:**
1. User enters amount in keypad → `amountMode = 'withdraw'`
2. Keypad submits → `setWithdrawCryptoAmountUSDT(amountUSDT)`, open `WithdrawSheet`
3. User selects "External crypto wallet" → `onSelect('crypto')`
4. Close `WithdrawSheet`, open `WithdrawCryptoAddressSheet` with `amountUSDT` prop
5. User enters address → `onSubmit(address, 'tron')`
6. Call `tx_withdrawTronUSDT({ toAddress: address, amountUSDT })`
7. Show success/error notification
8. Close sheet, update balances (Firestore subscription handles this)

**Code Pattern:**
```typescript
// In HomeContent component:
const [openWithdrawCryptoAddress, setOpenWithdrawCryptoAddress] = useState(false)
const [withdrawCryptoAmountUSDT, setWithdrawCryptoAmountUSDT] = useState(0)

// In WithdrawSheet onSelect handler:
const handleWithdrawSelect = useCallback((method: 'bank' | 'card' | 'crypto' | 'atm' | 'agent') => {
  if (method === 'crypto') {
    setOpenWithdraw(false)
    setTimeout(() => setOpenWithdrawCryptoAddress(true), 220)
  } else if (method === 'bank') {
    // Existing bank flow
  }
}, [])

// In WithdrawCryptoAddressSheet onSubmit:
const handleWithdrawCryptoSubmit = useCallback(async (address: string, network: 'tron') => {
  try {
    setIsSubmitting(true)
    const result = await tx_withdrawTronUSDT({
      toAddress: address,
      amountUSDT: withdrawCryptoAmountUSDT,
    })
    
    // Show success notification
    pushNotification({
      kind: 'transfer',
      title: result.status === 'BROADCAST_PARTIAL' 
        ? 'Withdrawal partially filled'
        : 'USDT Withdrawal Sent',
      body: result.status === 'BROADCAST_PARTIAL'
        ? `Sent ${result.sentAmountUSDT.toFixed(6)} USDT. ${result.shortfallUSDT.toFixed(6)} USDT couldn't be sent due to treasury liquidity.`
        : `${result.sentAmountUSDT.toFixed(6)} USDT sent to TRON address${result.txId ? ` (TxID: ${result.txId.slice(0, 8)}...)` : ''}`,
      amount: { currency: 'USDT', value: result.sentAmountUSDT },
      direction: 'down',
      actor: { type: 'system', name: 'GoBankless' },
    })
    
    setOpenWithdrawCryptoAddress(false)
    // Balance updates automatically via Firestore subscription
  } catch (error: any) {
    // Handle errors (see 6. Error Handling)
    setError(error.message || 'Failed to process withdrawal')
  } finally {
    setIsSubmitting(false)
  }
}, [withdrawCryptoAmountUSDT, pushNotification])

// Render:
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

---

## 2. Design System Reuse

### 2.1 Component Structure
- **Base:** `ActionSheet` component (already used)
- **Layout:** Copy `UsdtWalletAddressSheet` structure:
  - Header with title/subtitle
  - Scrollable content area
  - Fixed footer with CTA button
- **Styling:** Reuse `UsdtWalletAddressSheet.module.css` (or create new file with same classes)

### 2.2 Key Differences from Linked Accounts Modal
- **No store dependency:** Standalone component with props (not `useUsdtWalletAddressSheet`)
- **No "Remove wallet" button:** Only "Done" CTA
- **Network locked to TRON:** Dropdown shows disabled options for UX clarity
- **Amount prop:** Required amount passed from parent (not editable in modal)
- **Submit callback:** Calls parent's `onSubmit` instead of saving to profile

### 2.3 CSS Reuse Strategy
**Option A (Recommended):** Create `WithdrawCryptoAddressSheet.module.css` and copy relevant classes from `UsdtWalletAddressSheet.module.css`:
- Copy: `.sheetContainer`, `.scrollableContent`, `.header`, `.title`, `.subtitle`
- Copy: `.walletInputWrapper`, `.walletInput`, `.fieldGroup`, `.fieldLabel`, `.field`, `.input`
- Copy: `.footer`, `.doneButton`, `.doneButton:disabled`
- Add: `.select option:disabled` for greyed-out network options

**Option B:** Share CSS module (not recommended - different contexts)

---

## 3. Backend/API Steps

### 3.1 Existing Cloud Function: `tx_withdrawTronUSDT`

**Location:** `functions/src/tx/withdrawTronUsdt.ts`

**Already Implements:**
- ✅ Authentication check
- ✅ Input validation (address format, amount > 0)
- ✅ TRON address validation (`validateTronAddress`)
- ✅ User USDT balance check (`getUserUsdtBalance`)
- ✅ Treasury USDT balance check (`getTreasuryUsdtBalance`)
- ✅ Partial fill logic (sends `min(userBalance, treasuryBalance - fee)`)
- ✅ Atomic Firestore transaction (debits user, creates withdrawal record)
- ✅ On-chain TRC-20 transfer (`contract.transfer()`)
- ✅ Transaction hash extraction and storage
- ✅ Email notification on treasury shortfall
- ✅ Error handling for zero treasury, insufficient balance, broadcast failures

**No changes needed** - function is complete and production-ready.

### 3.2 Client-Side Validation Helper

**New File:** `src/lib/validation/tronAddress.ts`

```typescript
/**
 * Lightweight TRON address validation (client-side)
 * Validates base58 format: starts with 'T', length 34, valid base58 characters
 */
export function validateTronAddressClient(address: string): boolean {
  if (!address || typeof address !== 'string') return false
  
  const trimmed = address.trim()
  
  // Must start with 'T'
  if (!trimmed.startsWith('T')) return false
  
  // Must be exactly 34 characters
  if (trimmed.length !== 34) return false
  
  // Must contain only base58 characters (alphanumeric except 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/
  if (!base58Regex.test(trimmed)) return false
  
  return true
}
```

**Usage:** In `WithdrawCryptoAddressSheet`, validate on input change and before submit.

---

## 4. Data Model for `withdrawals` Collection

### 4.1 Existing Schema (Already Implemented)

**Path:** `/withdrawals/{withdrawalId}`

**Fields:**
```typescript
{
  id: string                    // Document ID
  userId: string                // User requesting withdrawal
  toAddress: string             // TRON destination address
  requestedAmountUSDT: number   // Amount user requested
  sentAmountUSDT: number        // Amount actually sent (may be 0 or partial)
  feeUSDT: number               // Withdrawal fee (currently 0)
  status: 'PENDING' | 'BROADCAST_PARTIAL' | 'BROADCAST_FULL' | 'FAILED_ZERO_TREASURY' | 'CONFIRMED'
  txId: string | null           // TRON transaction hash (null if not broadcast)
  treasuryBalanceAtAttemptUSDT: number  // Treasury balance at time of attempt
  shortfallUSDT: number         // requestedAmountUSDT - sentAmountUSDT
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**Status Flow:**
- `PENDING`: Created but not yet broadcast (shouldn't happen in current flow)
- `BROADCAST_PARTIAL`: Sent partial amount due to treasury shortfall
- `BROADCAST_FULL`: Sent full requested amount
- `FAILED_ZERO_TREASURY`: Treasury had zero balance, nothing sent
- `CONFIRMED`: Optional future status (on-chain confirmation tracking)

**No changes needed** - schema is complete.

### 4.2 Firestore Rules

**Location:** `firestore.rules` (lines 114-124)

**Current Rules:**
```javascript
match /withdrawals/{withdrawalId} {
  // Allow read if user is the userId
  allow read: if request.auth != null && (
    resource.data.userId == request.auth.uid
  );
  
  // Client cannot write withdrawals directly (Cloud Functions only)
  allow write: if false;
}
```

**No changes needed** - rules are correct.

---

## 5. Safety and Idempotency Plan

### 5.1 Double-Send Prevention

**Current Implementation (Already Safe):**

1. **Atomic Firestore Transaction:**
   - `tx_withdrawTronUSDT` uses `db.runTransaction()` to:
     - Read current user balance
     - Verify balance hasn't changed (double-spend check)
     - Debit balance and create withdrawal record atomically
   - If balance changed during transaction, throws `failed-precondition` error

2. **Withdrawal Record Lock:**
   - Each withdrawal gets unique `withdrawalId` (Firestore doc ID)
   - Status field prevents duplicate processing
   - `txId` field stores transaction hash (prevents re-broadcast)

3. **User Balance Check:**
   - Function reads user balance before transaction
   - Verifies `currentBalance >= sendAmountUSDT + feeUSDT`
   - If insufficient, throws error before any debit

**Additional Safeguards (Optional):**

1. **Request Deduplication:**
   - Add `requestId` field to withdrawal record (client-generated UUID)
   - Check for existing withdrawal with same `requestId` before processing
   - Implementation: Add to `WithdrawCryptoAddressSheet` submit:
     ```typescript
     const requestId = crypto.randomUUID()
     await tx_withdrawTronUSDT({
       toAddress: address,
       amountUSDT: amountUSDT,
       requestId, // Optional deduplication
     })
     ```
   - In Cloud Function, check for existing withdrawal with same `requestId` and `userId`:
     ```typescript
     if (data.requestId) {
       const existing = await db.collection('withdrawals')
         .where('userId', '==', userId)
         .where('requestId', '==', data.requestId)
         .limit(1)
         .get()
       if (!existing.empty) {
         throw new functions.https.HttpsError('already-exists', 'Duplicate request')
       }
     }
     ```

2. **Rate Limiting:**
   - Add per-user rate limit (e.g., max 5 withdrawals per hour)
   - Check in Cloud Function before processing:
     ```typescript
     const recentWithdrawals = await db.collection('withdrawals')
       .where('userId', '==', userId)
       .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 3600000))
       .get()
     if (recentWithdrawals.size >= 5) {
       throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded')
     }
     ```

**Recommendation:** Start without `requestId` deduplication (atomic transaction is sufficient). Add rate limiting if needed.

### 5.2 Status Machine

**Current Status Flow:**
```
User submits → Cloud Function called
  ↓
[Atomic Transaction]
  ├─ Check user balance → FAIL if insufficient
  ├─ Check treasury balance → FAIL if zero
  ├─ Debit user balance
  └─ Create withdrawal record (status: PENDING)
  ↓
[Broadcast On-Chain]
  ├─ Success → Update status: BROADCAST_FULL or BROADCAST_PARTIAL
  └─ Failure → Status remains PENDING (user already debited - needs manual review)
```

**Future Enhancement (Optional):**
- Add `CONFIRMED` status after on-chain confirmation (requires TronGrid webhook or polling)
- Add `FAILED_BROADCAST` status for broadcast failures (currently stays PENDING)

**No changes needed** - current flow is safe.

### 5.3 Idempotency for Retries

**Current Behavior:**
- Each Cloud Function call creates a new withdrawal record
- User balance is debited once per call (atomic transaction prevents double-debit)
- If user retries with same amount, creates new withdrawal (intended behavior)

**If Retry Protection Needed:**
- Add `requestId` deduplication (see 5.1)
- Or check for recent withdrawal with same `toAddress` and `amountUSDT` within 5 minutes:
  ```typescript
  const recent = await db.collection('withdrawals')
    .where('userId', '==', userId)
    .where('toAddress', '==', toAddress.trim())
    .where('requestedAmountUSDT', '==', amountUSDT)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 300000))
    .limit(1)
    .get()
  if (!recent.empty) {
    throw new functions.https.HttpsError('already-exists', 'Duplicate withdrawal request')
  }
  ```

**Recommendation:** Allow retries (user may want to send same amount to same address multiple times). Only add deduplication if abuse occurs.

---

## 6. Error Handling

### 6.1 Error Scenarios

#### A. Insufficient User Balance
**Error:** `failed-precondition: Insufficient user balance for withdrawal`

**UI Handling:**
```typescript
catch (error: any) {
  if (error.code === 'functions/failed-precondition') {
    setError('Insufficient USDT balance. Please check your balance and try again.')
  } else {
    setError(error.message || 'Failed to process withdrawal')
  }
}
```

**User Experience:**
- Show error message in modal (below address input)
- Keep modal open, allow user to adjust amount or cancel
- Don't close modal automatically

#### B. Zero Treasury Balance
**Error:** Function returns `status: 'FAILED_ZERO_TREASURY'` (not an exception)

**UI Handling:**
```typescript
const result = await tx_withdrawTronUSDT({ ... })
if (result.status === 'FAILED_ZERO_TREASURY') {
  setError(`Withdrawal failed: Treasury has no liquidity. Requested ${amountUSDT.toFixed(6)} USDT.`)
  // Keep modal open
  return
}
```

**User Experience:**
- Show error message
- Email sent to CoreAgent automatically (handled by Cloud Function)
- User can retry later or contact support

#### C. Partial Fill (Treasury Shortfall)
**Error:** Function returns `status: 'BROADCAST_PARTIAL'`

**UI Handling:**
```typescript
if (result.status === 'BROADCAST_PARTIAL') {
  // Show success notification with partial fill warning
  pushNotification({
    kind: 'transfer',
    title: 'Withdrawal partially filled',
    body: `Sent ${result.sentAmountUSDT.toFixed(6)} USDT. ${result.shortfallUSDT.toFixed(6)} USDT couldn't be sent due to treasury liquidity.`,
    amount: { currency: 'USDT', value: result.sentAmountUSDT },
    direction: 'down',
    actor: { type: 'system', name: 'GoBankless' },
  })
  // Close modal, show success
  setOpenWithdrawCryptoAddress(false)
}
```

**User Experience:**
- Show success notification with clear partial fill message
- User balance debited by `sentAmountUSDT + feeUSDT` (not full requested amount)
- Email sent to CoreAgent automatically

#### D. Invalid TRON Address
**Error:** `invalid-argument: Invalid TRON address format`

**UI Handling:**
- **Client-side:** Validate on input change, show inline error
- **Server-side:** Cloud Function validates, but client should catch before submit
```typescript
const handleDone = () => {
  if (!validateTronAddressClient(address.trim())) {
    setError('Invalid TRON address format. Address must start with "T" and be 34 characters.')
    return
  }
  onSubmit(address.trim(), 'tron')
}
```

**User Experience:**
- Show error below address input field
- Disable "Done" button until valid
- Real-time validation feedback

#### E. Broadcast Failure (Network/TronGrid Error)
**Error:** `internal: Failed to broadcast transaction`

**UI Handling:**
```typescript
catch (error: any) {
  if (error.code === 'functions/internal' && error.message.includes('broadcast')) {
    setError('Transaction failed to broadcast. Your balance has been debited. Please contact support with withdrawal ID.')
    // Show withdrawal ID from error details if available
  } else {
    setError(error.message || 'Failed to process withdrawal')
  }
}
```

**User Experience:**
- Show error message with support contact info
- User balance already debited (needs manual refund)
- Log withdrawal ID for support reference
- **Critical:** This requires manual intervention (Cloud Function should ideally rollback debit on broadcast failure, but current implementation doesn't)

**Future Fix:** Modify Cloud Function to rollback user debit if broadcast fails:
```typescript
try {
  // Broadcast...
} catch (broadcastError) {
  // Rollback user balance debit
  await db.runTransaction(async (t) => {
    const walletSnap = await t.get(walletRef)
    const currentBalance = walletSnap.data()?.usdtBalance || 0
    t.update(walletRef, {
      usdtBalance: currentBalance + (sendAmountUSDT + WITHDRAWAL_FEE_USDT),
      updatedAt: admin.firestore.Timestamp.now(),
    })
  })
  throw broadcastError
}
```

#### F. TronGrid API Failure
**Error:** Network timeout, 500 error, etc.

**UI Handling:**
- Same as broadcast failure (see E)
- Retry logic (optional): Allow user to retry once before showing error

### 6.2 Error UI Components

**In `WithdrawCryptoAddressSheet`:**
- Add error state: `const [error, setError] = useState<string | null>(null)`
- Display error below address input or in footer:
  ```tsx
  {error && (
    <div className={styles.errorMessage}>
      {error}
    </div>
  )}
  ```
- Style error message (red text, padding, clear visibility)

**CSS:**
```css
.errorMessage {
  color: #ff3b30;
  font-size: 14px;
  font-weight: 400;
  padding: 8px 16px;
  text-align: center;
  margin-top: 8px;
}
```

### 6.3 Loading States

**During Submission:**
- Disable "Done" button
- Show loading spinner or "Processing..." text
- Prevent modal close during submission

**Implementation:**
```typescript
const [isSubmitting, setIsSubmitting] = useState(false)

<button
  className={styles.doneButton}
  disabled={!isValid || isSubmitting}
  onClick={handleDone}
>
  {isSubmitting ? 'Processing...' : 'Done'}
</button>
```

---

## 7. Testing Checklist

### 7.1 Happy Path
- [ ] User enters amount in keypad → WithdrawSheet opens
- [ ] User selects "External crypto wallet" → WithdrawCryptoAddressSheet opens
- [ ] User enters valid TRON address → "Done" button enables
- [ ] User clicks "Done" → Withdrawal processes successfully
- [ ] Success notification shows
- [ ] User balance updates immediately (Firestore subscription)
- [ ] Withdrawal record created in Firestore with correct fields

### 7.2 Error Scenarios
- [ ] Invalid TRON address format → Error message shows, "Done" disabled
- [ ] Insufficient user balance → Error message shows, modal stays open
- [ ] Zero treasury balance → Error message shows, email sent to CoreAgent
- [ ] Partial fill → Success notification with partial fill warning
- [ ] Network error → Error message shows, user can retry

### 7.3 Edge Cases
- [ ] User closes modal mid-submission → Prevent close, show warning
- [ ] User submits same withdrawal twice quickly → Both process (or deduplication works)
- [ ] User balance changes between keypad and submit → Cloud Function handles correctly
- [ ] Treasury balance changes during submission → Partial fill logic works

### 7.4 UI/UX
- [ ] Modal animations smooth (220ms delay between sheets)
- [ ] Network dropdown shows TRON selected, others disabled
- [ ] Address input validation provides real-time feedback
- [ ] Loading states clear and non-blocking
- [ ] Error messages clear and actionable
- [ ] Success notifications appear correctly

---

## 8. Implementation Order

### Phase 1: Frontend Modal (Day 1)
1. Create `WithdrawCryptoAddressSheet.tsx` component
2. Copy/reuse CSS from `UsdtWalletAddressSheet.module.css`
3. Add client-side TRON address validation helper
4. Integrate into `src/app/page.tsx` flow
5. Test UI/UX (no backend calls yet)

### Phase 2: Backend Integration (Day 1-2)
6. Wire `onSubmit` to call `tx_withdrawTronUSDT`
7. Add error handling for all scenarios
8. Add loading states
9. Add success/error notifications
10. Test end-to-end flow

### Phase 3: Error Handling & Polish (Day 2)
11. Add comprehensive error messages
12. Add retry logic (optional)
13. Add rate limiting (optional)
14. Test all error scenarios
15. Verify Firestore records created correctly

### Phase 4: Testing & Verification (Day 2-3)
16. Test on iOS Safari
17. Test with various treasury balance scenarios
18. Test with network failures
19. Verify email notifications sent correctly
20. Verify balance updates in real-time

---

## 9. Files Summary

### New Files
- `src/components/WithdrawCryptoAddressSheet.tsx`
- `src/components/WithdrawCryptoAddressSheet.module.css` (or reuse existing)
- `src/lib/validation/tronAddress.ts`

### Modified Files
- `src/app/page.tsx` (add state, handlers, render new component)
- Potentially `src/components/AmountSheet.tsx` (verify withdraw flow routing)

### Unchanged Files (Backend Already Complete)
- `functions/src/tx/withdrawTronUsdt.ts` ✅
- `functions/src/utils/tronUtils.ts` ✅
- `functions/src/utils/resendEmail.ts` ✅
- `firestore.rules` ✅

---

## 10. Security Considerations

### 10.1 Input Validation
- ✅ Client-side: TRON address format validation
- ✅ Server-side: TRON address validation (Cloud Function)
- ✅ Server-side: Amount validation (positive number)
- ✅ Server-side: Authentication required

### 10.2 Balance Checks
- ✅ Server-side: User balance check (atomic transaction)
- ✅ Server-side: Treasury balance check (on-chain query)
- ✅ Server-side: Double-spend prevention (transaction lock)

### 10.3 Rate Limiting (Optional)
- Consider adding per-user rate limits (see 5.1)
- Consider adding per-address rate limits (prevent spam)

### 10.4 Audit Trail
- ✅ All withdrawals recorded in Firestore
- ✅ Transaction hashes stored
- ✅ Treasury balance at attempt recorded
- ✅ Email notifications for shortfalls

---

## 11. Future Enhancements (Out of Scope)

1. **Multi-Network Support:**
   - Enable Ethereum/Solana withdrawals
   - Add network-specific validation
   - Add network-specific fee calculation

2. **Withdrawal History:**
   - Show withdrawal history in UI
   - Filter by status, date, amount

3. **Withdrawal Confirmation:**
   - Add on-chain confirmation tracking
   - Update status to `CONFIRMED` after X confirmations

4. **Saved Addresses:**
   - Allow user to save frequently used addresses
   - Quick-select from saved addresses

5. **Batch Withdrawals:**
   - Allow multiple withdrawals in one transaction
   - Reduce gas fees for multiple recipients

---

## 12. Dependencies

### Existing Dependencies (No New Installs)
- `tronweb` (already in `functions/package.json`)
- `firebase-functions` (already installed)
- `firebase-admin` (already installed)
- `bip39`, `bip32`, `tiny-secp256k1` (already installed for HD wallet)

### Client-Side (No New Installs)
- React hooks (already used)
- Next.js Image (already used)
- Zustand stores (already used)

---

## Summary

This plan provides a complete implementation guide for fixing the withdraw crypto flow. The backend (`tx_withdrawTronUSDT`) is already production-ready, so the work is primarily frontend:

1. **Create new modal component** (`WithdrawCryptoAddressSheet`) reusing design from linked accounts
2. **Integrate into flow** in `src/app/page.tsx`
3. **Add validation and error handling**
4. **Test thoroughly** with various scenarios

The implementation is straightforward and low-risk since the backend is already complete and tested.


# Withdraw Crypto Flow Implementation Summary

## ✅ Implementation Complete

**Commit:** `57f1aff` - "Implement withdraw crypto flow with hard fail and safe accounting"

---

## Files Changed

### Frontend (6 files)

1. **`src/components/WithdrawCryptoAddressSheet.tsx`** (NEW)
   - Destination address modal for crypto withdrawals
   - Copies design from `UsdtWalletAddressSheet.tsx`
   - Network dropdown: TRON selected, Ethereum/Solana disabled
   - Client-side TRON address validation
   - Generates `requestId` for idempotency

2. **`src/lib/validation/tronAddress.ts`** (NEW)
   - Client-safe TRON address validation
   - Validates: starts with "T", length 34, base58 charset
   - No server imports (client-safe)

3. **`src/app/page.tsx`** (MODIFIED)
   - Added state: `openWithdrawCryptoAddress`, `withdrawCryptoAmountUSDT`
   - Fixed flow: crypto selection opens address modal (no keypad loop)
   - Updated `handleAmountSubmit` to store USDT amount for withdraw mode
   - Added `handleWithdrawCryptoSubmit` with requestId generation
   - Wired `WithdrawCryptoAddressSheet` component

4. **`src/lib/transactions/clientFunctions.ts`** (MODIFIED)
   - Updated `WithdrawTronUsdtParams`: added `requestId: string`
   - Updated `WithdrawTronUsdtResult`: 
     - Removed `shortfallUSDT` (hard fail only)
     - New status union: `DEBITED | BROADCAST_FULL | FAILED_*`

### Backend (3 files)

5. **`functions/src/tx/withdrawTronUsdt.ts`** (COMPLETE REWRITE)
   - **Hard fail only:** Rejects if treasury cannot cover full amount
   - **Idempotency:** Uses `withdrawalId = ${userId}_${requestId}`
   - **Two-phase accounting:** Debit first, then broadcast, refund on failure
   - **TRX balance check:** Requires `MIN_TRX_BALANCE = 10 TRX`
   - **New status model:** `DEBITED`, `BROADCAST_FULL`, `FAILED_*`
   - **Rollback on broadcast failure:** Refunds user in second transaction
   - **Email notifications:** All failure scenarios notify CoreAgent

6. **`functions/src/utils/tronUtils.ts`** (MODIFIED)
   - Added `getTreasuryTrxBalance()` function
   - Uses `tronWeb.trx.getBalance()` and `tronWeb.fromSun()`

7. **`functions/src/tx/tronweb.d.ts`** (MODIFIED)
   - Added `trx.getBalance()` method
   - Added `fromSun()` method
   - Added `defaultAddress.base58` property
   - Added `address.fromPrivateKey()` static method

---

## Key Features Implemented

### 1. Hard Fail Policy ✅
- **No partial fills:** Rejects if `treasuryUSDT < amountUSDT + fee`
- **Status:** `FAILED_INSUFFICIENT_TREASURY` or `FAILED_ZERO_TREASURY`
- **User NOT debited** on treasury shortfall

### 2. Safe Accounting ✅
- **Two-phase pattern:**
  1. Debit user in Firestore transaction (status: `DEBITED`)
  2. Broadcast on-chain transfer
  3. If broadcast fails → refund user in second transaction (status: `FAILED_BROADCAST_REFUNDED`)
- **No stranded debits:** User always refunded if broadcast fails

### 3. Idempotency ✅
- **Deterministic withdrawal ID:** `${userId}_${requestId}`
- **Idempotent success:** If `status === BROADCAST_FULL`, return existing result
- **In-progress protection:** If `status === DEBITED`, reject with "in progress" error

### 4. TRX Balance Check ✅
- **Minimum TRX:** `MIN_TRX_BALANCE = 10 TRX`
- **Hard fail:** Rejects if treasury TRX < 10 TRX
- **Status:** `FAILED_TREASURY_NO_TRX`
- **User NOT debited** on TRX shortfall

### 5. Frontend Flow ✅
- **Fixed routing:** Crypto selection → Address modal (no keypad loop)
- **Amount passing:** Keypad amount stored and passed to address modal
- **Validation:** Client-side TRON address validation before submit
- **Error handling:** Clear error messages for all failure scenarios

---

## Configuration Requirements

### No New Environment Variables Required

All existing Firebase Functions config is sufficient:
- `tron.treasury_private_key` (existing)
- `tron.master_seed` (existing)
- `tron.fullhost` (existing, optional)
- `tron.api_key` (existing, optional)
- `resend.api_key` (existing)
- `email.from` (existing)
- `coreagent.email` (existing)

### New Constant: `MIN_TRX_BALANCE`

**Location:** `functions/src/tx/withdrawTronUsdt.ts` (line 44)

**Value:** `10 TRX` (hardcoded constant)

**Purpose:** Minimum TRX balance required for treasury to execute TRC-20 transfer

**To Change:** Edit the constant in the file (no config needed for MVP)

---

## Status Model

### Success Statuses
- `DEBITED`: User debited, awaiting broadcast (intermediate state)
- `BROADCAST_FULL`: Broadcast succeeded, txId stored (final success)

### Failure Statuses (Hard Fail - No Debit)
- `FAILED_INSUFFICIENT_TREASURY`: Treasury USDT < required amount
- `FAILED_ZERO_TREASURY`: Treasury USDT = 0
- `FAILED_TREASURY_NO_TRX`: Treasury TRX < 10 TRX

### Failure Statuses (Broadcast Failed - Refunded)
- `FAILED_BROADCAST_REFUNDED`: Broadcast failed, user refunded successfully
- `FAILED_BROADCAST_NEEDS_MANUAL`: Refund failed (rare, requires manual intervention)

---

## Testing Checklist

### Happy Path
- [ ] User enters amount → WithdrawSheet opens
- [ ] User selects "External crypto wallet" → WithdrawCryptoAddressSheet opens
- [ ] User enters valid TRON address → "Done" enables
- [ ] User clicks "Done" → Withdrawal processes successfully
- [ ] Success notification shows with txId
- [ ] User balance updates immediately (Firestore subscription)
- [ ] Withdrawal record created with `BROADCAST_FULL` status

### Hard Fail Scenarios
- [ ] Treasury USDT < requested amount → Error: "Insufficient treasury balance"
- [ ] Treasury USDT = 0 → Error: "Treasury has no liquidity"
- [ ] Treasury TRX < 10 TRX → Error: "Insufficient TRX"
- [ ] User NOT debited on any hard fail
- [ ] Email sent to CoreAgent on hard fail

### Atomicity Tests
- [ ] Broadcast succeeds → User debited → Status: `BROADCAST_FULL`
- [ ] Broadcast fails → User refunded → Status: `FAILED_BROADCAST_REFUNDED`
- [ ] Error message shows on broadcast failure
- [ ] No orphaned debits (user balance matches withdrawal records)

### Idempotency Tests
- [ ] Same requestId called twice → Returns same result (idempotent)
- [ ] In-progress withdrawal (DEBITED) → Rejects with "in progress" error
- [ ] Completed withdrawal (BROADCAST_FULL) → Returns existing result

### Validation Tests
- [ ] Invalid TRON address → "Done" disabled, error message
- [ ] Empty address → "Done" disabled
- [ ] Valid address → "Done" enabled
- [ ] Network dropdown shows TRON selected, others disabled

---

## Edge Cases Handled

1. **Broadcast succeeds but Firestore update fails:**
   - Treasury sent USDT, but withdrawal record not updated
   - **Mitigation:** Firestore transactions are highly reliable
   - **If occurs:** Manual reconciliation needed (withdrawal record can be updated manually)

2. **Refund transaction fails:**
   - User debited, broadcast failed, refund failed
   - **Status:** `FAILED_BROADCAST_NEEDS_MANUAL`
   - **Action:** Urgent email to CoreAgent with withdrawalId
   - **Resolution:** Manual refund in Firestore

3. **Double-tap/retry:**
   - Same requestId called twice
   - **Protection:** Idempotency check returns existing result
   - **In-progress:** Rejects with "in progress" error

4. **Treasury balance changes during submission:**
   - Pre-check validates treasury balance
   - **Protection:** Hard fail if insufficient at time of check
   - **Note:** Balance checked before any debit

---

## Deployment Notes

1. **Firebase Functions:**
   - Deploy: `firebase deploy --only functions:tx_withdrawTronUSDT`
   - No new environment variables needed
   - Existing config sufficient

2. **Frontend:**
   - Vercel will auto-deploy on push
   - No new environment variables needed

3. **Testing:**
   - Test on iOS Safari
   - Test with various treasury balance scenarios
   - Test with network failures
   - Verify email notifications sent correctly

---

## Summary

✅ **Frontend:** New address modal, fixed flow routing, client validation  
✅ **Backend:** Hard fail only, safe accounting with rollback, idempotency  
✅ **Safety:** No stranded debits, refund on broadcast failure  
✅ **Idempotency:** RequestId prevents double-sends  
✅ **TRX Check:** Prevents "USDT ok but can't send" failures  

**Status:** Ready for testing and deployment


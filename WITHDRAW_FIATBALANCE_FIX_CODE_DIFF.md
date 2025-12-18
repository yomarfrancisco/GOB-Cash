# Withdraw fiatBalance Fix - Exact Code Changes

## Summary

**Root Cause**: Deposits write ZAR to `fiatBalance`/`lockedBalance`, but withdraw was reading `usdtBalance` (never written).

**Fix**: Derive withdrawable USDT from `fiatBalance` using fixed FX rate (18.1 ZAR/USDT), and debit `fiatBalance` on successful withdrawal.

---

## 1. Updated Balance Calculation Function

**File**: `functions/src/tx/withdrawTronUsdt.ts:33-70`

### Added Constant:
```typescript
/**
 * Temporary fixed exchange rate: ZAR per USDT
 * TODO: Make this configurable or fetch from external source
 */
const FX_RATE_ZAR_PER_USDT = 18.1
```

### Updated Function:
```typescript
/**
 * Get user available USDT balance derived from fiatBalance (ZAR)
 * 
 * Converts fiatBalance (ZAR) to USDT using fixed exchange rate.
 * Only considers fiatBalance (available balance), not lockedBalance.
 * 
 * This matches the deposit flow which credits fiatBalance in ZAR.
 */
async function getUserUsdtBalance(userId: string): Promise<number> {
  const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
  const walletSnap = await walletRef.get()
  
  if (!walletSnap.exists) {
    return 0
  }
  
  const walletData = walletSnap.data()
  const fiatBalance = walletData?.fiatBalance || 0
  
  // Convert ZAR to USDT using fixed exchange rate
  // Only use fiatBalance (available), not lockedBalance (locked for settlement)
  const availableUsdt = fiatBalance / FX_RATE_ZAR_PER_USDT
  
  return availableUsdt
}
```

**Change**: Now reads `fiatBalance` and converts to USDT, instead of reading `usdtBalance`.

---

## 2. Updated Balance Check with Deterministic Logging

**File**: `functions/src/tx/withdrawTronUsdt.ts:177-222`

### Before:
```typescript
const userAvailableUSDT = await getUserUsdtBalance(userId)

if (userAvailableUSDT < amountUSDT + WITHDRAWAL_FEE_USDT) {
  throw new functions.https.HttpsError('failed-precondition', 'Insufficient user balance')
}
```

### After:
```typescript
// Read wallet to get fiatBalance for conversion and logging
const preCheckWalletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
const preCheckWalletSnap = await preCheckWalletRef.get()
const preCheckWalletData = preCheckWalletSnap.exists ? preCheckWalletSnap.data()! : {}

const fiatBalance = preCheckWalletData?.fiatBalance || 0
const lockedBalance = preCheckWalletData?.lockedBalance || 0

// Convert fiatBalance (ZAR) to available USDT
const userAvailableUSDT = await getUserUsdtBalance(userId)

// Calculate required ZAR debit amount
const requiredUSDT = amountUSDT + WITHDRAWAL_FEE_USDT
const requiredZARDebit = requiredUSDT * FX_RATE_ZAR_PER_USDT

// DETERMINISTIC LOGGING: Log all balance details before checks
console.log('[tx_withdrawTronUSDT] Balance diagnostics:', {
  userId,
  fiatBalance,
  lockedBalance,
  fxRate: FX_RATE_ZAR_PER_USDT,
  computedAvailableUsdt: userAvailableUSDT,
  requestedAmountUsdt: amountUSDT,
  withdrawalFeeUSDT: WITHDRAWAL_FEE_USDT,
  requiredUsdt: requiredUSDT,
  requiredZarDebit: requiredZARDebit,
  walletPath: `users/${userId}/wallets/cashZAR`,
})

// Check user balance (derived from fiatBalance)
if (userAvailableUSDT < requiredUSDT) {
  console.error('[tx_withdrawTronUSDT] Insufficient user balance:', {
    userId,
    fiatBalance,
    lockedBalance,
    fxRate: FX_RATE_ZAR_PER_USDT,
    computedAvailableUsdt: userAvailableUSDT,
    requestedAmountUsdt: amountUSDT,
    requiredUsdt: requiredUSDT,
    requiredZarDebit: requiredZARDebit,
  })
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Insufficient user balance',
    { userAvailableUSDT, requestedAmountUSDT: amountUSDT }
  )
}
```

**Changes**:
- Reads `fiatBalance` and `lockedBalance` for logging
- Calculates `requiredZARDebit` for debit amount
- Logs all balance details deterministically

---

## 3. Updated Debit Logic

**File**: `functions/src/tx/withdrawTronUsdt.ts:450-472`

### Before:
```typescript
const walletSnap = await t.get(walletRef)
const currentBalance = walletSnap.data()?.usdtBalance || 0

if (currentBalance < amountUSDT + WITHDRAWAL_FEE_USDT) {
  throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance (changed during transaction)')
}

const newBalance = currentBalance - (amountUSDT + WITHDRAWAL_FEE_USDT)
t.update(walletRef, {
  usdtBalance: newBalance,
  updatedAt: admin.firestore.Timestamp.now(),
})
```

### After:
```typescript
// Read current wallet balance (fiatBalance in ZAR)
const walletSnap = await t.get(walletRef)
const walletData = walletSnap.exists ? walletSnap.data()! : {}
const currentFiatBalance = walletData?.fiatBalance || 0

// Calculate required ZAR debit
const requiredUSDT = amountUSDT + WITHDRAWAL_FEE_USDT
const requiredZARDebit = requiredUSDT * FX_RATE_ZAR_PER_USDT

// Verify balance hasn't changed (double-spend protection)
if (currentFiatBalance < requiredZARDebit) {
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Insufficient balance (changed during transaction)'
  )
}

// Debit user fiatBalance (ZAR)
const newFiatBalance = currentFiatBalance - requiredZARDebit
t.update(walletRef, {
  fiatBalance: newFiatBalance,
  updatedAt: admin.firestore.Timestamp.now(),
})
```

**Changes**:
- Reads `fiatBalance` instead of `usdtBalance`
- Calculates `requiredZARDebit` using FX rate
- Debits `fiatBalance` instead of `usdtBalance`

---

## 4. Updated Withdrawal Record Fields

**File**: `functions/src/tx/withdrawTronUsdt.ts:475-490`

### Before:
```typescript
const withdrawalDoc = {
  id: withdrawalId,
  userId,
  toAddress: toAddress.trim(),
  requestedAmountUSDT: amountUSDT,
  sentAmountUSDT: amountUSDT,
  feeUSDT: WITHDRAWAL_FEE_USDT,
  status: 'BROADCAST_FULL' as WithdrawalStatus,
  txId,
  treasuryBalanceAtAttemptUSDT: treasuryUsdt,
  createdAt: now,
  updatedAt: admin.firestore.Timestamp.now(),
}
```

### After:
```typescript
const withdrawalDoc = {
  id: withdrawalId,
  userId,
  toAddress: toAddress.trim(),
  requestedAmountUSDT: amountUSDT,
  sentAmountUSDT: amountUSDT,
  feeUSDT: WITHDRAWAL_FEE_USDT,
  amountZAR_debited: requiredZARDebit,
  fxRate: FX_RATE_ZAR_PER_USDT,
  network: 'TRON',
  status: 'BROADCAST_FULL' as WithdrawalStatus,
  txId,
  treasuryBalanceAtAttemptUSDT: treasuryUsdt,
  createdAt: now,
  updatedAt: admin.firestore.Timestamp.now(),
}
```

**Added fields**:
- `amountZAR_debited`: ZAR amount debited (0 on failure)
- `fxRate`: Exchange rate used (18.1)
- `network`: 'TRON'

**Applied to all withdrawal records** (success and failure cases).

---

## 5. Files NOT Changed (Deposit Flows)

✅ **No changes to**:
- `functions/src/tx/creditAndLock.ts` - Still credits `fiatBalance`/`lockedBalance` in ZAR
- `functions/src/tx/unlockSweep.ts` - Still moves from `lockedBalance` to `fiatBalance` in ZAR
- Deposit UI logic - Unchanged

---

## Test Checklist

### 1. User has fiatBalance > 0
- **Setup**: User has completed deposit and unlock
- **Verify**: Firestore `users/{userId}/wallets/cashZAR.fiatBalance > 0`
- **Example**: `fiatBalance = 181 ZAR` → `availableUSDT = 181 / 18.1 = 10 USDT`

### 2. Withdraw a small USDT amount
- **Action**: User requests withdrawal (e.g., 1 USDT)
- **Expected**:
  - Balance check: `10 USDT >= 1 USDT` ✅
  - Treasury check: `8.379 USDT >= 1 USDT` ✅
  - Broadcast succeeds
  - `fiatBalance` reduced by `1 * 18.1 = 18.1 ZAR`
  - New `fiatBalance = 181 - 18.1 = 162.9 ZAR`

### 3. Verify TRON tx broadcast + TronScan tx hash
- **Check**: Function logs show `txId`
- **Verify**: Visit `https://tronscan.org/#/transaction/{txId}`
- **Expected**: Transaction shows USDT transfer from `TQpKs8c2cLcnPUkTq5LftRftusSBkgEwQX` to user address

### 4. Verify Firestore fiatBalance reduced correctly
- **Before**: `fiatBalance = 181 ZAR`
- **After**: `fiatBalance = 162.9 ZAR`
- **Check**: `withdrawals/{withdrawalId}.amountZAR_debited = 18.1`
- **Check**: `withdrawals/{withdrawalId}.fxRate = 18.1`

---

## Example Calculation

**User State**:
- `fiatBalance = 181 ZAR`
- `lockedBalance = 0 ZAR`

**Available USDT**: `181 / 18.1 = 10 USDT`

**User Requests**: `5 USDT`

**Required ZAR Debit**: `5 * 18.1 = 90.5 ZAR`

**New State**:
- `fiatBalance = 181 - 90.5 = 90.5 ZAR`
- `availableUSDT = 90.5 / 18.1 = 5 USDT` ✅

**Withdrawal Record**:
```json
{
  "requestedAmountUSDT": 5,
  "sentAmountUSDT": 5,
  "amountZAR_debited": 90.5,
  "fxRate": 18.1,
  "network": "TRON",
  "status": "BROADCAST_FULL",
  "txId": "..."
}
```

---

## Treasury Verification

**Treasury Address**: `TQpKs8c2cLcnPUkTq5LftRftusSBkgEwQX` ✅
**USDT Contract**: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` ✅
**TronScan Balance**: 8.379 USDT ✅
**Function Uses**: `getTreasuryAddress()` → `TQpKs8c2cLcnPUkTq5LftRftusSBkgEwQX` ✅

---

## Summary

✅ **Withdraw derives USDT from fiatBalance (ZAR)**
✅ **Debit reduces fiatBalance by calculated ZAR amount**
✅ **All withdrawal records include fxRate and amountZAR_debited**
✅ **No deposit flow changes**
✅ **Clean error messages for users**
✅ **Deterministic logging for debugging**


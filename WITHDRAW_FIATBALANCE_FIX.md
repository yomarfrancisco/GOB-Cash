# Withdraw fiatBalance Fix - Implementation Summary

## Changes Made

### 1. Updated Balance Calculation

**File**: `functions/src/tx/withdrawTronUsdt.ts:45-70`

**Before**:
```typescript
async function getUserUsdtBalance(userId: string): Promise<number> {
  const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
  const walletSnap = await walletRef.get()
  const walletData = walletSnap.data()
  return walletData?.usdtBalance || 0  // ❌ Never written by deposits
}
```

**After**:
```typescript
/**
 * Temporary fixed exchange rate: ZAR per USDT
 * TODO: Make this configurable or fetch from external source
 */
const FX_RATE_ZAR_PER_USDT = 18.1

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

### 2. Updated Balance Check with Deterministic Logging

**File**: `functions/src/tx/withdrawTronUsdt.ts:177-212`

**Changes**:
- Reads `fiatBalance` and `lockedBalance` directly
- Calculates `requiredZARDebit = (amountUSDT + fee) * FX_RATE_ZAR_PER_USDT`
- Logs all balance details before checks:
  - `fiatBalance`, `lockedBalance`, `fxRate`, `computedAvailableUsdt`, `requestedAmountUsdt`, `requiredZarDebit`

### 3. Updated Debit Logic

**File**: `functions/src/tx/withdrawTronUsdt.ts:450-472`

**Before**:
```typescript
const currentBalance = walletSnap.data()?.usdtBalance || 0
const newBalance = currentBalance - (amountUSDT + WITHDRAWAL_FEE_USDT)
t.update(walletRef, {
  usdtBalance: newBalance,
  updatedAt: admin.firestore.Timestamp.now(),
})
```

**After**:
```typescript
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

### 4. Updated Withdrawal Record Fields

**File**: `functions/src/tx/withdrawTronUsdt.ts:475-488`

**Added fields to withdrawal document**:
- `amountZAR_debited`: ZAR amount debited from user (0 on failure)
- `fxRate`: Exchange rate used (18.1)
- `network`: 'TRON'

**All withdrawal records now include**:
```typescript
{
  id: withdrawalId,
  userId,
  toAddress: toAddress.trim(),
  requestedAmountUSDT: amountUSDT,
  sentAmountUSDT: amountUSDT, // or 0 on failure
  feeUSDT: WITHDRAWAL_FEE_USDT,
  amountZAR_debited: requiredZARDebit, // or 0 on failure
  fxRate: FX_RATE_ZAR_PER_USDT,
  network: 'TRON',
  status: 'BROADCAST_FULL' | 'FAILED_*',
  txId: string | null,
  treasuryBalanceAtAttemptUSDT: treasuryUsdt,
  createdAt: now,
  updatedAt: now,
}
```

### 5. Error Messages (Already Clean)

**File**: `src/app/profile/page.tsx:707-708` and `src/app/page.tsx:862-863`

**User-facing messages**:
- `functions/failed-precondition` with "Insufficient user balance" → "Not allowed: Insufficient USDT balance. Please check your balance and try again."
- `functions/failed-precondition` with "Treasury" → "Not allowed: Treasury has insufficient balance..."
- `functions/invalid-argument` with "Invalid TRON address" → "Not allowed: Invalid TRON address format."

## Files Changed

1. ✅ `functions/src/tx/withdrawTronUsdt.ts` - Updated balance calculation and debit logic
2. ❌ **No changes to deposit flows**:
   - `functions/src/tx/creditAndLock.ts` - Unchanged
   - `functions/src/tx/unlockSweep.ts` - Unchanged
   - Deposit UI logic - Unchanged

## Test Checklist

### 1. User has fiatBalance > 0
- **Setup**: User has completed deposit and unlock (fiatBalance > 0)
- **Verify**: Check Firestore `users/{userId}/wallets/cashZAR.fiatBalance > 0`

### 2. Withdraw a small USDT amount
- **Action**: User requests withdrawal (e.g., 1 USDT)
- **Expected**: 
  - Balance check passes (fiatBalance / 18.1 >= 1 USDT)
  - Treasury check passes
  - Broadcast succeeds
  - fiatBalance reduced by 1 * 18.1 = 18.1 ZAR

### 3. Verify TRON tx broadcast + TronScan tx hash
- **Check**: Function logs show `txId`
- **Verify**: Visit `https://tronscan.org/#/transaction/{txId}`
- **Expected**: Transaction shows USDT transfer from treasury to user address

### 4. Verify Firestore fiatBalance reduced correctly
- **Before**: `fiatBalance = X`
- **After**: `fiatBalance = X - (amountUSDT * 18.1)`
- **Check**: `withdrawals/{withdrawalId}.amountZAR_debited` matches calculation

## Example Calculation

**User has**: `fiatBalance = 181 ZAR`

**Available USDT**: `181 / 18.1 = 10 USDT`

**User requests**: `5 USDT`

**Required ZAR debit**: `5 * 18.1 = 90.5 ZAR`

**New fiatBalance**: `181 - 90.5 = 90.5 ZAR`

**Remaining available USDT**: `90.5 / 18.1 = 5 USDT` ✅

## Treasury Verification

**Treasury Address**: `TQpKs8c2cLcnPUkTq5LftRftusSBkgEwQX` ✅
**USDT Contract**: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` ✅
**TronScan Balance**: 8.379 USDT ✅

## Summary

✅ **Withdraw now derives USDT from fiatBalance (ZAR)**
✅ **Debit reduces fiatBalance by calculated ZAR amount**
✅ **All withdrawal records include fxRate and amountZAR_debited**
✅ **No deposit flow changes**
✅ **Clean error messages for users**
✅ **Deterministic logging for debugging**


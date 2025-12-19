# PayFast Credit Investigation & Fix

## Problem
Successful PayFast payments don't update wallet balances (cashZAR + total) in the UI, even though payments complete successfully.

## Investigation Results

### 1. Credit Logic Location ✅
**File:** `src/app/api/payfast/credit/route.ts` (lines 107-135)

**What it does:**
- Reads payment record from `/payments/{ref}`
- Verifies payment status is `COMPLETE`
- Atomically updates `users/{userId}/wallets/cashZAR.fiatBalance`
- Marks payment as `CREDITED`

**Firestore paths written:**
- ✅ `payments/{ref}.status = 'CREDITED'`
- ✅ `users/{userId}/wallets/cashZAR.fiatBalance` (incremented)
- ✅ `users/{userId}/wallets/cashZAR.updatedAt` (timestamp)

### 2. Root Cause: Incomplete Wallet Document ❌
**Problem:** When wallet doesn't exist, credit route creates incomplete document.

**Current code (lines 122-125):**
```typescript
transaction.set(walletRef, {
  fiatBalance: newBalance,
  updatedAt: new Date(),
})
```

**Required WalletDoc fields (from `src/types/wallet.ts`):**
- `walletId: 'cashZAR'` ❌ MISSING
- `kind: 'cash'` ❌ MISSING
- `displayCurrency: 'ZAR'` ❌ MISSING
- `fiatBalance: number` ✅ Present
- `usdtBalance: number` ❌ MISSING (defaults to 0)

**Impact:** 
- Subscription in `subscribeToWallets()` uses `data.walletId` as key (line 206: `map[data.walletId] = data`)
- If `walletId` is missing, wallet won't be mapped to `map.cashZAR`
- UI subscription callback receives incomplete map
- Store update fails silently

### 3. UI Subscription ✅
**File:** `src/lib/wallets.ts` (lines 187-250)

**What it does:**
- Subscribes to `users/{userId}/wallets` collection
- Maps wallets by `walletId` field: `map[data.walletId] = data`
- Calls `setWallets()` to update store

**Initialization:** 
- Called in `FirebaseAuthListener.tsx` after `ensureDefaultWallets()` (line 190)
- Subscription is active and should receive updates

### 4. Environment Consistency ✅
**Client Firebase config:** `src/lib/firebase.ts`
- Uses `NEXT_PUBLIC_FIREBASE_PROJECT_ID` from env vars
- Logs projectId on initialization (lines 74-80)

**Server Firebase Admin:** `src/lib/firebase-admin.ts`
- Uses `FIREBASE_SERVICE_ACCOUNT_JSON` from env vars
- Service account contains `project_id` field

**Verification needed:** Ensure both point to same project (check logs for projectId)

### 5. Wallet ID Consistency ✅
**Credit route:** Uses `cashZAR` (line 108)
**Subscription:** Expects `walletId: 'cashZAR'` (line 206)
**Default wallets:** Creates `cashZAR` with `walletId: 'cashZAR'` (line 30)

**Match:** ✅ All use `cashZAR` consistently

## Fix Applied

### File Changed
`src/app/api/payfast/credit/route.ts` (lines 121-130)

**Before:**
```typescript
} else {
  transaction.set(walletRef, {
    fiatBalance: newBalance,
    updatedAt: new Date(),
  })
}
```

**After:**
```typescript
} else {
  // Create wallet with all required WalletDoc fields
  // This ensures subscription can map it correctly by walletId
  transaction.set(walletRef, {
    walletId: 'cashZAR',
    kind: 'cash',
    displayCurrency: 'ZAR',
    fiatBalance: newBalance,
    usdtBalance: 0,
    updatedAt: new Date(),
  })
}
```

## Verification Steps

1. **Check Firestore console:** After successful payment, verify `users/{userId}/wallets/cashZAR` has:
   - `walletId: 'cashZAR'`
   - `fiatBalance: [expected amount]`
   - `kind: 'cash'`
   - `displayCurrency: 'ZAR'`

2. **Check browser console:** Look for:
   - `[Wallets] subscribeToWallets: onSnapshot fired (subsequent update)` after credit
   - `[BALANCE_INSTRUMENTATION] setWallets called` with `cashZAR` present

3. **Check subscription path:** Verify listener is on `users/{userId}/wallets` collection (not single doc)

## Summary

**Culprit:** Incomplete wallet document creation in credit route (missing `walletId`, `kind`, `displayCurrency`, `usdtBalance`)

**Fix:** Create complete `WalletDoc` with all required fields when wallet doesn't exist

**Files changed:**
- `src/app/api/payfast/credit/route.ts` - Fixed wallet document creation
- `PAYFAST_CREDIT_INVESTIGATION.md` - Full diagnostic report

**Status:** ✅ Fixed and committed


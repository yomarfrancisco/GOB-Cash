# PayFast Credit Investigation Report

## Problem
Successful PayFast payments don't update wallet balances in the UI, even though the credit API route appears to write to Firestore.

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

### 2. Wallet Document Structure Issue ❌
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
- Maps wallets by `walletId` field
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

**Verification needed:** Ensure both point to same project (`gobankless-dev`)

### 5. Wallet ID Consistency ✅
**Credit route:** Uses `cashZAR` (line 108)
**Subscription:** Expects `walletId: 'cashZAR'` (line 206)
**Default wallets:** Creates `cashZAR` with `walletId: 'cashZAR'` (line 30)

**Match:** ✅ All use `cashZAR` consistently

## Root Cause

**Primary Issue:** Incomplete wallet document creation in credit route.

When `/api/payfast/credit` creates a new wallet (if it doesn't exist), it only sets:
- `fiatBalance`
- `updatedAt`

But the subscription expects:
- `walletId` (used as map key)
- `kind`
- `displayCurrency`
- `usdtBalance`

Without `walletId`, the subscription can't map the wallet correctly, so `map.cashZAR` is undefined, and the store update fails.

## Fix Plan

### Minimal Fix (Recommended)
Update `/api/payfast/credit/route.ts` to create complete wallet document:

```typescript
} else {
  // Create wallet with all required WalletDoc fields
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

### Alternative: Ensure wallet exists before credit
Call `ensureDefaultWallets()` before crediting, but this requires user object and is more complex.

## Verification Steps

1. Check Firestore console: After successful payment, verify `users/{userId}/wallets/cashZAR` has:
   - `walletId: 'cashZAR'`
   - `fiatBalance: [expected amount]`
   - `kind: 'cash'`
   - `displayCurrency: 'ZAR'`

2. Check browser console: Look for:
   - `[Wallets] subscribeToWallets: onSnapshot fired (subsequent update)` after credit
   - `[BALANCE_INSTRUMENTATION] setWallets called` with `cashZAR` present

3. Check subscription path: Verify listener is on `users/{userId}/wallets` collection (not single doc)

## Files to Modify

1. `src/app/api/payfast/credit/route.ts` - Fix wallet document creation (lines 122-125)


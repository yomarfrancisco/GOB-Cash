# Wallet Balance Fix: Ensure Zero Balances on Refresh

## Problem Diagnosis

New wallets were getting non-zero balances on refresh due to three issues:

1. **Wallet Store Not Cleared on Refresh**: The `useWalletStore` initializes with `demoWallets` (non-zero balances). When `onAuthStateChanged` fires, it sets `demoMode: false` but doesn't actually clear the wallets, so demo values persist until Firestore loads.

2. **`ensureDefaultWallets` Only Creates, Doesn't Reset**: The function only creates wallets if the collection is empty. For existing users, it returns early without checking or resetting balances. If Firestore has non-zero balances from previous writes, they persist.

3. **No Balance Reset on Refresh**: There was no mechanism to reset balances to zero on sign-in/refresh, so any non-zero balances in Firestore would be loaded and displayed.

## Solution Implemented

### 1. Created `resetWalletBalancesToZero()` Function
**Location**: `src/lib/wallets.ts`

- Resets all wallet balances (`fiatBalance` and `usdtBalance`) to zero for existing wallets
- Only writes if balances are non-zero (avoids unnecessary Firestore writes)
- Called by `ensureDefaultWallets()` when wallets already exist

### 2. Modified `ensureDefaultWallets()` Function
**Location**: `src/lib/wallets.ts`

- Now calls `resetWalletBalancesToZero()` when wallets already exist
- Ensures that on refresh, existing wallets have their balances reset to zero
- Maintains backward compatibility: still creates wallets if collection is empty

### 3. Clear Wallet Store Immediately on Sign-In
**Location**: `src/components/FirebaseAuthListener.tsx`

- Changed from comment "Clear wallets" to actual implementation: `walletStore.setWallets({} as WalletMap)`
- Prevents demo wallet values from showing during the loading period
- Cards will show $0 while loading, then update from Firestore (which will have zero balances)

## Flow After Fix

1. **On Refresh/Sign-In**:
   - `onAuthStateChanged` fires
   - Wallet store cleared: `setWallets({})` → cards show $0
   - `demoMode` set to `false`
   - `walletsStatus` set to `'loading'`

2. **Wallet Initialization**:
   - `ensureDefaultWallets()` runs
   - If wallets exist: `resetWalletBalancesToZero()` resets all balances to 0
   - If wallets don't exist: creates them with $0 balances

3. **Firestore Subscription**:
   - Subscription fires with wallets from Firestore (all with $0 balances)
   - `walletStore.setWallets(wallets)` updates store
   - Cards display $0 balances

## Files Changed

1. **`src/lib/wallets.ts`**
   - Added `resetWalletBalancesToZero()` function
   - Modified `ensureDefaultWallets()` to reset balances for existing wallets

2. **`src/components/FirebaseAuthListener.tsx`**
   - Added `WalletMap` import
   - Changed wallet clearing from comment to actual implementation: `setWallets({} as WalletMap)`

## Testing

To verify the fix:
1. Sign in as a new user → wallets should show $0
2. Refresh the page → wallets should still show $0 (not demo values)
3. Check Firestore → all wallet balances should be 0
4. Check browser console → should see `[Wallets] Reset wallet balances to zero for user` log

## Notes

- The reset only happens on sign-in/refresh, not on every wallet subscription update
- Only writes to Firestore if balances are non-zero (optimization)
- Maintains all other wallet properties (apy, kind, displayCurrency, etc.)
- Zero balance enforcement is now consistent across new signups and refreshes


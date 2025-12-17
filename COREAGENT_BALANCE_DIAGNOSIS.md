# CoreAgent Balance Diagnosis Report

## Problem
CoreAgent balance stays at 0 after sign-in, even though Firestore should have non-zero balance.

**CoreAgent UID:** `xHKmkizXhPOU25vwTIB6dxhMzSH2`  
**Handle:** `@ygor-francisco-6602`  
**Firestore Region:** `eur3`

## Root Cause Identified

### Critical Issue: Wallet Store Zeroing Out All Balances

**Location:** `src/store/wallets.ts` lines 107-134

The wallet store has a gate that **forces ALL balances to zero** for authenticated users, even when they come from Firestore with legitimate non-zero values:

```typescript
// GATE: If authState is 'authed' or 'loading', ensure all balances are zero
if (authState !== 'unauthed') {
  // Force all balances to zero for authenticated/loading users
  const zeroedWallets: WalletMap = {} as WalletMap
  Object.keys(wallets).forEach((key) => {
    const wallet = (wallets as any)[key]
    zeroedWallets[key as keyof WalletMap] = {
      ...wallet,
      fiatBalance: 0,
      usdtBalance: 0,
    }
  })
  set({ wallets: zeroedWallets, demoMode: false, walletsStatus: 'ready' })
  return
}
```

**Impact:** Even if Firestore has non-zero balances for CoreAgent, the wallet store zeroes them out before they reach the UI.

## Fixes Implemented

### 1. Fixed Wallet Store Gate (`src/store/wallets.ts`)
- **Changed:** Only block demo balances, not Firestore balances
- **Logic:** Check if wallets come from `subscribeToWallets` (Firestore) vs demo/initial state
- **Result:** Firestore balances (even non-zero) are now allowed through

### 2. Added Diagnostic Logging
- **`src/lib/wallets.ts`:** Logs when `subscribeToWallets` attaches and when `onSnapshot` fires with wallet data
- **`src/lib/firebase.ts`:** Always logs `projectId` (not just in dev)
- **`src/components/FirebaseAuthListener.tsx`:** Logs `projectId` and `currentUser.uid` on auth state change

### 3. Created Admin Function to Seed Balance
- **`functions/src/admin/seedCoreAgentBalance.ts`:** Cloud Function to seed CoreAgent's cashZAR wallet
- **Usage:** Call from Firebase Console or client with `amountZAR` parameter
- **Security:** Only CoreAgent UID can call it

## Verification Steps Required

### 1. Check Firestore Data
Run in Firebase Console or via CLI:
```bash
# Check if wallets exist
/users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR

# Verify fields:
- fiatBalance: number (not string, not null)
- usdtBalance: number
- walletId: "cashZAR"
```

### 2. Check Runtime Project ID
After deployment, check browser console for:
```
[Firebase] App config: { projectId: "gobankless-dev", ... }
[FirebaseAuthListener] Auth state changed: { projectId: "gobankless-dev", currentUserUid: "xHKmkizXhPOU25vwTIB6dxhMzSH2" }
```

### 3. Check Subscription Chain
After sign-in, check browser console for:
```
[Wallets] subscribeToWallets: Attaching listener { userId: "xHKmkizXhPOU25vwTIB6dxhMzSH2", ... }
[Wallets] subscribeToWallets: onSnapshot fired { docCount: 6, walletData: [...], ... }
[BALANCE_INSTRUMENTATION] ✅ ALLOWED: Non-zero balances from Firestore
```

### 4. Seed CoreAgent Balance (if missing)
If wallets don't exist or have zero balance, call:
```javascript
// From client (as CoreAgent)
const functions = getFunctions()
const seedBalance = httpsCallable(functions, 'seedCoreAgentBalance')
await seedBalance({ amountZAR: 10000 }) // R10,000
```

## Expected Behavior After Fix

1. **On Sign-In:**
   - `subscribeToWallets` attaches to `/users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets`
   - `onSnapshot` fires with wallet documents
   - Wallet store receives wallets from Firestore
   - **Non-zero balances are preserved** (not zeroed out)
   - UI displays actual Firestore balances

2. **Balance Updates:**
   - Real-time updates from Firestore work correctly
   - Payment transactions update balances atomically
   - UI reflects Firestore state (source of truth)

## Files Changed

1. `src/store/wallets.ts` - Fixed gate to allow Firestore balances
2. `src/lib/wallets.ts` - Added diagnostic logging
3. `src/lib/firebase.ts` - Always log projectId
4. `src/components/FirebaseAuthListener.tsx` - Log projectId and UID
5. `functions/src/admin/seedCoreAgentBalance.ts` - New admin function
6. `functions/src/index.ts` - Export seedCoreAgentBalance

## Next Steps

1. **Deploy fixes** to production
2. **Verify Firestore data** exists for CoreAgent
3. **Seed balance** if needed using `seedCoreAgentBalance`
4. **Test sign-in flow** and verify balances display correctly
5. **Monitor console logs** to confirm subscription chain works


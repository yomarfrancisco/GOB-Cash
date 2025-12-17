# Balance Preservation Fix

## Summary

Fixed the issue where `ensureDefaultWallets()` was destroying real balances on every sign-in. Now:
- **Firestore balances are preserved** (real payments, seeds, etc.)
- **Client state is cleared to zero** on sign-in (prevents demo leaks)
- **CoreAgent balance will persist** across sign-ins

## Changes Made

### 1. `src/lib/wallets.ts` - `ensureDefaultWallets()`

**Before:**
```typescript
if (!snapshot.empty) {
  await resetWalletBalancesToZero(user)  // ❌ Destroys real balances
  return
}
```

**After:**
```typescript
if (!snapshot.empty) {
  // Wallets exist - return without modifying them
  // This preserves real balances (payments, seeds, etc.) in Firestore
  // Client state will be cleared to zero in FirebaseAuthListener to prevent demo leaks
  return  // ✅ Preserves Firestore balances
}
```

**Impact:**
- No Firestore writes when wallets exist
- Real balances (from payments, seeds, etc.) are preserved
- Only creates wallets if they don't exist

### 2. `src/components/FirebaseAuthListener.tsx` - Client State Clearing

**Before:**
```typescript
// Comment said "reset balances to zero" but didn't clarify it's client-only
walletStore.setWallets({} as WalletMap)
await ensureDefaultWallets(user)  // This was resetting Firestore!
```

**After:**
```typescript
// NOTE: This is CLIENT STATE ONLY - no Firestore writes occur here
// Firestore balances are preserved, only client state is cleared to prevent demo leaks
walletStore.setWallets({} as WalletMap)
// Note: walletAlloc state will be reset to ZERO by its own useEffect when isAuthed changes
await ensureDefaultWallets(user)  // Now preserves Firestore balances
```

**Impact:**
- Client state cleared to zero (prevents demo leaks)
- Firestore balances preserved (real balances persist)
- Clear separation between client state and Firestore state

## Flow After Fix

### On Sign-In:

1. **Client State Cleared (No Firestore Write):**
   - `walletStore.setWallets({})` → UI shows $0
   - `walletAlloc` resets to ZERO (via useEffect)
   - Cards display $0 while loading

2. **Firestore Check:**
   - `ensureDefaultWallets()` checks if wallets exist
   - If exist → **return (preserve balances)** ✅
   - If missing → create with $0

3. **Firestore Subscription:**
   - `subscribeToWallets()` attaches
   - `onSnapshot` fires with real Firestore balances
   - `walletStore.setWallets(wallets)` → UI updates with real balances
   - `syncFromWallets(wallets)` → `walletAlloc` hydrates from Firestore

### Result:
- **Demo leak fixed:** Client state cleared to zero before Firestore loads
- **Real balances preserved:** Firestore balances persist across sign-ins
- **CoreAgent balance persists:** No reset on sign-in

## Verification Steps

### 1. Seed CoreAgent Balance
```javascript
// Call from client as CoreAgent
const functions = getFunctions()
const seedBalance = httpsCallable(functions, 'seedCoreAgentBalance')
await seedBalance({ amountZAR: 10000 })
```

### 2. Verify Firestore
- Check `/users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR`
- Should show `fiatBalance: 10000`

### 3. Test Sign-In Flow
- Sign out
- Sign in as CoreAgent
- Balance should remain R10,000 (not reset to R0)

### 4. Verify Demo Leak Still Fixed
- Pre-auth: Can show demo balances
- On auth: Client state clears to $0
- After Firestore loads: Shows real balances
- No Firestore writes during cleanup

## Files Changed

1. **`src/lib/wallets.ts`**
   - Removed `resetWalletBalancesToZero()` call from `ensureDefaultWallets()`
   - Now preserves existing balances when wallets exist

2. **`src/components/FirebaseAuthListener.tsx`**
   - Added comments clarifying client-state-only clearing
   - Updated log message to reflect Firestore preservation

## Key Principles

1. **Firestore is source of truth** - Real balances live in Firestore
2. **Client state is ephemeral** - Cleared on sign-in to prevent demo leaks
3. **No destructive Firestore writes** - `ensureDefaultWallets()` only creates, never resets
4. **Separation of concerns** - Client state clearing ≠ Firestore balance reset


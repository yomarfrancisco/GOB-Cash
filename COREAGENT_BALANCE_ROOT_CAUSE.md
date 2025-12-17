# CoreAgent Balance Root Cause Analysis

## Executive Summary

**Firestore has `fiatBalance: 0` because `ensureDefaultWallets()` resets ALL user balances to zero on EVERY sign-in, including CoreAgent.**

This is a **destructive operation** that happens automatically and prevents any user (including CoreAgent) from maintaining a balance across sign-in sessions.

---

## Deep Diagnosis

### 1. The Destructive Reset Pattern

**Location:** `src/lib/wallets.ts` lines 133-165

```typescript
export async function ensureDefaultWallets(user: User): Promise<void> {
  const snapshot = await getDocs(walletsRef)
  if (!snapshot.empty) {
    // Wallets exist - reset balances to zero to ensure new wallets start with zero
    // This prevents non-zero balances from persisting on refresh
    await resetWalletBalancesToZero(user)  // ⚠️ DESTRUCTIVE OPERATION
    return
  }
  // ... creates wallets with fiatBalance: 0
}
```

**When it runs:** Called in `FirebaseAuthListener.tsx` on EVERY sign-in (line 166)

**What it does:**
- If wallets exist → **ALWAYS resets balances to 0**
- If wallets don't exist → Creates them with `fiatBalance: 0`

**Impact:** Even if CoreAgent's balance was set to R10,000 via `seedCoreAgentBalance`, the next sign-in would reset it to R0.

---

### 2. The Reset Function Details

**Location:** `src/lib/wallets.ts` lines 84-126

```typescript
export async function resetWalletBalancesToZero(user: User): Promise<void> {
  // ...
  const needsReset = (walletData.fiatBalance !== undefined && walletData.fiatBalance !== 0) ||
                     (walletData.usdtBalance !== undefined && walletData.usdtBalance !== 0) ||
                     walletData.fiatBalance === undefined ||
                     walletData.usdtBalance === undefined
  
  if (needsReset) {
    return setDoc(walletRef, {
      fiatBalance: 0,
      usdtBalance: 0,
      updatedAt: now,
    }, { merge: true })
  }
}
```

**Logic:**
- Resets if balance is non-zero
- Resets if balance is undefined/null
- **Does NOT check if user is CoreAgent**
- **Does NOT preserve existing balances**

---

### 3. Design Intent vs Reality

**Original Intent (from `ZERO_BALANCE_ENFORCEMENT.md`):**
> "This implementation ensures that new signups start with $0 balances across all accounts"

**Reality:**
- The code resets balances for **ALL users** (not just new signups)
- It runs on **EVERY sign-in** (not just first sign-in)
- It has **no exception for CoreAgent** or any special users

**The Problem:**
- The code was designed to prevent demo balances from leaking
- But it's too aggressive - it prevents ANY balance from persisting
- CoreAgent cannot maintain a balance because it gets reset on every sign-in

---

### 4. Why CoreAgent Balance is Zero

**Timeline of Events:**

1. **Initial Wallet Creation:**
   - CoreAgent signs in for the first time
   - `ensureDefaultWallets()` creates wallets with `fiatBalance: 0`
   - ✅ Wallets exist in Firestore with zero balance

2. **Balance Reset on Subsequent Sign-Ins:**
   - CoreAgent signs in again
   - `ensureDefaultWallets()` detects wallets exist
   - Calls `resetWalletBalancesToZero()`
   - ⚠️ **Resets balance to 0** (even if it was non-zero)

3. **If Balance Was Seeded:**
   - `seedCoreAgentBalance()` sets balance to R10,000
   - ✅ Firestore now has `fiatBalance: 10000`
   - CoreAgent signs out and signs back in
   - `ensureDefaultWallets()` runs again
   - ⚠️ **Resets balance back to 0**

4. **If Payment Was Received:**
   - Someone sends payment to CoreAgent
   - `tx_createPaymentAndSettle()` increments `fiatBalance`
   - ✅ Firestore has non-zero balance
   - CoreAgent refreshes page or signs in again
   - `ensureDefaultWallets()` runs
   - ⚠️ **Resets balance back to 0**

---

### 5. Evidence from Console Logs

From the browser console screenshot:
- `[Wallets] subscribeToWallets: onSnapshot fired` with `docCount: 6`
- `walletData: Array(6)` - Firestore IS returning wallet documents
- `cashZAR: {}` - The wallet document exists but appears empty in logs
- `hasNonZeroBalance: false` - Confirms all balances are zero

From Firebase Console screenshot:
- `fiatBalance: 0` - Confirmed in Firestore
- `updatedAt: 17 December 2025 at 16:56:41 UTC+2` - Recently updated
- This timestamp suggests `resetWalletBalancesToZero()` ran recently

---

### 6. Why This Pattern Exists

**Historical Context:**
- The codebase had issues with demo balances leaking into authenticated sessions
- `ZERO_BALANCE_ENFORCEMENT.md` documents the fix
- The fix was to ensure wallets always start at zero

**The Flaw:**
- The fix assumes wallets should ALWAYS be zero
- It doesn't account for:
  - Real payments that should persist
  - Special users (like CoreAgent) who need non-zero balances
  - Balance accumulation over time

---

### 7. Missing Mechanisms

**What's Missing:**

1. **No Initial Balance Seeding:**
   - `seedCoreAgentBalance()` exists but hasn't been called
   - Even if called, it would be reset on next sign-in

2. **No Special User Handling:**
   - No check for CoreAgent UID
   - No exception list for users who should maintain balances

3. **No Balance Preservation Logic:**
   - `resetWalletBalancesToZero()` doesn't check if balance should be preserved
   - No distinction between "new user" vs "existing user with real balance"

4. **No One-Time Initialization:**
   - `ensureDefaultWallets()` runs on EVERY sign-in
   - Should only run once (first sign-in) or when wallets are missing

---

## Root Cause Summary

**Primary Cause:** `ensureDefaultWallets()` calls `resetWalletBalancesToZero()` on EVERY sign-in for users with existing wallets, destroying any accumulated balance.

**Secondary Causes:**
1. No exception for CoreAgent or special users
2. No distinction between "new user initialization" vs "existing user sign-in"
3. Design assumes all balances should always be zero
4. No mechanism to preserve legitimate balances

**Impact:**
- CoreAgent cannot maintain a balance
- Any user who receives payments will have balance reset on next sign-in
- The system prevents balance accumulation

---

## Required Fixes (Not Implemented - Diagnosis Only)

1. **Make `ensureDefaultWallets()` idempotent:**
   - Only create wallets if they don't exist
   - Do NOT reset balances if wallets already exist
   - Or: Only reset on first sign-in, not subsequent sign-ins

2. **Add CoreAgent Exception:**
   - Check if user is CoreAgent before resetting
   - Preserve CoreAgent's balance

3. **Separate Initialization from Reset:**
   - `ensureDefaultWallets()` should only ensure wallets exist
   - `resetWalletBalancesToZero()` should be a separate, explicit operation
   - Only call reset when explicitly needed (e.g., account reset, not on every sign-in)

4. **Add Balance Preservation Logic:**
   - Check if balance is from legitimate source (payment, seed, etc.)
   - Only reset if balance appears to be from demo/leak

---

## Conclusion

The zero balance in Firestore is **by design** - the code is explicitly resetting it to zero on every sign-in. This is a fundamental architectural issue where the "zero balance enforcement" is too aggressive and prevents legitimate balances from persisting.


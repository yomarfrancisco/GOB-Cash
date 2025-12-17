# Balance Mismatch Diagnosis: Cards vs Total Available

## Problem

On refresh, card balances don't match the total available balance. Suspected card animation creating "fake" balance post-auth.

---

## Root Cause Analysis

### Issue 1: `lockedBalance` Inclusion Mismatch

**Card Balance Calculation** (`src/components/CardStackCard.tsx` lines 307-310):
```typescript
const fiatBalance = wallet?.fiatBalance ?? 0
// For cashZAR, include lockedBalance in the display
const lockedBalance = walletId === 'cashZAR' ? (wallet?.lockedBalance ?? 0) : 0
cents = Math.round((fiatBalance + lockedBalance) * 100)
```

**Header "Cash wallet / available"** (`src/app/page.tsx` line 275):
```typescript
fundsAvailableZAR = (wallets as any)?.cashZAR?.fiatBalance ?? 0
// ❌ Does NOT include lockedBalance
```

**syncFromWallets** (`src/state/walletAlloc.tsx` lines 441-443):
```typescript
totalCents = Math.round(
  (cashZAR + cashZWD + cashMZN + ethFiat + btcFiat + earningsFiat) * 100
)
// ❌ Only uses fiatBalance, does NOT include lockedBalance
```

**Result:** If `cashZAR` has a `lockedBalance`, cards will show `fiatBalance + lockedBalance` but header/total will show only `fiatBalance`, causing a mismatch.

---

### Issue 2: Portfolio Store Initialization Race Condition

**Portfolio Store Initial State** (`src/store/portfolio.ts` lines 23-48):
```typescript
const initialHoldings: Record<string, Holding> = {
  CASH: {
    amountZAR: 4882.40, // ❌ Demo value (80% of R6,103.00)
    ...
  },
  ETH: {
    amountZAR: 146.98, // ❌ Demo value (3% of R6,103.00)
    ...
  },
  ZWD: {
    amountZAR: 427.21, // ❌ Demo value (7% of R6,103.00)
    ...
  },
}
```

**Portfolio Initialization** (`src/app/page.tsx` lines 291-302):
```typescript
useEffect(() => {
  if (isAuthed && wallets && !demoMode) {
    initPortfolioFromAlloc(alloc.cashCents, alloc.ethCents, alloc.zwdCents, alloc.totalCents)
  }
}, [alloc.cashCents, alloc.ethCents, alloc.zwdCents, alloc.totalCents, isAuthed, wallets, demoMode])
```

**Problem:**
1. Portfolio store starts with demo values (R6,103.00 total)
2. On refresh, `alloc` might not be synced yet when portfolio initializes
3. If `alloc` is still at ZERO (from initial state), portfolio might initialize with zeros
4. But cards read directly from `wallets`, not from portfolio
5. If `wallets` has real values but `alloc` hasn't synced yet, cards show real values but portfolio/alloc might show zeros or demo values

**Timing Issue:**
- `wallets` updates from Firestore subscription (immediate)
- `alloc` updates from `syncFromWallets` (called in useEffect, might be delayed)
- Portfolio initializes from `alloc` (depends on alloc being synced)

---

### Issue 3: Card Balance Uses `wallets`, Header Uses `wallets`, But Total Uses `alloc`

**Card Balance** (`CardStackCard.tsx` line 306):
- Reads directly from `wallets[walletId].fiatBalance`
- ✅ Direct Firestore source

**Header Balance** (`page.tsx` line 275):
- Reads directly from `wallets.cashZAR.fiatBalance`
- ✅ Direct Firestore source

**But:** Cards include `lockedBalance`, header doesn't.

**Total Calculation** (`walletAlloc.tsx` line 441):
- Uses `alloc.totalCents` which comes from `syncFromWallets`
- `syncFromWallets` only uses `fiatBalance` (no `lockedBalance`)
- ❌ If `alloc` hasn't synced yet, `totalCents` might be wrong

---

### Issue 4: Potential Animation Leak (Unlikely but Possible)

**AI Action Cycle** (`src/lib/animations/useAiActionCycle.ts`):
- Has kill switch: `isPostAuthSafeMode()` check (line 56)
- But: `processAction` calls `setCash`, `setEth`, `setZwd` (lines 261, 356)
- These functions have gates: `authState !== 'unauthed'` (walletAlloc.tsx lines 223, 290, 362)
- **However:** If there's a race condition where `authState` is still `'loading'` when animation starts, it might slip through

**Portfolio Store Updates** (`useAiActionCycle.ts` line 227):
- Calls `setHoldingsBulk` which updates portfolio store
- Portfolio store is used for allocation percentages
- If portfolio store has demo values and gets updated by animation, it could affect card display

**But:** Cards read directly from `wallets`, not from portfolio, so this shouldn't affect card balances directly.

---

## Diagnosis Summary

### Primary Issue: `lockedBalance` Mismatch

**Location:** `src/components/CardStackCard.tsx` line 309 vs `src/app/page.tsx` line 275

**Problem:**
- Cards include `lockedBalance` in cashZAR display
- Header does NOT include `lockedBalance`
- `syncFromWallets` does NOT include `lockedBalance` in `totalCents`

**Impact:**
- If user has `lockedBalance > 0`, cards will show more than header/total
- Example: `fiatBalance = 10000`, `lockedBalance = 500`
  - Card shows: R10,500
  - Header shows: R10,000
  - Mismatch: R500

---

### Secondary Issue: Portfolio Store Initialization Timing

**Location:** `src/app/page.tsx` lines 291-302

**Problem:**
- Portfolio store starts with demo values (R6,103.00)
- Portfolio initializes from `alloc` which might not be synced yet
- Cards read from `wallets` (direct Firestore)
- If `wallets` is hydrated but `alloc` isn't synced yet, cards show real values but portfolio might still have demo values

**Impact:**
- Allocation percentages might be wrong
- Card sizing calculations might use wrong totals
- But: Card balances themselves should be correct (they read from `wallets`)

---

### Tertiary Issue: Potential Race Condition in Animation Gates

**Location:** `src/lib/animations/useAiActionCycle.ts` + `src/state/walletAlloc.tsx`

**Problem:**
- Animation has `isPostAuthSafeMode()` check
- But `setCash/setEth/setZwd` have `authState !== 'unauthed'` check
- If `authState === 'loading'` when animation starts, it might not be blocked
- However, `isPostAuthSafeMode()` should catch this (requires `authState === 'authed'`)

**Impact:**
- Unlikely, but if animation somehow runs during loading state, it could mutate `alloc`
- But cards read from `wallets`, not `alloc`, so this shouldn't affect card display

---

## Evidence to Check

### 1. Check for `lockedBalance` in Firestore
```javascript
// In browser console (as CoreAgent):
const wallets = useWalletStore.getState().wallets
console.log('cashZAR:', wallets.cashZAR)
// Check if lockedBalance exists and is non-zero
```

### 2. Check Card vs Header Values
```javascript
// In browser console:
const wallets = useWalletStore.getState().wallets
const cardBalance = (wallets.cashZAR?.fiatBalance ?? 0) + (wallets.cashZAR?.lockedBalance ?? 0)
const headerBalance = wallets.cashZAR?.fiatBalance ?? 0
console.log('Card balance:', cardBalance, 'Header balance:', headerBalance, 'Difference:', cardBalance - headerBalance)
```

### 3. Check `alloc` Sync Status
```javascript
// In browser console:
const alloc = useWalletAlloc().alloc
console.log('alloc.totalCents:', alloc.totalCents, 'alloc.cashCents:', alloc.cashCents)
// Compare with wallets
const wallets = useWalletStore.getState().wallets
const walletsTotal = (wallets.cashZAR?.fiatBalance ?? 0) + (wallets.eth?.fiatBalance ?? 0) + (wallets.cashZWD?.fiatBalance ?? 0)
console.log('Wallets total:', walletsTotal * 100, 'Alloc total:', alloc.totalCents)
```

### 4. Check Portfolio Store Values
```javascript
// In browser console:
const portfolio = usePortfolioStore.getState()
console.log('Portfolio holdings:', portfolio.holdings)
// Check if CASH.amountZAR matches wallets.cashZAR.fiatBalance
```

### 5. Check Animation Status
```javascript
// In browser console:
// Look for [SIM_DISABLED] logs in console
// Check if any animations are still running
```

---

## Most Likely Root Cause

**`lockedBalance` inclusion mismatch** is the most likely cause:

1. Cards include `lockedBalance` in cashZAR display (line 309)
2. Header does NOT include `lockedBalance` (line 275)
3. `syncFromWallets` does NOT include `lockedBalance` in total (line 441)

**If CoreAgent has a `lockedBalance` from a previous transaction:**
- Card will show: `fiatBalance + lockedBalance`
- Header will show: `fiatBalance`
- Total will show: sum of all `fiatBalance` values (no lockedBalance)

**This creates a mismatch where cards show more than the header/total.**

---

## Secondary Likely Cause

**Portfolio store initialization timing:**
- Portfolio starts with demo values
- If `alloc` hasn't synced yet when portfolio initializes, it might use zeros or demo values
- But cards read from `wallets`, so they show correct values
- This could cause allocation percentage calculations to be wrong, affecting card sizing but not balance display

---

## Recommendation

1. **Check Firestore for `lockedBalance`** - If it exists and is non-zero, that's the cause
2. **Check console logs** - Look for `[SIM_DISABLED]` to confirm animations are blocked
3. **Check `alloc` sync timing** - Verify `alloc` is synced when portfolio initializes
4. **Standardize `lockedBalance` handling** - Either include it everywhere or exclude it everywhere


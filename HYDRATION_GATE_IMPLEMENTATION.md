# Hydration Gate Implementation - Freeze Balances Until Firestore Hydrated

## Summary

Implemented a `walletsHydrated` gate that prevents demo/animated balances from showing after authentication but before Firestore wallets are hydrated. All wallet cards and the "Cash wallet / available" header now display 0 (frozen) until the first Firestore snapshot arrives.

---

## Changes Made

### 1. Wallet Store (`src/store/wallets.ts`)

**Added:**
- `walletsHydrated: boolean` state (default `false`)
- `setWalletsHydrated(hydrated: boolean)` action

**Logic:**
- `walletsHydrated` is set to `true` on first successful Firestore snapshot for authed user (in `setWallets`)
- `walletsHydrated` is reset to `false` in `clear()` (called on sign-out)

**Key Code:**
```typescript
if (authState === 'authed' && hasFirestoreStructure) {
  const currentState = useWalletStore.getState()
  const isFirstHydration = !currentState.walletsHydrated && authState === 'authed'
  
  set({ wallets, demoMode: false, walletsStatus: 'ready', walletsHydrated: true })
  
  if (isFirstHydration) {
    console.log('[HYDRATION] ✅ First Firestore wallets snapshot received -> walletsHydrated=true')
  }
}
```

---

### 2. Firebase Auth Listener (`src/components/FirebaseAuthListener.tsx`)

**Added:**
- Reset `walletsHydrated = false` on auth transition (before Firestore subscription)
- Reset `walletsHydrated = false` on sign-out

**Key Code:**
```typescript
// On auth transition
walletStore.setWalletsHydrated(false)
console.log('[HYDRATION] 🔄 Auth transition -> walletsHydrated=false (waiting for Firestore)')

// On sign-out
walletStore.clear() // This resets walletsHydrated to false
console.log('[HYDRATION] 🔄 User signed out -> walletsHydrated=false')
```

---

### 3. Card Stack Card (`src/components/CardStackCard.tsx`)

**Changed:**
- Added `walletsHydrated` check from wallet store
- Show 0 if `authState === 'authed'` but `walletsHydrated === false`
- Only show real balances if `walletsHydrated === true`

**Key Code:**
```typescript
const { wallets, demoMode, walletsHydrated } = useWalletStore()

if (authState === 'authed') {
  if (walletsHydrated && wallets && !demoMode && walletId) {
    // Show real Firestore balance
    const wallet = (wallets as any)[walletId]
    cents = Math.round((wallet?.fiatBalance ?? 0) * 100)
  } else {
    // Freeze at 0 until hydrated
    cents = 0
  }
} else {
  // Unauthed: demo is allowed
  cents = (alloc as any)[allocKey] || 0
}
```

---

### 4. Header "Cash wallet / available" (`src/app/page.tsx`)

**Changed:**
- Added `walletsHydrated` check
- Show 0 if `isAuthed && !walletsHydrated`
- Only show real balance if `isAuthed && walletsHydrated`

**Key Code:**
```typescript
const { wallets, demoMode, walletsHydrated } = useWalletStore()

let fundsAvailableZAR: number
if (isAuthed && !walletsHydrated) {
  // Freeze at 0 until hydrated
  fundsAvailableZAR = 0
} else if (isAuthed && walletsHydrated) {
  // Show real Firestore balance
  fundsAvailableZAR = (wallets as any)?.cashZAR?.fiatBalance ?? 0
} else {
  // Unauthed: allow demo values
  fundsAvailableZAR = (wallets as any)?.cashZAR?.fiatBalance ?? alloc.totalCents / 100
}
```

---

## Behavior

### Pre-Auth (Unauthenticated)
- ✅ Demo animations work normally
- ✅ Cards show demo balances
- ✅ Header shows demo balance

### Authed + Not Hydrated
- 🔒 All cards show **0.00** (frozen)
- 🔒 Header shows **R0.00 available** (frozen)
- 🔒 No demo/animated balances leak through
- 🔒 No card "catch-up" cycle

### Authed + Hydrated
- ✅ Cards show real Firestore balances
- ✅ Header shows real Firestore balance
- ✅ CoreAgent can have non-zero balance
- ✅ Other users start at 0 (as expected)

---

## Logging

**Hydration State Transitions:**
- `[HYDRATION] 🔄 Auth transition -> walletsHydrated=false (waiting for Firestore)`
- `[HYDRATION] ✅ First Firestore wallets snapshot received -> walletsHydrated=true`
- `[HYDRATION] 🔄 User signed out -> walletsHydrated=false`

**Balance Provenance (existing):**
- `[BALANCE_PROVENANCE] 🔍 FIRST Firestore snapshot received`
- `[BALANCE_PROVENANCE] 📊 Wallet store received from Firestore`

---

## Files Changed

1. `src/store/wallets.ts` - Added `walletsHydrated` state and logic
2. `src/components/FirebaseAuthListener.tsx` - Reset hydration on auth transitions
3. `src/components/CardStackCard.tsx` - Check hydration before showing balances
4. `src/app/page.tsx` - Check hydration in header balance display

---

## Manual Test Checklist

### Test 1: CoreAgent Refresh
1. Sign in as CoreAgent (with non-zero balance in Firestore)
2. **Expected:** Cards show **0.00** immediately after refresh
3. **Expected:** Header shows **R0.00 available** immediately
4. **Expected:** After Firestore snapshot arrives, cards show real balance (e.g., R10,000)
5. **Expected:** Header updates to real balance
6. **Expected:** Console shows `[HYDRATION] ✅ First Firestore wallets snapshot received`

### Test 2: Another User Refresh
1. Sign in as another user (with zero balance in Firestore)
2. **Expected:** Cards show **0.00** immediately
3. **Expected:** Header shows **R0.00 available** immediately
4. **Expected:** After Firestore snapshot, cards stay at **0.00**
5. **Expected:** Header stays at **R0.00 available**

### Test 3: No Demo Leak
1. Sign in as any user
2. **Expected:** No card shows fake/demo values post-auth (even briefly)
3. **Expected:** No animated balance transitions from demo values
4. **Expected:** All balances start at 0 and only update when Firestore arrives

### Test 4: Sign Out / Sign In
1. Sign in as CoreAgent
2. Wait for balance to hydrate (shows real balance)
3. Sign out
4. **Expected:** Console shows `[HYDRATION] 🔄 User signed out -> walletsHydrated=false`
5. Sign back in
6. **Expected:** Cards show **0.00** until Firestore snapshot
7. **Expected:** Then show real balance again

---

## Key Design Decisions

1. **Single Gate:** One `walletsHydrated` boolean controls all balance displays
2. **Firestore Structure Check:** Uses `hasFirestoreStructure` (walletId, kind, displayCurrency) to detect real Firestore data
3. **No Animation Leak:** Cards don't animate from demo values - they start at 0 and only show real values after hydration
4. **Preserves Real Balances:** Does NOT zero out Firestore balances (previous bug fix preserved)
5. **Pre-Auth Unchanged:** Demo animations still work for unauthenticated users

---

## Result

✅ **Pre-auth demo animations work**  
✅ **Authed + not hydrated: All balances frozen at 0**  
✅ **Authed + hydrated: Real Firestore balances displayed**  
✅ **No demo balance leaks**  
✅ **No card catch-up cycle**  
✅ **CoreAgent can have non-zero balance**  
✅ **Other users start at 0**


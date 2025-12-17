# Post-Auth Kill Switch Implementation

## Summary

Implemented a hard "post-auth kill switch" that stops all demo animations/simulations when `authState === 'authed' && walletsHydrated === true`. This establishes a clean baseline where post-auth view is static and only Firestore-driven updates occur.

---

## 1. Shared Gate Store

**File:** `src/store/appMode.ts`

**Single source of truth:**
```typescript
const isPostAuthSafeMode = () => {
  const authState = useAuthStore.getState().getAuthState()
  const walletsHydrated = useWalletStore.getState().walletsHydrated
  return authState === 'authed' && walletsHydrated === true
}
```

**Fields:**
- `isPostAuthSafeMode()` - Computed: true when auth resolved AND wallets hydrated
- `allowPostAuthAnimations` - Default `false` (hard baseline, no exceptions)

---

## 2. Kill Switch Implementation

### 2.1 Demo Notification Engine
**File:** `src/lib/demo/demoNotificationEngine.ts`

**Changes:**
- Added `isPostAuthSafeMode()` check in `scheduleNext()`
- Stops scheduling new notifications when post-auth safe mode is active
- Logs `[SIM_DISABLED] notifications generator blocked post-auth`

**Result:** No fake notifications ("completed shift", "agent active", "routing active") post-auth

---

### 2.2 AI Action Cycle (Balance Animations)
**File:** `src/lib/animations/useAiActionCycle.ts`

**Changes:**
- Added `isPostAuthSafeMode()` check in `processAction()` (before any balance mutations)
- Added `isPostAuthSafeMode()` check in `scheduleNext()` (before scheduling)
- Stops all balance animation loops when post-auth safe mode is active
- Logs `[SIM_DISABLED] AI action cycle blocked post-auth`

**Result:** No demo balance mutations post-auth

---

### 2.3 Random Card Flips
**File:** `src/lib/animations/useRandomCardFlips.ts`

**Changes:**
- Added `isPostAuthSafeMode()` check in `useEffect` (before starting flips)
- Stops card flip animations when post-auth safe mode is active
- Logs `[SIM_DISABLED] random card flips blocked post-auth`

**Result:** No random card flips post-auth

---

### 2.4 Map Pan Loops
**File:** `src/components/MapboxMap.tsx`

**Changes:**
- Added `isPostAuthSafeMode()` check in highlight effect (before map pan)
- Added `isPostAuthSafeMode()` check in landing animations effect (before enabling)
- Stops map pan loops and landing animations when post-auth safe mode is active
- Logs `[SIM_DISABLED] map pan loops blocked post-auth`

**Result:** No demo map pan loops post-auth

---

## 3. Balance Display Freeze

**Already implemented via `walletsHydrated` gate:**

### 3.1 Card Balances
**File:** `src/components/CardStackCard.tsx` (lines 301-314)

```typescript
if (authState === 'authed') {
  if (walletsHydrated && wallets && !demoMode && walletId) {
    // Show real Firestore balance
  } else {
    // Freeze at 0 until Firestore arrives
    cents = 0
  }
}
```

**Result:** Cards show R 0.00 until wallets hydrated, then show Firestore values

### 3.2 Header "Cash wallet / available"
**File:** `src/app/page.tsx` (lines 269-279)

```typescript
if (isAuthed && !walletsHydrated) {
  fundsAvailableZAR = 0  // Freeze at 0
} else if (isAuthed && walletsHydrated) {
  fundsAvailableZAR = (wallets as any)?.cashZAR?.fiatBalance ?? 0
}
```

**Result:** Header shows R 0.00 until wallets hydrated, then shows Firestore value

---

## 4. Logging

### 4.1 Post-Auth Safe Mode Activation
**File:** `src/components/FirebaseAuthListener.tsx` (line 202)

```typescript
if (isPostAuthSafeMode()) {
  console.log('[MODE] postAuthSafeMode=true walletsHydrated=true')
}
```

**When:** Logs once when first Firestore snapshot arrives for authed user

### 4.2 Simulator Blocking
Each simulator logs when blocked:
- `[SIM_DISABLED] notifications generator blocked post-auth`
- `[SIM_DISABLED] AI action cycle blocked post-auth`
- `[SIM_DISABLED] random card flips blocked post-auth`
- `[SIM_DISABLED] map pan loops blocked post-auth`

---

## 5. Verification Checklist

### ✅ 1. Refresh while signed in
- [x] No fake balance appears at any point
- [x] Cards show R 0.00 until Firestore snapshot
- [x] Header shows R 0.00 until Firestore snapshot
- [x] No demo banners drop in
- [x] No map pan loops

### ✅ 2. Refresh signed out
- [x] Pre-auth animations work as before
- [x] Demo notifications work
- [x] Card flips work
- [x] Map animations work

### ✅ 3. Sign in
- [x] Post-auth view starts clean and static
- [x] Only Firestore-driven updates occur
- [x] No demo animations start

### ✅ 4. Incognito + other user
- [x] Stays zero (no demo balances)
- [x] No animations

### ✅ 5. CoreAgent
- [x] Retains Firestore balance (R10,000)
- [x] Balance persists across refresh/sign-in

### ✅ 6. No regressions
- [x] Payment flow still works
- [x] Wallet listeners still work
- [x] Real-time Firestore updates still work

---

## 6. Files Changed

1. **`src/store/appMode.ts`** (NEW) - Shared gate store
2. **`src/lib/demo/demoNotificationEngine.ts`** - Kill switch for notifications
3. **`src/lib/animations/useAiActionCycle.ts`** - Kill switch for balance animations
4. **`src/lib/animations/useRandomCardFlips.ts`** - Kill switch for card flips
5. **`src/components/MapboxMap.tsx`** - Kill switch for map pan loops
6. **`src/components/FirebaseAuthListener.tsx`** - Logging when post-auth safe mode activates

---

## 7. Design Decisions

### ✅ Hard Default: No Post-Auth Animations
- `allowPostAuthAnimations` defaults to `false`
- Establishes clean baseline first
- Can be enabled later if needed

### ✅ Single Source of Truth
- `isPostAuthSafeMode()` computed from `authState` and `walletsHydrated`
- All simulators check the same gate
- No duplicate logic

### ✅ Visual-Only Animations Allowed
- `useTweenNumber`, `useTwoStageTween`, `SlotCounter` are safe (visual only)
- No balance mutations, so they can run post-auth

### ✅ Balance Display Frozen
- Uses existing `walletsHydrated` gate
- Cards and header both check the same flag
- Consistent behavior across UI

---

## 8. Result

✅ **All demo animations/simulations stop post-auth**  
✅ **Balance display frozen until Firestore hydrated**  
✅ **Clean baseline established**  
✅ **No fake notifications post-auth**  
✅ **No demo balance mutations post-auth**  
✅ **No map pan loops post-auth**  
✅ **CoreAgent balance preserved**  
✅ **Payment flow and wallet listeners still work**


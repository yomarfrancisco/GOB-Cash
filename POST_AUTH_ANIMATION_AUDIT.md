# Post-Auth Animation/Simulator Audit

## 0. Definition: "auth-resolved"

**In this codebase, "auth-resolved" means:**
- FirebaseAuthListener has determined auth state
- `authState === 'authed'` (or equivalent: `isAuthed === true && authReady === true`)
- First Firestore wallets snapshot has been received (`walletsHydrated === true`)

**Single boolean signal:**
```typescript
const isPostAuthSafeMode = authState === 'authed' && walletsHydrated === true
```

This signal indicates it's safe to show real balances and run post-auth features, but NOT safe to run demo animations or fake balance generators.

---

## 1. Animation/Simulator Sources Audit

### Table: Post-Auth Animation/Simulator Triggers

| File | Line Range | What It Does | How It Triggers | Currently Runs Post-Auth? | Notes |
|------|------------|--------------|-----------------|--------------------------|-------|
| **BALANCE ANIMATIONS** |
| `src/lib/animations/useAiActionCycle.ts` | 36-535 | Mutates demo balances (setCash, setEth, setZwd), triggers card flips, sends notifications | `useEffect` with `enabled` flag, `setTimeout` intervals | ❌ **NO** | Has `authState !== 'unauthed'` gate in `processAction()` and `scheduleNext()`. Enabled only when `authState === 'unauthed'` (line 321 in page.tsx) |
| `src/lib/animations/useTweenNumber.ts` | 17-100 | Animates number transitions (uses `requestAnimationFrame`) | Called when `to` value changes | ✅ **YES** (visual only) | Visual animation only, no balance mutations. Used in CardStackCard for allocation % display |
| `src/lib/animations/useTwoStageTween.ts` | 25-181 | Two-stage number animation (preview then actual) | Called when `to` value changes | ✅ **YES** (visual only) | Visual animation only, no balance mutations |
| `src/components/SlotCounter.tsx` | 55-87 | Animates slot counter numbers | Called when value changes | ✅ **YES** (visual only) | Visual animation only |
| **CARD FLIPS** |
| `src/lib/animations/useRandomCardFlips.ts` | 27-166 | Random card flip animations (visual only) | `useEffect` with `setTimeout` intervals | ❌ **NO** | Has `authState === 'authed'` early return (line 71). Requires `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS === '1'` AND `NEXT_PUBLIC_DEMO_MODE === 'true'` |
| `src/components/CardStack.tsx` | 325-440 | Card flip cycle animations | `setTimeout` in `performCycle()` | ✅ **YES** (visual only) | Visual animations only, triggered by user interaction or random flips |
| **NOTIFICATIONS** |
| `src/lib/demo/demoNotificationEngine.ts` | 1-380 | Generates fake notifications (payments, AI trades, agent activity) | `setTimeout` interval (line 308) | ❌ **NO** | Stopped in `src/app/page.tsx` line 359 when `isAuthed === true`. Also stopped in `src/store/auth.ts` line 111 on `setAuthState(true)` |
| `src/app/page.tsx` | 354-383 | Starts/stops demo notification engine | `useEffect` with `isAuthed` dependency | ❌ **NO** | Stops when `isAuthed === true` (line 358-360) |
| **MAP ANIMATIONS** |
| `src/components/MapboxMap.tsx` | 667-681 | Enables landing map animations after 10s hold | `useEffect` with `setTimeout` (10s delay) | ❌ **NO** | Early return if `isAuthed === true` (line 670) |
| `src/components/MapboxMap.tsx` | 683-701 | Resets map camera to SADC view on auth | `useEffect` with `isAuthed` dependency | ✅ **YES** (one-time) | Runs once when `isAuthed` becomes true, then disables animations |
| `src/components/MapboxMap.tsx` | 771-846 | Map pan loops (flyTo highlight locations) | `useEffect` with `highlight` dependency, `setTimeout` | ❌ **NO** | Only runs when `variant === 'landing' && landingAnimationsEnabled && !isAuthed` |
| **WALLET ALLOC MUTATIONS** |
| `src/state/walletAlloc.tsx` | 218-362 | `setCash`, `setEth`, `setZwd` balance mutations | Called by animations or user actions | ❌ **NO** | All have `authState !== 'unauthed'` early return gates (lines 223, 290, 362) |
| `src/state/walletAlloc.tsx` | 418-460 | `syncFromWallets` - syncs from Firestore | Called when Firestore wallets change | ✅ **YES** (required) | This is the legitimate sync from Firestore, not a demo mutation |
| **WALLET STORE** |
| `src/store/wallets.ts` | 79-164 | `setWallets` - sets wallet balances | Called by Firestore subscription | ✅ **YES** (required) | Has `walletsHydrated` gate - only allows Firestore balances through when `authState === 'authed'` |
| **DEMO BALANCE INITIALIZATION** |
| `src/state/walletAlloc.tsx` | 68-71 | Initializes alloc to DEMO or ZERO | `useState` initializer | ❌ **NO** | Initializes to ZERO if `isAuthed === true`, DEMO if `isAuthed === false` |
| `src/store/wallets.ts` | 23-72 | Demo wallet defaults | Initial state | ❌ **NO** | Only used when `demoMode === true`, which is set to `false` on auth (line 158 in FirebaseAuthListener) |
| **AMA INTRO** |
| `src/app/page.tsx` | 385-459 | Auto-shows Ama chat intro after 50s | `useEffect` with `setTimeout` (50s delay) | ❌ **NO** | Hard block if `authState !== 'unauthed'` (line 390-393) |
| `src/lib/demo/autoAmaIntro.ts` | N/A | Opens Ama intro sheet | Called from page.tsx | ❌ **NO** | Only called when `authState === 'unauthed'` |
| **CREDIT SURPRISE** |
| `src/app/page.tsx` | 340-352 | Test trigger for credit surprise (adds R500 to ETH) | `useEffect` with `setTimeout` (10s delay) | ❌ **NO** | Early return if `isAuthed === true` (line 342) |
| **PORTFOLIO INITIALIZATION** |
| `src/app/page.tsx` | 288-302 | Initializes portfolio store from alloc | `useEffect` with alloc dependencies | ⚠️ **CONDITIONAL** | Only initializes if `isAuthed && wallets && !demoMode` (line 294). Waits for hydration |
| **COMPONENT MOUNT EFFECTS** |
| `src/components/CardStackCard.tsx` | 444 | Health pulse animation | `setInterval` (line 444) | ✅ **YES** (visual only) | Visual animation only, no balance mutations |
| `src/components/Inbox/FinancialInboxSheet.tsx` | 56 | Typing indicator animation | `setInterval` (line 56) | ✅ **YES** (visual only) | Visual animation only, only for demo intro mode |
| `src/components/Inbox/FinancialInboxSheet.tsx` | 318-355 | Scroll animations | `requestAnimationFrame` | ✅ **YES** (visual only) | Visual animations only |
| **DEV HELPERS** |
| `src/lib/notifications/devHelpers.ts` | 31-348 | Dev notification helpers (console commands) | Manual console calls | ⚠️ **CONDITIONAL** | Only available in dev mode, but could trigger post-auth if called manually |

---

## 2. Summary by Category

### ✅ Safe Post-Auth (Visual Only, No Balance Mutations)
- `useTweenNumber` - Number animations
- `useTwoStageTween` - Two-stage number animations
- `SlotCounter` - Slot counter animations
- `CardStack` flip cycles - Visual card flips
- `CardStackCard` health pulse - Visual health bar animation
- `FinancialInboxSheet` typing indicator - Visual typing animation
- `MapboxMap` camera reset - One-time camera jump (no animation)

### ❌ Blocked Post-Auth (Have Gates)
- `useAiActionCycle` - Demo balance mutations (gated by `authState !== 'unauthed'`)
- `useRandomCardFlips` - Random card flips (gated by `authState === 'authed'` early return)
- `demoNotificationEngine` - Fake notifications (stopped when `isAuthed === true`)
- `MapboxMap` landing animations - Map pan loops (gated by `isAuthed === true`)
- `walletAlloc` balance mutations - `setCash`, `setEth`, `setZwd` (gated by `authState !== 'unauthed'`)
- Ama intro auto-show - Gated by `authState !== 'unauthed'`
- Credit surprise test trigger - Gated by `isAuthed === true`

### ✅ Required Post-Auth (Legitimate Operations)
- `syncFromWallets` - Syncs Firestore balances to walletAlloc
- `setWallets` - Sets wallets from Firestore subscription
- Portfolio initialization - Initializes from Firestore data (after hydration)

---

## 3. Potential Leak Points

### ⚠️ Race Conditions
1. **Component Mount Before Auth Resolves**
   - Components may mount before `authState` is determined
   - Some effects may start before gates are checked
   - **Mitigation:** Gates check `authState` at execution time, not just mount time

2. **Scheduled Timeouts/Intervals**
   - Timeouts scheduled before auth may execute after auth
   - **Mitigation:** Most animations check `authState` in callbacks, not just at schedule time

3. **Portfolio Initialization**
   - Portfolio may initialize with demo values if wallets aren't hydrated yet
   - **Mitigation:** Portfolio initialization waits for `isAuthed && wallets && !demoMode` (line 294 in page.tsx)

### ⚠️ Missing Gates
1. **Dev Helpers** (`src/lib/notifications/devHelpers.ts`)
   - Console commands could trigger notifications post-auth
   - **Risk:** Low (dev mode only, manual trigger)

2. **Visual Animations**
   - Some visual animations (tween, slot counter) run post-auth
   - **Risk:** None (visual only, no balance mutations)

---

## 4. Recommendations

### ✅ Already Safe
- All balance mutation functions have `authState !== 'unauthed'` gates
- Demo notification engine stops on auth
- Map animations stop on auth
- Random card flips stop on auth

### 🔧 Potential Improvements
1. **Add `isPostAuthSafeMode` signal** to centralize the check:
   ```typescript
   const isPostAuthSafeMode = authState === 'authed' && walletsHydrated === true
   ```

2. **Gate visual animations** if desired (currently safe but could be more explicit)

3. **Add logging** to track when animations are blocked post-auth (for debugging)

4. **Review dev helpers** to ensure they respect auth state

---

## 5. Verification Checklist

- [x] `useAiActionCycle` - ✅ Blocked post-auth
- [x] `useRandomCardFlips` - ✅ Blocked post-auth
- [x] `demoNotificationEngine` - ✅ Stopped post-auth
- [x] `MapboxMap` landing animations - ✅ Disabled post-auth
- [x] `walletAlloc` balance mutations - ✅ Blocked post-auth
- [x] Ama intro auto-show - ✅ Blocked post-auth
- [x] Credit surprise test trigger - ✅ Blocked post-auth
- [x] Visual animations (tween, slot counter) - ✅ Safe (visual only)
- [x] Portfolio initialization - ✅ Waits for hydration
- [x] Firestore sync - ✅ Required and safe


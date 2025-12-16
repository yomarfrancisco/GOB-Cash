# Auth State and Balance Mode Gate - Step 2

## Summary

Implemented explicit `authState` (loading/authed/unauthed) and `balanceMode` gate to prevent demo balances from rendering or mutating state for authenticated users, even during auth resolution.

## Implementation

### 1. Auth State in `src/store/auth.ts`

Added computed getters:
- `getAuthState(): AuthStateValue` - Returns `'loading' | 'authed' | 'unauthed'`
  - `'loading'`: Firebase auth state not yet resolved (`authReady === false`)
  - `'authed'`: User is authenticated (`isAuthed === true`)
  - `'unauthed'`: User is not authenticated (`isAuthed === false`)

- `getBalanceMode(): BalanceMode` - Returns `'demo' | 'real'`
  - `'real'`: During loading or when authed (safe default: no demo during loading)
  - `'demo'`: Only when explicitly unauthed

### 2. Balance Mutation Gates in `src/state/walletAlloc.tsx`

**Key Rule**: Demo balance mutation functions must early-return unless `authState === 'unauthed'`

Updated `setCash`, `setEth`, `setZwd`:
- Check `authState` before mutating
- Early return if `authState !== 'unauthed'`
- Log warning when blocked
- Prevents any demo balance mutations during loading or when authenticated

### 3. Wallet Store Gate in `src/store/wallets.ts`

Updated `setWallets`:
- Check `authState` before setting wallets
- If `authState !== 'unauthed'`, force all balances to zero
- Prevents demo wallets from being set during auth resolution
- Logs warning when blocking non-zero balances

### 4. UI Rendering Gate in `src/components/CardStackCard.tsx`

**Balance Rendering Gate**:
- `authState === 'loading'`: Show placeholder/skeleton (opacity 0.5, "R 0.00")
- `authState === 'authed'`: Force `balanceMode="real"`, read from Firestore wallets (or show 0)
- `authState === 'unauthed'`: Demo is allowed, use alloc values

### 5. Animation Gate in `src/lib/animations/useAiActionCycle.ts`

Updated `processAction`:
- Check `authState` at the start
- Early return if `authState !== 'unauthed'`
- Prevents demo balance animations from starting during loading or when authenticated

Updated `src/app/page.tsx`:
- Changed `enabled` flag from `!isAuthed` to `authState === 'unauthed'`
- Prevents animations from being enabled during loading

## Flow

### On Refresh (Authenticated User)

1. **Initial State**: `authState = 'loading'` (authReady = false)
   - Balance mutations: **BLOCKED** (early return)
   - Wallet store: **FORCED TO ZERO** (if non-zero balances detected)
   - UI: Shows **placeholder** (R 0.00, opacity 0.5)
   - Animations: **DISABLED** (authState !== 'unauthed')

2. **After Auth Resolves**: `authState = 'authed'` (authReady = true, isAuthed = true)
   - Balance mutations: **BLOCKED** (early return)
   - Wallet store: **FORCED TO ZERO** (if non-zero balances detected)
   - UI: Shows **real balances** from Firestore (or 0 if not loaded)
   - Animations: **DISABLED** (authState !== 'unauthed')

### On Refresh (Unauthenticated User)

1. **Initial State**: `authState = 'loading'` (authReady = false)
   - Balance mutations: **BLOCKED** (early return)
   - UI: Shows **placeholder** (R 0.00, opacity 0.5)
   - Animations: **DISABLED** (authState !== 'unauthed')

2. **After Auth Resolves**: `authState = 'unauthed'` (authReady = true, isAuthed = false)
   - Balance mutations: **ALLOWED** (authState === 'unauthed')
   - UI: Shows **demo balances** from alloc
   - Animations: **ENABLED** (authState === 'unauthed')

## Files Modified

1. **`src/store/auth.ts`**
   - Added `getAuthState()` getter
   - Added `getBalanceMode()` getter
   - Exported `AuthStateValue` and `BalanceMode` types

2. **`src/state/walletAlloc.tsx`**
   - Added authState gate to `setCash`, `setEth`, `setZwd`
   - Early return if `authState !== 'unauthed'`

3. **`src/store/wallets.ts`**
   - Added authState gate to `setWallets`
   - Force balances to zero if `authState !== 'unauthed'`

4. **`src/components/CardStackCard.tsx`**
   - Added `showPlaceholder` flag when `authState === 'loading'`
   - Updated balance rendering logic based on authState

5. **`src/lib/animations/useAiActionCycle.ts`**
   - Added authState gate to `processAction`
   - Early return if `authState !== 'unauthed'`

6. **`src/app/page.tsx`**
   - Updated `enabled` flag to check `authState === 'unauthed'`

## Key Rules

1. **Demo balance mutations**: Must early-return unless `authState === 'unauthed'`
2. **Loading state**: Show placeholder, do not start demo animations
3. **Authenticated state**: Force `balanceMode="real"`, force demo store reset
4. **Unauthenticated state**: Demo is allowed

## Next Steps

- Step 3: Hard reset demo state on auth transition
- Step 4: Decouple animations from balance mutations
- Step 5: Verification and testing


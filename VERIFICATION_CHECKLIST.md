# Verification Checklist - Step 5

## Summary

Complete verification checklist for ensuring no demo balances appear for authenticated users, even during page refresh or auth resolution.

## Verification Steps

### 1. Refresh While Logged In ✅

**Test**: Refresh page while authenticated (new account with no real payment data)

**Expected Behavior**:
- ✅ Never shows positive balance for a new account
- ✅ Shows placeholder (R 0.00, opacity 0.5) during loading
- ✅ Shows R 0.00 after Firestore wallets load
- ✅ No one-frame flash of demo numbers

**How to Verify**:
1. Log in to a new account (or account with zero balances)
2. Refresh the page
3. Check console for `[BALANCE_INSTRUMENTATION]` logs
4. Verify no warnings about non-zero balances for authenticated users
5. Verify cards show R 0.00 immediately (no flash)

### 2. Refresh While Logged Out ✅

**Test**: Refresh page while logged out

**Expected Behavior**:
- ✅ Demo animations can show demo balance
- ✅ Cards show demo values (R 6,103.00 total)
- ✅ Card flips and animations run normally

**How to Verify**:
1. Log out
2. Refresh the page
3. Verify demo balances appear
4. Verify card flips and animations run

### 3. After Login ✅

**Test**: Log in from logged-out state

**Expected Behavior**:
- ✅ Balance stays 0 until real data loads
- ✅ No demo balances appear during transition
- ✅ All queued timeouts cleared
- ✅ UI reads from real balance store (even if value is 0)

**How to Verify**:
1. Start logged out (demo balances visible)
2. Log in
3. Check console for `[AUTH_TRANSITION]` logs
4. Verify balances immediately reset to 0
5. Verify no demo values appear during transition

### 4. No One-Frame Flash ✅

**Test**: Monitor for any brief flash of demo numbers

**Expected Behavior**:
- ✅ No one-frame flash of demo numbers
- ✅ Placeholder shown during loading
- ✅ Smooth transition to real balances (or 0)

**How to Verify**:
1. Use browser dev tools to slow down network
2. Refresh while logged in
3. Watch cards carefully for any flash
4. Check console for any balance mutations during loading

## Console Logs to Monitor

### Expected Logs (Normal Operation)

1. **Auth Transition**:
   ```
   [AUTH_TRANSITION] Transitioning to authed - hard resetting demo state
   [AUTH_TRANSITION] User authenticated - hard resetting wallet store
   [AUTH_TRANSITION] Clearing queued animation timeouts on transition to authed
   ```

2. **Balance Instrumentation** (if enabled):
   ```
   [BALANCE_INSTRUMENTATION] setWallets called { hasNonZeroBalance: false, authState: 'authed' }
   ```

### Warning Logs (Should NOT Appear)

1. **Balance Leak Warnings**:
   ```
   [BALANCE_INSTRUMENTATION] ⚠️ LEAK DETECTED: setCash with non-zero value for authenticated/loading user
   [BALANCE_INSTRUMENTATION] ⚠️ BLOCKED: setCash called but authState !== "unauthed"
   ```

2. **Non-Zero Balance Warnings**:
   ```
   [BALANCE_INSTRUMENTATION] ⚠️ LEAK DETECTED: setWallets with non-zero balances for authenticated/loading user
   ```

## Implementation Summary

### Step 1: Instrumentation ✅
- Added logging to `setCash`, `setEth`, `setZwd`, `setWallets`
- Tracks auth state at time of mutation
- Warns on non-zero balances for authenticated users

### Step 2: AuthState Gate ✅
- Added `getAuthState()` and `getBalanceMode()` to auth store
- Gates in `setCash`, `setEth`, `setZwd` early return if `authState !== 'unauthed'`
- `setWallets` forces balances to zero if `authState !== 'unauthed'`
- UI shows placeholder when `authState === 'loading'`

### Step 3: Hard Reset on Transition ✅
- Detects transition to `'authed'`
- Resets alloc to ZERO
- Clears wallet store
- Clears all queued timeouts

### Step 4: Animation Decoupling ✅
- `useRandomCardFlips` allowed post-auth (visual only)
- `useAiActionCycle` disabled post-auth (mutates balances)
- Gates provide defense-in-depth

## Files Changed

1. `src/store/auth.ts` - Added authState and balanceMode getters
2. `src/state/walletAlloc.tsx` - Added gates and transition detection
3. `src/store/wallets.ts` - Added gate to setWallets
4. `src/components/CardStackCard.tsx` - Added placeholder when loading
5. `src/lib/animations/useAiActionCycle.ts` - Added gates and timeout clearing
6. `src/lib/animations/useRandomCardFlips.ts` - Decoupled from auth state
7. `src/components/FirebaseAuthListener.tsx` - Added logging
8. `src/app/page.tsx` - Updated enabled flag

## Testing on Mobile Safari

**Critical**: Test on mobile Safari as specified:
- Refresh while logged in → never shows positive balance
- Refresh while logged out → demo animations can show demo balance
- After login → balance stays 0 until real data loads
- No one-frame flash of demo numbers

## Success Criteria

✅ **All tests pass**: No demo balances appear for authenticated users
✅ **No console warnings**: No balance leak warnings in console
✅ **Smooth transitions**: No one-frame flashes or glitches
✅ **Visual animations work**: Card flips continue post-auth (visual only)
✅ **Balance mutations blocked**: Multiple layers of protection

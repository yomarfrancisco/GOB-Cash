# Auth Transition Hard Reset - Step 3

## Summary

Implemented hard reset of demo state on auth transition (loading/unauthed -> authed) to ensure no demo balances persist and all queued timeouts are cleared.

## Implementation

### 1. Auth State Transition Detection in `src/state/walletAlloc.tsx`

**Added:**
- `prevAuthStateRef` to track previous authState
- Transition detection: when `authState` changes from `'loading'` or `'unauthed'` to `'authed'`

**On Transition to 'authed':**
- **Reset alloc to ZERO**: `setAlloc(ZERO)` - resets all demo balances to 0
- **Reset hydration flag**: `hydratedRef.current = false`
- **Reset wallet store**: Dynamically imports and resets wallet store to empty object
- **Set demoMode to false**: Ensures UI reads from real balance store
- **Set walletsStatus to 'loading'**: Indicates we're waiting for Firestore

### 2. Timeout Clearing in `src/lib/animations/useAiActionCycle.ts`

**Added:**
- `prevAuthStateRef` to track previous authState
- Transition detection in `useEffect`
- **On transition to 'authed':**
  - Calls `stop()` to clear `intervalRef.current`
  - Sets `isRunningRef.current = false`
  - Sets `isProcessingRef.current = false`
  - Sets `isPausedRef.current = false`
  - Clears all queued timeouts that may still fire

### 3. Async Operation Clearing in `src/lib/animations/useRandomCardFlips.ts`

**Added:**
- `prevAuthStateRef` to track previous authState
- Transition detection in `useEffect`
- **On transition to 'authed':**
  - Logs transition for debugging
  - The `run()` async function checks `authState` on each iteration and exits if not 'unauthed'
  - The effect re-runs when `shouldEnable` becomes false, aborting the loop

**Updated `run()` function:**
- Checks `authState` after quiet period
- Checks `authState` on each loop iteration
- Exits immediately if `authState !== 'unauthed'`

### 4. Wallet Store Reset in `src/components/FirebaseAuthListener.tsx`

**Enhanced:**
- Added logging when user authenticates
- Already clears wallets to empty object (ensures UI reads from real balance store)

## Flow on Auth Transition

### Transition: loading/unauthed -> authed

1. **Transition Detected**:
   - `prevAuthStateRef` tracks previous state
   - `useEffect` detects change from `'loading'` or `'unauthed'` to `'authed'`

2. **Hard Reset Executed**:
   - **alloc**: Reset to `ZERO` (all balances = 0)
   - **wallet store**: Reset to `{}` (empty, will be populated from Firestore)
   - **demoMode**: Set to `false` (ensures UI reads from real balance store)
   - **walletsStatus**: Set to `'loading'` (indicates waiting for Firestore)

3. **Queued Timeouts Cleared**:
   - **useAiActionCycle**: `stop()` called, all refs reset
   - **useRandomCardFlips**: Loop checks `authState` and exits

4. **UI Reads from Real Balance Store**:
   - `CardStackCard` checks `authState === 'authed'`
   - Reads from Firestore wallets (or shows 0 if not loaded)
   - Never reads from demo alloc values

## Files Modified

1. **`src/state/walletAlloc.tsx`**
   - Added `prevAuthStateRef` to track transitions
   - Added transition detection and hard reset logic
   - Dynamically imports wallet store to reset it

2. **`src/lib/animations/useAiActionCycle.ts`**
   - Added `prevAuthStateRef` to track transitions
   - Added transition detection and timeout clearing
   - Clears all queued timeouts on transition to 'authed'

3. **`src/lib/animations/useRandomCardFlips.ts`**
   - Added `prevAuthStateRef` to track transitions
   - Added transition detection
   - Updated `run()` to check `authState` and exit if not 'unauthed'
   - Added `aborted` flag to exit loop

4. **`src/components/FirebaseAuthListener.tsx`**
   - Added logging for auth transition

## Key Guarantees

1. **No Demo Balances Persist**: All demo balances reset to 0 on transition
2. **No Queued Timeouts Fire**: All animation timeouts cleared immediately
3. **UI Reads from Real Store**: `demoMode = false` ensures UI reads from Firestore
4. **Empty State Until Firestore Loads**: Wallet store is empty until Firestore returns data

## Next Steps

- Step 4: Decouple animations from balance mutations
- Step 5: Verification and testing


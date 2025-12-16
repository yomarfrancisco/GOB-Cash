# Animation Disable Post-Auth Fix

## Problem

On page refresh post-auth, animation cycles and bursts were still triggering, causing balance changes and card animations even though the user is authenticated. This was leaking demo values onto cards.

## Root Cause

1. **Race Condition on Refresh**: When the page refreshes, `isAuthed` might be `false` initially, then become `true` after Firebase auth state is determined. During this window, animations could start.

2. **Insufficient Auth Checks**: Animation hooks were checking `isAuthed` at initialization but not continuously during execution. Once a timeout/interval was scheduled, it would continue even if auth state changed.

3. **scheduleNext() Still Scheduling**: In `useAiActionCycle`, the `scheduleNext()` function was still scheduling timeouts even when authenticated, relying on `processAction()` to return early. This created unnecessary timeouts and potential race conditions.

## Solution Implemented

### 1. Fixed `useAiActionCycle` (`src/lib/animations/useAiActionCycle.ts`)

**Changes:**
- Added auth state check at the START of `scheduleNext()` - stops scheduling immediately if authenticated
- Added auth state check in `start()` - returns early if authenticated
- Added auth state check in `resume()` - returns early if authenticated
- Added auth state checks inside all timeout callbacks - double-checks before executing
- Updated `useEffect` to check auth state on mount and during polling

**Key Fixes:**
```typescript
const scheduleNext = () => {
  // CRITICAL: Check auth state BEFORE scheduling - stop immediately if authenticated
  const isAuthed = useAuthStore.getState().isAuthed
  if (isAuthed) {
    isRunningRef.current = false
    if (intervalRef.current) {
      clearTimeout(intervalRef.current)
      intervalRef.current = null
    }
    return
  }
  // ... rest of scheduling logic
}
```

### 2. Fixed `useRandomCardFlips` (`src/lib/animations/useRandomCardFlips.ts`)

**Changes:**
- Added auth state check at the START of `useEffect` - prevents starting if authenticated
- Added auth state checks throughout the `run()` async function:
  - After quiet period
  - On each loop iteration
  - While paused/idle
  - After wait intervals
  - Before each card flip
- Added `isAuthed` to dependency array so effect re-runs when auth state changes

**Key Fixes:**
```typescript
useEffect(() => {
  // CRITICAL: Always check current auth state
  const isAuthedNow = useAuthStore.getState().isAuthed
  if (isAuthedNow || !shouldEnable || !ref?.current) {
    return // Do not start if authenticated
  }
  // ... rest of animation logic
}, [ref, controllerRef, shouldEnable, isAuthed])
```

## Files Changed

1. **`src/lib/animations/useAiActionCycle.ts`**
   - Added auth checks in `scheduleNext()`, `start()`, `resume()`, and all timeout callbacks
   - Updated `useEffect` to check auth state continuously

2. **`src/lib/animations/useRandomCardFlips.ts`**
   - Added auth checks throughout the animation loop
   - Added `isAuthed` to dependency array

## Flow After Fix

1. **On Refresh (Authenticated User)**:
   - Component mounts, `isAuthed` might be `false` initially
   - `useEffect` checks auth state - if `isAuthed` becomes `true`, animations never start
   - If animations somehow start, they check auth state on every iteration and stop immediately

2. **During Animation Execution**:
   - Every timeout callback checks auth state before executing
   - If `isAuthed` becomes `true`, animation stops immediately
   - No timeouts are scheduled if user is authenticated

3. **On Auth State Change**:
   - When `isAuthed` changes from `false` to `true`, `useEffect` re-runs
   - All running animations are stopped immediately
   - No new animations are started

## Testing

To verify the fix:
1. Sign in as a user
2. Refresh the page
3. No animations should trigger (no card flips, no balance changes)
4. Cards should show $0 without any animation
5. Check browser console - no animation logs should appear post-auth

## Notes

- All animations are now completely disabled post-auth
- Auth state is checked at multiple points to prevent race conditions
- No timeouts/intervals are scheduled if user is authenticated
- Works correctly even if `isAuthed` changes after component mounts


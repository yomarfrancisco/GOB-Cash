# Flash Animation Fix: Prevent Balance Leak on Refresh

## Problem Diagnosis

On page refresh, the ZAR card (and potentially other cards) showed an initial animation that triggered a number change, even though the balance should be zero. This was caused by a flash animation leak in the `CardStack` component.

### Root Cause

1. **Initial Render Race Condition**: 
   - `CardStack` component's `prevValuesRef` was initialized with `alloc.cashCents / 100` on mount
   - On initial render, `alloc` might have DEMO values (if `isAuthed` is false initially)
   - When auth state is determined and `isAuthed` becomes `true`, `alloc` is reset to ZERO
   - `prevValuesRef` still had the initial DEMO values, causing a delta that triggered the flash animation

2. **Flash Animation Logic**:
   - The `useEffect` in `CardStack.tsx` (lines 174-216) computes flash direction by comparing current values to `prevValuesRef`
   - When `alloc` changed from DEMO (e.g., 4882.4) to ZERO (0), the delta was negative, triggering a "down" flash animation
   - This caused the ZAR card to animate from a non-zero value to zero, leaking a balance onto the card

## Solution Implemented

### 1. Added Authentication State Check
- Imported `useAuthStore` to access `isAuthed` state
- Use `isAuthed` to determine initial `prevValuesRef` values

### 2. Initialize `prevValuesRef` to Zero for Authenticated Users
- If `isAuthed` is `true`, initialize all `prevValuesRef` values to `0`
- Prevents false flash animation when `alloc` changes from DEMO to ZERO

### 3. Reset `prevValuesRef` on Auth State Change
- Added `useEffect` to reset `prevValuesRef` when `isAuthed` changes
- When user becomes authenticated: reset to all zeros
- When user signs out: reset to current `alloc` values (demo)

### 4. Skip Flash on First Hydration
- Added `isFirstHydrationRef` flag to track first hydration for authenticated users
- Skip flash animation if all values are zero on first hydration
- Prevents false flash when wallets sync from Firestore (which have zero balances)

## Files Changed

1. **`src/components/CardStack.tsx`**
   - Added `useAuthStore` import
   - Modified `prevValuesRef` initialization to use zero for authenticated users
   - Added `isFirstHydrationRef` to track first hydration
   - Added `useEffect` to reset `prevValuesRef` on auth state change
   - Modified flash direction computation to skip flash on first hydration

## Flow After Fix

1. **On Refresh (Authenticated User)**:
   - `CardStack` mounts with `isAuthed = true`
   - `prevValuesRef` initialized to all zeros
   - `alloc` starts as ZERO (from `WalletAllocProvider`)
   - Flash animation skipped (no delta, all zeros)
   - Cards display zero balances without animation

2. **On Refresh (Unauthenticated User)**:
   - `CardStack` mounts with `isAuthed = false`
   - `prevValuesRef` initialized to DEMO values
   - `alloc` starts as DEMO
   - Flash animations work normally for demo mode

3. **On Auth State Change**:
   - When `isAuthed` changes from `false` to `true`: `prevValuesRef` reset to zeros
   - When `isAuthed` changes from `true` to `false`: `prevValuesRef` reset to current `alloc` values
   - Prevents false flash animations during auth state transitions

## Testing

To verify the fix:
1. Sign in as a user with zero balances
2. Refresh the page
3. ZAR card (and other cards) should show $0 without any animation
4. No flash animation should trigger on initial load
5. Flash animations should only trigger for actual balance changes (not on refresh)

## Notes

- The fix maintains flash animation functionality for real balance changes
- Only prevents false flash animations on refresh/hydration
- Works for both authenticated and unauthenticated users
- Preserves demo mode flash animations for marketing purposes


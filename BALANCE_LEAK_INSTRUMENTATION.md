# Balance Leak Instrumentation - Step 1

## Summary

Added comprehensive instrumentation to track all balance mutations and identify what writes non-zero balances for authenticated users.

## Instrumentation Added

### 1. `setCash`, `setEth`, `setZwd` in `src/state/walletAlloc.tsx`

Each function now logs:
- **Value being set**
- **Caller** (from stack trace)
- **Auth state** (`loading` | `authed` | `unauthed`)
- **isAuthed** boolean
- **authReady** boolean
- **hydrated** flag
- **syncing** flag
- **Timestamp**
- **Stack trace** (first 5 lines)

**Warning logs** when:
- Non-zero balance is set for authenticated or loading users
- Includes full stack trace (first 8 lines) for debugging

### 2. `setWallets` in `src/store/wallets.ts`

Logs:
- **Wallet IDs** being set
- **hasNonZeroBalance** flag
- **Caller** (from stack trace)
- **Auth state** (`loading` | `authed` | `unauthed`)
- **isAuthed** boolean
- **authReady** boolean
- **Timestamp**
- **Stack trace** (first 5 lines)

**Warning logs** when:
- Non-zero balances are set for authenticated or loading users
- Includes full wallet data and stack trace

## Auth State Calculation

Auth state is calculated as:
```typescript
const authState = !authReady ? 'loading' : isAuthed ? 'authed' : 'unauthed'
```

- **`loading`**: Firebase auth state not yet resolved (`authReady === false`)
- **`authed`**: User is authenticated (`isAuthed === true`)
- **`unauthed`**: User is not authenticated (`isAuthed === false`)

## Console Log Format

All logs use the prefix `[BALANCE_INSTRUMENTATION]` for easy filtering.

**Normal logs:**
```
[BALANCE_INSTRUMENTATION] setCash called { value, caller, authState, ... }
```

**Warning logs (leak detected):**
```
[BALANCE_INSTRUMENTATION] ⚠️ LEAK DETECTED: setCash with non-zero value for authenticated/loading user
```

## Next Steps

1. **Test on refresh**: Refresh page while logged in and check console logs
2. **Identify leak source**: Look for warnings showing non-zero balance mutations
3. **Trace call stack**: Use stack traces to find the exact function calling the setter
4. **Implement gate**: Add auth state gate to prevent demo balance mutations (Step 2)

## Files Modified

- `src/state/walletAlloc.tsx` - Added instrumentation to `setCash`, `setEth`, `setZwd`
- `src/store/wallets.ts` - Added instrumentation to `setWallets` and imported `useAuthStore`

## Testing Instructions

1. Open browser console
2. Filter logs by `[BALANCE_INSTRUMENTATION]`
3. Refresh page while logged in
4. Look for any warnings about non-zero balances
5. Check stack traces to identify the source of the mutation


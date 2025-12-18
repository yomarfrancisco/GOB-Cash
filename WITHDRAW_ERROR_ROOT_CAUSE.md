# Withdraw Error Root Cause Analysis

## Error Observed

**Timestamp**: `2025-12-18T12:59:48.017928Z`

**Error Details**:
```json
{
  "code": "failed-precondition",
  "message": "Insufficient user balance",
  "details": {
    "userAvailableUSDT": 0,
    "requestedAmountUSDT": 0.0005524861878453038
  }
}
```

## Critical Finding

**The diagnostic log `[tx_withdrawTronUSDT] Balance diagnostics` is NOT appearing in the function logs.**

**Expected log** (if new code is running):
```
[tx_withdrawTronUSDT] Balance diagnostics: {
  userId: "...",
  fiatBalance: <value>,
  lockedBalance: <value>,
  fxRate: 18.1,
  computedAvailableUsdt: <value>,
  requestedAmountUsdt: 0.0005524861878453038,
  requiredUsdt: 0.0005524861878453038,
  requiredZarDebit: <value>
}
```

**Actual logs**: Only show error, no diagnostic log before it.

## Root Cause: Function Not Redeployed

**Evidence**:
1. ✅ Code changes are committed (commit `1c8e88e` and `02ab8c6`)
2. ✅ Built code shows new logic (`fiatBalance / FX_RATE_ZAR_PER_USDT`)
3. ❌ Function logs do NOT show diagnostic log
4. ❌ Error shows `userAvailableUSDT: 0` (could be from old code reading `usdtBalance`)

**Conclusion**: The function is still running the OLD code that reads `usdtBalance` (which is 0), not the NEW code that reads `fiatBalance` and converts to USDT.

## Why This Happens

**Firebase Functions deployment process**:
1. Code is committed to git ✅
2. Code is built locally ✅
3. Code must be DEPLOYED to Firebase ❌ (Missing step)

**The function needs to be redeployed**:
```bash
firebase deploy --only functions:tx_withdrawTronUSDT --project gobankless-dev
```

## Verification Steps

### Step 1: Check if Function Was Deployed After Code Changes

**Check deployment timestamp**:
- Last commit with fix: `1c8e88e` (Dec 18)
- Check Firebase Console → Functions → `tx_withdrawTronUSDT` → Last deployed timestamp
- If timestamp is BEFORE Dec 18, function is using old code

### Step 2: Check Function Logs for Diagnostic Output

**After deployment**, retry withdrawal and check logs for:
```
[tx_withdrawTronUSDT] Balance diagnostics: {
  fiatBalance: <value>,
  fxRate: 18.1,
  computedAvailableUsdt: <value>,
  ...
}
```

**If this log appears**: New code is running, check `fiatBalance` value
**If this log does NOT appear**: Old code is still running, function not deployed

### Step 3: Check User's Firestore Balance

**In Firebase Console**:
1. Navigate to Firestore
2. Go to: `users/{userId}/wallets/cashZAR`
3. Check `fiatBalance` value

**If `fiatBalance = 0`**: User needs to deposit first (expected)
**If `fiatBalance > 0`**: After deployment, withdrawal should work

## Required Action

**Deploy the updated function**:
```bash
firebase deploy --only functions:tx_withdrawTronUSDT --project gobankless-dev
```

**Wait**: 30-60 seconds for deployment to complete

**Then**: Retry withdrawal and check logs for diagnostic output

## Expected Behavior After Deployment

**User with `fiatBalance = 0.01 ZAR`**:
- `availableUSDT = 0.01 / 18.1 = 0.000552486... USDT`
- Can withdraw `0.0005524861878453038 USDT` ✅
- Logs will show: `fiatBalance: 0.01, computedAvailableUsdt: 0.000552486...`

**User with `fiatBalance = 0 ZAR`**:
- `availableUSDT = 0 / 18.1 = 0 USDT`
- Cannot withdraw (expected) ❌
- Logs will show: `fiatBalance: 0, computedAvailableUsdt: 0`

## Summary

**Root Cause**: Function is running old code (reads `usdtBalance`) instead of new code (reads `fiatBalance` and converts to USDT).

**Evidence**: Diagnostic log is missing from function logs, error shows `userAvailableUSDT: 0`.

**Fix**: Deploy the updated function to Firebase.

**No code changes needed** - the fix is already in the codebase, just needs to be deployed.


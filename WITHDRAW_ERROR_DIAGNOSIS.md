# Withdraw Error Persists - Diagnosis

## Error Observed

**User attempting**: Withdraw `0.0005524861878453038` USDT

**Error returned**: `functions/failed-precondition` - "Insufficient user balance"

**Console shows**:
- `errorCode: 'functions/failed-precondition'`
- `errorMessage: 'Insufficient user balance'`
- `amountUSDT: 0.0005524861878453038`

## Possible Causes

### 1. Function Not Redeployed (Most Likely)

**Check**: The code changes were committed but may not be deployed to Firebase yet.

**Evidence needed**:
- Check Firebase Console → Functions → Logs for `[tx_withdrawTronUSDT] Balance diagnostics`
- If logs show old format (no `fiatBalance`, `fxRate`, `computedAvailableUsdt`), function is using old code
- If logs show new format, function is using new code but user's `fiatBalance` is 0 or too low

**Fix**: Deploy the function:
```bash
firebase deploy --only functions:tx_withdrawTronUSDT --project gobankless-dev
```

### 2. User's fiatBalance is 0 or Very Low

**Check**: Even with the fix, if `fiatBalance = 0`, then `availableUSDT = 0 / 18.1 = 0`

**Required for 0.0005524861878453038 USDT**:
- Minimum `fiatBalance = 0.0005524861878453038 * 18.1 = 0.01 ZAR` (approximately)

**Diagnosis steps**:
1. Check Firebase Console → Firestore → `users/{userId}/wallets/cashZAR`
2. Check `fiatBalance` value
3. If `fiatBalance = 0`, user needs to deposit first
4. If `fiatBalance > 0`, check function logs to see computed values

### 3. Function Logs Will Show the Truth

**Expected logs** (if new code is deployed):
```
[tx_withdrawTronUSDT] Balance diagnostics: {
  userId: "...",
  fiatBalance: <actual value>,
  lockedBalance: <actual value>,
  fxRate: 18.1,
  computedAvailableUsdt: <fiatBalance / 18.1>,
  requestedAmountUsdt: 0.0005524861878453038,
  requiredUsdt: 0.0005524861878453038,
  requiredZarDebit: <calculated>
}
```

**If old code is still running**, logs will NOT show:
- `fiatBalance`
- `fxRate`
- `computedAvailableUsdt`
- `requiredZarDebit`

## Diagnosis Steps (No Changes)

### Step 1: Check Function Deployment Status

**Command**:
```bash
firebase functions:list --project gobankless-dev | grep tx_withdrawTronUSDT
```

**Expected**: Function should be listed as `v1 callable us-central1`

### Step 2: Check Recent Function Logs

**Command**:
```bash
firebase functions:log --project gobankless-dev | grep -A 10 "Balance diagnostics\|Insufficient user balance"
```

**Look for**:
- Does log show `fiatBalance`, `fxRate`, `computedAvailableUsdt`? → New code is running
- Does log show only `userAvailableUSDT`? → Old code is still running

### Step 3: Check User's Firestore Balance

**In Firebase Console**:
1. Navigate to Firestore
2. Go to: `users/{userId}/wallets/cashZAR`
3. Check `fiatBalance` value
4. Calculate: `availableUSDT = fiatBalance / 18.1`

**If `fiatBalance = 0`**: User needs to deposit first
**If `fiatBalance > 0` but `availableUSDT < 0.0005524861878453038`**: Insufficient balance (expected)
**If `fiatBalance > 0` and `availableUSDT >= 0.0005524861878453038`**: Function bug or not deployed

### Step 4: Verify Code is Built

**Command**:
```bash
cd functions && npm run build
grep -A 5 "getUserUsdtBalance" lib/tx/withdrawTronUsdt.js
```

**Expected**: Should show `fiatBalance / FX_RATE_ZAR_PER_USDT` conversion

## Most Likely Issue

**The function has not been redeployed after the code changes.**

**Solution**: Deploy the updated function:
```bash
firebase deploy --only functions:tx_withdrawTronUSDT --project gobankless-dev
```

**Wait**: 30-60 seconds for deployment to complete

**Then**: Retry withdrawal and check logs for `[tx_withdrawTronUSDT] Balance diagnostics`

## Next Steps (After Diagnosis)

1. **If function not deployed**: Deploy it
2. **If function deployed but logs show old format**: Check build output
3. **If function deployed and logs show new format but still fails**: Check user's `fiatBalance` in Firestore
4. **If `fiatBalance = 0`**: User needs to deposit first
5. **If `fiatBalance > 0` but insufficient**: Expected behavior (user needs more balance)

## Expected Behavior After Fix

**User with `fiatBalance = 0.01 ZAR`**:
- `availableUSDT = 0.01 / 18.1 = 0.000552486... USDT`
- Can withdraw `0.0005524861878453038 USDT` ✅

**User with `fiatBalance = 0 ZAR`**:
- `availableUSDT = 0 / 18.1 = 0 USDT`
- Cannot withdraw (expected) ❌

**User with `fiatBalance = 181 ZAR`**:
- `availableUSDT = 181 / 18.1 = 10 USDT`
- Can withdraw up to `10 USDT` ✅


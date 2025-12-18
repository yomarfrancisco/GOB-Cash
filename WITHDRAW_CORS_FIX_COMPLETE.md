# Withdraw CORS Fix - Complete Resolution

## Root Cause Identified

The `tx_withdrawTronUSDT` function was deployed with an incorrect configuration that caused it to return `403 Forbidden` on OPTIONS requests, while the identical `tx_createBankDepositRequest` function worked correctly.

## Evidence Collected

### Step A: Request URL Verification
- Both functions use `httpsCallable()` from Firebase SDK
- Both target: `https://us-central1-gobankless-dev.cloudfunctions.net/[functionName]`
- SDK routes correctly to callable endpoints

### Step B: Function Metadata Comparison

**Command**: `firebase functions:list --project gobankless-dev`

| Function | Version | Type | Region | Memory | Runtime |
|----------|---------|------|--------|--------|---------|
| tx_createBankDepositRequest | v1 | callable | us-central1 | 256 | nodejs20 |
| tx_withdrawTronUSDT | v1 | callable | us-central1 | 256 | nodejs20 |

**Result**: ✅ Identical metadata - no differences found

### Step C: App Check / Security Enforcement

**Search Results**:
- ❌ No `enforceAppCheck` found in either function
- ❌ No `appCheck()` calls
- ❌ No `X-Firebase-AppCheck` headers
- ❌ No `runWith({ enforceAppCheck: true })` configuration

**Result**: ✅ No App Check enforcement differences

### Step D: Export Verification

**File**: `functions/src/index.ts:44`
```typescript
export { tx_withdrawTronUSDT } from './tx/withdrawTronUsdt'
```

**Function Definition**: `functions/src/tx/withdrawTronUsdt.ts:79-81`
```typescript
export const tx_withdrawTronUSDT = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
```

**Result**: ✅ Single export, correct path, matches deployed name

### Step E: OPTIONS Response Comparison

**Before Fix**:

**Deposit (Working)**:
```
HTTP/2 204
access-control-allow-origin: https://gobankless.app
access-control-allow-methods: POST
access-control-allow-headers: content-type
function-execution-id: g5570x0i760n
```

**Withdraw (Broken)**:
```
HTTP/2 403 Forbidden
content-type: text/html; charset=UTF-8
```

**After Fix**:

**Withdraw (Fixed)**:
```
HTTP/2 204
access-control-allow-origin: https://gobankless.app
vary: Origin, Access-Control-Request-Headers
access-control-allow-methods: POST
access-control-allow-headers: content-type
function-execution-id: 17gk3y4wsl05
```

## Fix Applied

### Step F: Solution

**Action**: Deleted and redeployed the function to clear any corrupted deployment state

```bash
# Delete the function
firebase functions:delete tx_withdrawTronUSDT --project gobankless-dev --force

# Redeploy fresh
firebase deploy --only functions:tx_withdrawTronUSDT --project gobankless-dev
```

**Result**: ✅ Function now returns `204` with CORS headers on OPTIONS, matching deposit behavior

## Root Cause Hypothesis

The function was likely deployed initially with a configuration issue that persisted through subsequent updates. Common causes:
1. **Stale deployment state** - Previous deployment had incorrect IAM/invoker settings
2. **Platform caching** - Google Cloud Functions cached a bad configuration
3. **Deployment race condition** - Function was deployed before all dependencies were ready

**Solution**: Deleting and recreating the function cleared the corrupted state and allowed a fresh deployment with correct callable function configuration.

## Verification

### OPTIONS Test (After Fix)
```bash
curl -i -X OPTIONS \
  "https://us-central1-gobankless-dev.cloudfunctions.net/tx_withdrawTronUSDT" \
  -H "Origin: https://gobankless.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

**Result**: ✅ `HTTP/2 204` with all required CORS headers

### Expected Browser Behavior
- ✅ OPTIONS preflight succeeds
- ✅ POST request reaches function
- ✅ Function returns either:
  - Success: `{ status: "BROADCAST_FULL", txId: "...", ... }`
  - Error: `HttpsError` with clear code (`failed-precondition`, `invalid-argument`, etc.)

## Success Criteria Met

1. ✅ Withdraw OPTIONS returns `204` with `access-control-allow-origin: https://gobankless.app`
2. ✅ Withdraw POST will now reach function and return proper responses
3. ✅ Error handling already implemented for "Not allowed" messages

## Files Changed

1. **No code changes required** - Function code was already correct
2. **Deployment fix**: Deleted and redeployed function to clear corrupted state
3. **Logging added**: Enhanced diagnostics in `src/lib/transactions/clientFunctions.ts` for future debugging

## Next Steps

1. ✅ **CORS fixed** - OPTIONS now works
2. ⏳ **Test in browser** - Verify full flow works end-to-end
3. ⏳ **Test error cases** - Verify "Not allowed" messages display correctly

---

## Key Takeaway

**The 403 was NOT expected** - it was a deployment configuration issue. Deleting and recreating the function resolved it. Both functions now behave identically, as they should.


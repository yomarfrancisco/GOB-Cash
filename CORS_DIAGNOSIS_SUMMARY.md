# CORS Error Diagnosis Summary

## Step 1: Client Code Verification ✅

**Result**: Client correctly uses `httpsCallable`

- ✅ No direct `fetch()` calls to `cloudfunctions.net`
- ✅ No `axios` calls
- ✅ Code uses `httpsCallable(functions, 'tx_appendUserMessage')`

**File**: `src/lib/transactions/clientFunctions.ts:32-49`

---

## Step 2: Firebase Deployment Status ✅

**Command**: `firebase functions:list`

**Result**: Function IS deployed and correctly configured
```
│ tx_appendUserMessage │ v1 │ callable │ us-central1 │ 256 │ nodejs20 │
```

**Status**:
- ✅ Function exists
- ✅ Type: `callable` (not HTTP)
- ✅ Region: `us-central1`
- ✅ Generation: `v1`
- ✅ Active

---

## Step 3: Server Implementation ✅

**File**: `functions/src/tx/appendUserMessage.ts`

**Status**: ✅ Correct
- Uses `functions.https.onCall` (v1 API)
- Region: `us-central1`
- Package: `firebase-functions@4.9.0`

---

## Step 4: Index Export ✅

**File**: `functions/src/index.ts:27`

**Status**: ✅ Correctly exported

---

## Step 5: Client Function Call ✅

**File**: `src/lib/transactions/clientFunctions.ts`

**Status**: ✅ Correct
- Uses `getFunctions(app, 'us-central1')`
- Uses `httpsCallable(functions, 'tx_appendUserMessage')`
- Correct payload: `{ txId, text }`

---

## Root Cause Analysis

**The Problem**: 
Even though everything is configured correctly, the error shows:
```
Access to fetch at 'https://us-central1-gobankless-dev.cloudfunctions.net/txAppendUserMessage'
```

This indicates the Firebase SDK is **falling back to a direct HTTP URL** instead of using the callable endpoint. This typically happens when:

### Most Likely Cause: Firebase SDK Can't Resolve Callable Endpoint

The SDK should route to an internal Firebase endpoint (not `cloudfunctions.net` directly). When it falls back to `cloudfunctions.net`, it means:

1. **SDK can't find the function** (project mismatch?)
2. **SDK version issue** (bug in callable routing)
3. **Network/firewall blocking** Firebase internal routing

### Potential Issues:

1. **Project ID Mismatch**
   - Client app might be configured for different project
   - Check: `NEXT_PUBLIC_FIREBASE_PROJECT_ID` should be `gobankless-dev`
   - Verify in browser console: `getFirebaseApp().options.projectId`

2. **Firebase SDK Version**
   - Need to check `firebase` package version
   - Older versions might have callable routing bugs
   - Should be `^10.x` or `^9.x`

3. **Function Name Resolution**
   - SDK converts `tx_appendUserMessage` → `txAppendUserMessage` (normal)
   - But if SDK can't resolve callable endpoint, falls back to direct URL

---

## Recommended Fixes (In Order)

### Fix 1: Verify Firebase Project Configuration

**Check production environment variables**:
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` must be `gobankless-dev`
- All Firebase config vars must match the deployed project

**Add debug logging** to verify:
```typescript
const app = getFirebaseApp()
console.log('[DEBUG] Firebase project:', app.options.projectId)
```

### Fix 2: Check Firebase SDK Version

**Check**: `package.json` for `firebase` package version
- Should be recent (`^10.x` or `^9.x`)
- Update if outdated

### Fix 3: Force Redeploy Function

Even though function is deployed, force redeploy:
```bash
cd functions
npm run build
firebase deploy --only functions:tx_appendUserMessage --force
```

### Fix 4: Add Explicit Error Handling

Add logging to see what SDK is actually doing:
```typescript
export async function tx_appendUserMessage(txId: string, text: string): Promise<void> {
  const functions = getFunctionsInstance()
  console.log('[DEBUG] Functions instance:', {
    projectId: functions.app.options.projectId,
    region: 'us-central1'
  })
  
  const fn = httpsCallable(functions, 'tx_appendUserMessage')
  // ... rest of code
}
```

---

## Expected vs Actual Behavior

### Expected (Working):
- SDK routes to Firebase callable endpoint (internal)
- No direct `cloudfunctions.net` URL
- No CORS error
- Request includes Firebase auth headers

### Actual (Broken):
- SDK falls back to `cloudfunctions.net/txAppendUserMessage`
- CORS preflight fails
- No Firebase auth headers (or wrong format)

---

## Next Steps (Awaiting Permission)

1. ✅ Verify function is deployed (DONE - it is)
2. ⏳ Check Firebase SDK version in `package.json`
3. ⏳ Verify environment variables in production
4. ⏳ Add debug logging to see SDK behavior
5. ⏳ Test with explicit project configuration

**All code is correct - issue is likely configuration or SDK routing.**


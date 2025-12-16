# CORS Error Diagnosis: tx_appendUserMessage

## Error Observed

```
Access to fetch at 'https://us-central1-gobankless-dev.cloudfunctions.net/txAppendUserMessage' 
from origin 'https://gobankless.app' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**Error Details:**
- URL: `https://us-central1-gobankless-dev.cloudfunctions.net/txAppendUserMessage`
- Method: POST (preflight OPTIONS request failing)
- Origin: `https://gobankless.app`
- Error Code: `functions/internal`

## Root Cause Analysis

### Issue 1: Function Name Mismatch

**Observed URL**: `txAppendUserMessage` (camelCase, no underscore)
**Exported Function**: `tx_appendUserMessage` (with underscore)

Firebase Functions automatically converts function names:
- Export: `tx_appendUserMessage` → HTTP endpoint: `/txAppendUserMessage`
- This is **normal behavior** - Firebase converts underscores to camelCase in URLs

### Issue 2: CORS Error on Callable Function

**The Problem**: Callable functions (`.https.onCall`) should **never** have CORS issues because:
1. Firebase SDK handles CORS automatically
2. Callable functions use a special endpoint pattern
3. The SDK should use `firebaseremoteconfig.googleapis.com` pattern, not direct `cloudfunctions.net` URLs

**Why This Is Happening**:
The error shows a direct fetch to `cloudfunctions.net/txAppendUserMessage`, which suggests:
1. The function might not be deployed as a callable (could be deployed as `.https.onRequest`)
2. The function might not be deployed at all
3. There might be a deployment mismatch (old version still deployed)

### Issue 3: Function Deployment Status

**Check Required**:
1. Is `tx_appendUserMessage` actually deployed?
2. Is it deployed as `.https.onCall` or `.https.onRequest`?
3. Is the deployed function name correct?

## Diagnosis Steps

### Step 1: Verify Function Export

**File**: `functions/src/tx/appendUserMessage.ts`

**Current Export** (should be):
```typescript
export const tx_appendUserMessage = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // ... implementation
  })
```

**Check**: Is it `.https.onCall` or `.https.onRequest`?
- ✅ `.onCall` = Correct (no CORS issues)
- ❌ `.onRequest` = Wrong (requires CORS middleware)

### Step 2: Verify Function Registration

**File**: `functions/src/index.ts`

**Should Include**:
```typescript
export { tx_appendUserMessage } from './tx/appendUserMessage'
```

**Check**: Is it exported in index.ts?

### Step 3: Verify Deployment

**Check Firebase Console**:
1. Go to Firebase Console → Functions
2. Look for function named `tx_appendUserMessage` or `txAppendUserMessage`
3. Check if it's deployed and active
4. Check the function type (Callable vs HTTP)

**Deploy Command**:
```bash
cd functions
npm run build
firebase deploy --only functions:tx_appendUserMessage
```

### Step 4: Verify Client Code

**File**: `src/lib/transactions/clientFunctions.ts`

**Current Implementation** (lines 32-49):
```typescript
export async function tx_appendUserMessage(txId: string, text: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_appendUserMessage')  // ✅ Correct
  
  try {
    await fn({ txId, text })  // ✅ Using callable SDK
  } catch (error: any) {
    // Error handling
  }
}
```

**Status**: ✅ Client code is correct - uses `httpsCallable` properly

## Most Likely Causes

### Cause 1: Function Not Deployed (Most Likely)

**Symptom**: Function doesn't exist in Firebase Console

**Solution**: Deploy the function
```bash
cd functions
npm run build
firebase deploy --only functions
```

### Cause 2: Function Deployed as HTTP (Not Callable)

**Symptom**: Function exists but is listed as "HTTP" not "Callable" in Firebase Console

**Solution**: 
1. Check `functions/src/tx/appendUserMessage.ts` - ensure it uses `.https.onCall`
2. Redeploy the function

### Cause 3: Old Version Still Deployed

**Symptom**: Function exists but might be an old version with different implementation

**Solution**: Force redeploy
```bash
firebase deploy --only functions:tx_appendUserMessage --force
```

### Cause 4: Region Mismatch

**Symptom**: Function deployed in different region than client expects

**Check**: 
- Function region: `us-central1` (in code)
- Client region: `us-central1` (in `getFunctionsInstance()`)

**Status**: ✅ Both use `us-central1` - no mismatch

## Recommended Fixes (In Order)

### Fix 1: Verify and Redeploy Function

1. **Check deployment status**:
   ```bash
   firebase functions:list
   ```

2. **Build and deploy**:
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions:tx_appendUserMessage
   ```

3. **Verify in Firebase Console**:
   - Function should appear as "Callable"
   - Region should be `us-central1`
   - Status should be "Active"

### Fix 2: Verify Function Implementation

**Check**: `functions/src/tx/appendUserMessage.ts`

**Must be**:
```typescript
export const tx_appendUserMessage = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // NOT .https.onRequest
  })
```

### Fix 3: Check Function Exports

**Check**: `functions/src/index.ts`

**Must include**:
```typescript
export { tx_appendUserMessage } from './tx/appendUserMessage'
```

### Fix 4: Clear Browser Cache

Sometimes browser caches old function endpoints. Try:
1. Hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
2. Clear browser cache
3. Test in incognito mode

## Verification Steps

After deploying, verify:

1. **Check Firebase Console**:
   - Function `tx_appendUserMessage` exists
   - Type: "Callable"
   - Region: `us-central1`
   - Status: "Active"

2. **Test in Browser**:
   - Open DevTools → Network tab
   - Click "I've deposited" button
   - Look for request to `firebaseremoteconfig.googleapis.com` (not `cloudfunctions.net`)
   - Should NOT see CORS error

3. **Check Console Logs**:
   - Should see: `[Transaction] User message appended to transaction thread: {txId}`
   - Should NOT see: CORS error

## Expected Behavior After Fix

When working correctly:
1. Client calls `httpsCallable(functions, 'tx_appendUserMessage')`
2. Firebase SDK makes request to callable endpoint (not direct cloudfunctions.net)
3. No CORS error (Firebase handles CORS automatically)
4. Function executes successfully
5. "SENT" message appears in chat

## Summary

**Root Cause**: Function likely not deployed or deployed incorrectly (as HTTP instead of Callable)

**Primary Fix**: Deploy/redeploy the function as a callable:
```bash
cd functions
npm run build
firebase deploy --only functions:tx_appendUserMessage
```

**Secondary Checks**:
- Verify function uses `.https.onCall` (not `.onRequest`)
- Verify function is exported in `index.ts`
- Verify function appears in Firebase Console as "Callable"


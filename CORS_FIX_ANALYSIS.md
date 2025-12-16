# CORS Fix - Complete Analysis

## Step 1: Client Code Verification ✅

**Result**: Client is correctly using `httpsCallable`

- ✅ No direct `fetch()` calls found
- ✅ No `axios` calls found  
- ✅ No direct `cloudfunctions.net` URLs
- ✅ Code uses `httpsCallable(functions, 'tx_appendUserMessage')`

**File**: `src/lib/transactions/clientFunctions.ts:32-49`
```typescript
export async function tx_appendUserMessage(txId: string, text: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_appendUserMessage')
  await fn({ txId, text })
}
```

---

## Step 2: Firebase Deployment Status ✅

**Result**: Function IS deployed and correctly configured

**Command Output**:
```
│ tx_appendUserMessage             │ v1      │ callable  │ us-central1 │ 256    │ nodejs20 │
```

**Status**:
- ✅ Function exists: `tx_appendUserMessage`
- ✅ Type: `callable` (not HTTP)
- ✅ Region: `us-central1` (matches client)
- ✅ Generation: `v1` (matches code)
- ✅ Status: Active

---

## Step 3: Server Implementation ✅

**Result**: Server code is correct

**File**: `functions/src/tx/appendUserMessage.ts`
```typescript
export const tx_appendUserMessage = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // ✅ Correct - using .onCall
  })
```

**Package**: `firebase-functions@4.9.0` (v1 API - correct)

---

## Step 4: Index Export ✅

**Result**: Function is exported correctly

**File**: `functions/src/index.ts:27`
```typescript
export { tx_appendUserMessage } from './tx/appendUserMessage'
```

---

## Step 5: Client Function Call ✅

**Result**: Client code is correct

**File**: `src/lib/transactions/clientFunctions.ts`
```typescript
function getFunctionsInstance() {
  const app = getFirebaseApp()
  const functions = getFunctions(app, 'us-central1')  // ✅ Explicit region
  return functions
}

export async function tx_appendUserMessage(txId: string, text: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_appendUserMessage')  // ✅ Correct name
  await fn({ txId, text })  // ✅ Correct payload
}
```

---

## Root Cause: Firebase SDK Routing Issue

**The Problem**: 
Even though everything is configured correctly, the Firebase SDK is falling back to a direct `cloudfunctions.net` URL instead of using the callable endpoint. This typically happens when:

1. **Firebase App Configuration Mismatch**
   - Client app might be pointing to wrong project
   - Environment variables might be misconfigured
   - SDK can't resolve the callable endpoint

2. **SDK Version Issue**
   - Firebase SDK version might have a bug
   - Need to check `firebase` package version

3. **Network/Environment Issue**
   - Browser blocking Firebase endpoints
   - Ad blocker interfering
   - Network configuration issue

---

## Diagnosis: Check Firebase App Configuration

**Critical Check**: Verify the Firebase app is using the correct project

**File**: `src/lib/firebase.ts`

The app uses `NEXT_PUBLIC_FIREBASE_PROJECT_ID` from environment variables.

**Verify**:
1. Check `.env.local` or deployment environment
2. Ensure `NEXT_PUBLIC_FIREBASE_PROJECT_ID=gobankless-dev`
3. Ensure all Firebase config vars match the deployed project

**Potential Issue**: If the client app is configured for a different project (e.g., `gobankless-prod`), the SDK won't find the function and might fall back to direct URL.

---

## Fix Steps

### Fix 1: Verify Environment Variables

Check that production environment has:
```bash
NEXT_PUBLIC_FIREBASE_PROJECT_ID=gobankless-dev
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=gobankless-dev.firebaseapp.com
# ... other Firebase config vars
```

### Fix 2: Force SDK to Use Callable Endpoint

If the SDK is still routing incorrectly, we can add explicit error handling:

**File**: `src/lib/transactions/clientFunctions.ts`

Add logging to verify SDK behavior:
```typescript
export async function tx_appendUserMessage(txId: string, text: string): Promise<void> {
  const functions = getFunctionsInstance()
  
  // Debug: Log the functions instance
  console.log('[DEBUG] Functions instance:', {
    app: functions.app.name,
    region: 'us-central1',
    projectId: functions.app.options.projectId
  })
  
  const fn = httpsCallable(functions, 'tx_appendUserMessage')
  
  try {
    await fn({ txId, text })
  } catch (error: any) {
    // Enhanced error logging
    console.error('[Transaction] Failed to append user message:', {
      txId,
      errorCode: error?.code,
      errorMessage: error?.message,
      errorDetails: error?.details,
      functionsApp: functions.app.options.projectId
    })
    throw error
  }
}
```

### Fix 3: Check Firebase SDK Version

Verify `firebase` package version in `package.json`:
- Should be `^10.x` or `^9.x` (recent version)
- Older versions might have callable routing bugs

### Fix 4: Redeploy Function (Force Update)

Even though function is deployed, force redeploy to ensure latest code:
```bash
cd functions
npm run build
firebase deploy --only functions:tx_appendUserMessage --force
```

---

## Expected Network Request (When Working)

**Correct Callable Request**:
- Should NOT go to `cloudfunctions.net/txAppendUserMessage`
- Should go to Firebase callable endpoint (internal routing)
- Headers should include Firebase auth tokens
- No CORS preflight needed

**Current (Broken) Request**:
- Going to `cloudfunctions.net/txAppendUserMessage` directly
- CORS preflight failing
- SDK falling back to direct URL (indicates routing failure)

---

## Most Likely Fix

**Hypothesis**: Firebase SDK can't resolve the callable endpoint, possibly due to:
1. Project ID mismatch between client config and deployed function
2. Firebase SDK version issue
3. Network/firewall blocking Firebase internal routing

**Recommended Action**:
1. Verify environment variables match `gobankless-dev`
2. Check Firebase SDK version
3. Add debug logging to see what SDK is doing
4. Test in incognito mode (rule out browser extensions)

---

## Next Steps (Awaiting Permission)

1. Add debug logging to `tx_appendUserMessage` to see SDK behavior
2. Check Firebase SDK version in `package.json`
3. Verify environment variables in production
4. Test with explicit project ID in `getFunctions()`

**Do not proceed without permission.**


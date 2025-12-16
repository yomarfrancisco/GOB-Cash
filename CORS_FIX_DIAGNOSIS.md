# CORS Fix Diagnosis - Step-by-Step Analysis

## Step 1: Verify Client Uses httpsCallable (No Direct Fetch)

### Search Results:

✅ **No direct fetch/axios calls found**:
- No matches for `cloudfunctions.net/txAppendUserMessage`
- No matches for `fetch(` near message append code
- No matches for `axios` near message append code

✅ **Client code verified** (`src/lib/transactions/clientFunctions.ts:32-49`):
```typescript
export async function tx_appendUserMessage(txId: string, text: string): Promise<void> {
  const functions = getFunctionsInstance()
  const fn = httpsCallable(functions, 'tx_appendUserMessage')  // ✅ Using httpsCallable
  
  try {
    await fn({ txId, text })  // ✅ Proper callable call
  } catch (error: any) {
    // Error handling
  }
}
```

**Conclusion**: Client is correctly using `httpsCallable` - no direct fetch calls.

---

## Step 2: Verify Firebase Deployment Status

### Commands to Run:

```bash
firebase use gobankless-dev
firebase functions:list
```

**Expected Output**: Should show `tx_appendUserMessage` in the list.

### Check Firebase Console:
1. Go to Firebase Console → Functions
2. Look for `tx_appendUserMessage`
3. Verify:
   - ✅ Type: "Callable" (not "HTTP")
   - ✅ Region: `us-central1`
   - ✅ Status: "Active"

**If function is missing or shows as "HTTP"**: This is the root cause.

---

## Step 3: Verify Server Implementation

### Current Implementation (`functions/src/tx/appendUserMessage.ts`):

✅ **Using firebase-functions v1 (classic)**:
```typescript
import * as functions from 'firebase-functions'

export const tx_appendUserMessage = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // ✅ Correct - using .onCall
  })
```

**Status**: ✅ Correct implementation (v1 style, `.onCall`)

**Note**: Using `firebase-functions@^4.9.0` which is v1 API. If you need v2, would need to upgrade and use `onCall` from `firebase-functions/v2/https`.

---

## Step 4: Verify Index Export

### Current Export (`functions/src/index.ts:27`):

✅ **Correctly exported**:
```typescript
export { tx_appendUserMessage } from './tx/appendUserMessage'
```

**Status**: ✅ Export is correct

---

## Step 5: Verify Client Function Call

### Current Implementation (`src/lib/transactions/clientFunctions.ts`):

✅ **Correct implementation**:
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

**Status**: ✅ Client code is correct

---

## Root Cause Analysis

Based on the error message showing:
```
Access to fetch at 'https://us-central1-gobankless-dev.cloudfunctions.net/txAppendUserMessage'
```

**Most Likely Causes**:

1. **Function Not Deployed** (90% probability)
   - Function doesn't exist in Firebase
   - Need to deploy: `firebase deploy --only functions:tx_appendUserMessage`

2. **Function Deployed as HTTP Instead of Callable** (5% probability)
   - Old version deployed with `.onRequest` instead of `.onCall`
   - Need to redeploy with correct type

3. **Firebase SDK Routing Issue** (5% probability)
   - SDK falling back to direct URL when callable endpoint not found
   - Usually means function not deployed

---

## Fix Steps

### Step 1: Build Functions

```bash
cd functions
npm run build
```

### Step 2: Deploy Function

```bash
firebase deploy --only functions:tx_appendUserMessage --force
```

### Step 3: Verify Deployment

```bash
firebase functions:list | grep tx_appendUserMessage
```

Should show:
```
tx_appendUserMessage    us-central1  Callable  Active
```

### Step 4: Test in Browser

1. Open `gobankless.app/profile`
2. Create deposit → Click "I've deposited"
3. Check Network tab:
   - Should see request to `firebaseremoteconfig.googleapis.com` (not `cloudfunctions.net`)
   - Should NOT see CORS error
4. Verify:
   - "SENT" message appears in chat
   - Ema acknowledgement appears
   - chatStep advances to `WAITING_FOR_SENT_PROOF`

---

## Expected Network Request (When Working)

**Correct Callable Request**:
- URL: `https://firebaseremoteconfig.googleapis.com/v1/projects/gobankless-dev/namespaces/firebase:fetchThrottle?key=...`
- Method: POST
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer ...` (Firebase auth token)
- Body: `{ data: { txId: "...", text: "SENT" } }`

**Incorrect Direct Fetch** (what we're seeing):
- URL: `https://us-central1-gobankless-dev.cloudfunctions.net/txAppendUserMessage`
- Method: POST
- CORS error on preflight

---

## Summary

**Diagnosis**:
- ✅ Client code is correct (uses httpsCallable)
- ✅ Server code is correct (uses .onCall)
- ✅ Exports are correct
- ❓ **Function likely not deployed** (needs verification)

**Fix**:
1. Deploy the function: `firebase deploy --only functions:tx_appendUserMessage --force`
2. Verify in Firebase Console it shows as "Callable"
3. Test in browser

**If deployment doesn't fix it**, check:
- Firebase project configuration
- Network/firewall blocking Firebase endpoints
- Browser cache (try incognito)


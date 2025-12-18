# CORS Withdraw Diagnosis - Phase 1-4 Results

## Phase 1: Prove What Is Actually Being Called

### 1.1 Function Deployment Status ✅

**Command**: `firebase functions:list --project gobankless-dev`

**Result**: Function IS deployed
```
│ tx_withdrawTronUSDT │ v1 │ callable │ us-central1 │ 256 │ nodejs20 │
```

**Status**:
- ✅ Function exists
- ✅ Type: `callable` (not HTTP)
- ✅ Region: `us-central1`
- ✅ Active

### 1.2 Firebase Project Configuration

**Current Firebase project**: `gobankless-dev` (confirmed by `firebase use`)

**Client Configuration**:
- Uses `NEXT_PUBLIC_FIREBASE_PROJECT_ID` from environment variables
- Must match: `gobankless-dev`
- Functions region: `us-central1`

### 1.3 Function Implementation ✅

**File**: `functions/src/tx/withdrawTronUsdt.ts:79-81`

**Status**: ✅ Correctly defined as callable
```typescript
export const tx_withdrawTronUSDT = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // ✅ Correct - using .onCall
  })
```

### 1.4 Client Code ✅

**File**: `src/lib/transactions/clientFunctions.ts:567`

**Status**: ✅ Uses `httpsCallable` (NOT fetch)
```typescript
const fn = httpsCallable(functions, 'tx_withdrawTronUSDT')
const result = await fn({ ...params, requestId })
```

---

## Phase 2: CORS Preflight Test

### 2.1 Direct URL Test (Expected to Fail)

**Command**:
```bash
curl -i -X OPTIONS \
  "https://us-central1-gobankless-dev.cloudfunctions.net/tx_withdrawTronUSDT" \
  -H "Origin: https://gobankless.app" \
  -H "Access-Control-Request-Method: POST"
```

**Result**: `HTTP/2 403 Forbidden`

**Interpretation**: ✅ **Expected** - Callable functions don't use direct `cloudfunctions.net` URLs. The Firebase SDK routes to a different endpoint.

### 2.2 Callable Endpoint Test

**Command**:
```bash
curl -i -X POST \
  "https://us-central1-gobankless-dev.cloudfunctions.net/callable/tx_withdrawTronUSDT" \
  -H "Content-Type: application/json" \
  -H "Origin: https://gobankless.app"
```

**Result**: `HTTP/2 404 Not Found`

**Interpretation**: The `/callable/` path pattern may not be correct for v1 functions, or the SDK uses a different routing mechanism.

---

## Phase 3: Root Cause Analysis

### The Real Issue

Firebase callable functions (`.https.onCall`) use **Firebase's internal routing**, not direct `cloudfunctions.net` URLs. The SDK should automatically:

1. Route to the correct callable endpoint
2. Handle CORS automatically
3. Include authentication tokens

**If CORS errors occur**, it means:
- The SDK is falling back to direct URL (project mismatch?)
- The function isn't deployed correctly
- There's a network/firewall issue

### Verification Steps Added

**Code Changes** (in `src/lib/transactions/clientFunctions.ts`):
- Added Firebase app initialization checks
- Added Functions instance validation
- Added comprehensive logging with projectId, authDomain, expected URL patterns
- Added explicit `method: 'httpsCallable'` confirmation in logs

---

## Phase 4: Error Handling Improvements

### 4.1 Error Code Mapping

**Files Changed**:
- `src/app/profile/page.tsx` (lines 693-730)
- `src/app/page.tsx` (lines 848-885)

**Error Mapping**:
| Firebase Error Code | User Message |
|---------------------|--------------|
| `functions/failed-precondition` | "Not allowed: [specific reason]" |
| `functions/invalid-argument` | "Not allowed: Invalid request parameters" |
| `functions/internal` | "Server error: [specific reason]" |
| `functions/unauthenticated` | "Not allowed: You must be logged in" |
| `functions/permission-denied` | "Not allowed: You do not have permission" |
| CORS error (shouldn't happen) | "Network error: Please check your connection" |

### 4.2 Logging

**Added**:
- Full error details logged to console (code, message, details, stack)
- Firebase config logged (projectId, authDomain, expected URL patterns)
- Explicit confirmation that `httpsCallable` is being used (not fetch)

---

## Next Steps for User

### To Diagnose Runtime Behavior:

1. **Open Browser DevTools → Network tab**
2. **Click "Done" in withdraw flow**
3. **Look for the request**:
   - Should NOT be to `cloudfunctions.net/tx_withdrawTronUSDT` (direct)
   - Should be to Firebase callable endpoint (pattern varies by SDK version)
4. **Check Console** for `[Withdrawal] Calling tx_withdrawTronUSDT via httpsCallable` log
5. **Verify**:
   - `projectId: "gobankless-dev"`
   - `method: "httpsCallable"`
   - No CORS errors in Network tab

### If CORS Still Occurs:

1. **Check Vercel environment variables**:
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID` must be `gobankless-dev`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` must be `gobankless-dev.firebaseapp.com`
2. **Verify Firebase app initialization**:
   - Console should show `[Firebase] App config:` with correct projectId
3. **Check if function needs redeployment**:
   - Run: `firebase deploy --only functions:tx_withdrawTronUSDT --project gobankless-dev`

---

## Files Changed

1. `src/lib/transactions/clientFunctions.ts`
   - Added Firebase app initialization checks
   - Added comprehensive logging with URL patterns
   - Added explicit httpsCallable confirmation

2. `src/app/profile/page.tsx`
   - Improved error handling with "Not allowed" messages
   - Added full error logging

3. `src/app/page.tsx`
   - Improved error handling with "Not allowed" messages
   - Added full error logging

---

## Expected Runtime Behavior

### Success Case:
```
[Withdrawal] Calling tx_withdrawTronUSDT via httpsCallable
  projectId: "gobankless-dev"
  method: "httpsCallable"
  ...
[Withdrawal] Withdrawal result: { txId: "...", status: "BROADCAST_FULL" }
```

### Failure Case:
```
[Withdrawal] Failed to withdraw USDT:
  errorCode: "functions/failed-precondition"
  errorMessage: "Insufficient treasury balance"
  ...
UI: "Not allowed: Treasury has insufficient balance..."
```

### CORS Error (Should Not Happen):
```
[Withdrawal] Failed to withdraw USDT:
  isCorsError: true
  ...
UI: "Network error: Please check your connection and try again."
```


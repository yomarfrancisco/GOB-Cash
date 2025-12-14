# Fix CORS 403 Error - IAM Permissions

## Problem
The function `tx_createBankDepositRequest` is returning 403 Forbidden on CORS preflight requests, indicating IAM invoker permissions are missing.

## Root Cause
Callable functions require `allUsers` to have `roles/cloudfunctions.invoker` permission to allow unauthenticated preflight requests.

## Solution

### Step 1: Install gcloud CLI (if not installed)
```bash
# macOS
brew install google-cloud-sdk

# Or download from: https://cloud.google.com/sdk/docs/install
```

### Step 2: Authenticate with gcloud
```bash
gcloud auth login
gcloud config set project gobankless-dev
```

### Step 3: Check Current IAM Policy
```bash
gcloud functions get-iam-policy tx_createBankDepositRequest \
  --region=us-central1 \
  --project=gobankless-dev
```

### Step 4: Add Public Invoker Permission
```bash
gcloud functions add-iam-policy-binding tx_createBankDepositRequest \
  --region=us-central1 \
  --project=gobankless-dev \
  --member="allUsers" \
  --role="roles/cloudfunctions.invoker"
```

### Step 5: Verify Function Configuration
```bash
gcloud functions describe tx_createBankDepositRequest \
  --region=us-central1 \
  --project=gobankless-dev
```

**Check these fields:**
- `httpsTrigger` or `callable` status
- `ingressSettings` (should allow public internet)
- `serviceAccountEmail`
- Generation (1st gen vs 2nd gen)

### Step 6: Test CORS Preflight
```bash
curl -i -X OPTIONS \
  "https://us-central1-gobankless-dev.cloudfunctions.net/tx_createBankDepositRequest" \
  -H "Origin: https://gobankless.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

**Success criteria:**
- Response is 200/204 (not 403)
- Includes `Access-Control-Allow-Origin: https://gobankless.app` (or `*`)
- Includes `Access-Control-Allow-Methods` with POST

## Alternative: Use Firebase Console

If gcloud is not available:

1. Go to: https://console.firebase.google.com/project/gobankless-dev/functions
2. Click on `tx_createBankDepositRequest`
3. Go to "Permissions" tab
4. Click "Add Principal"
5. Add:
   - Principal: `allUsers`
   - Role: `Cloud Functions Invoker`
6. Save

## Verification

After adding permissions, test again:
```bash
curl -i -X OPTIONS \
  "https://us-central1-gobankless-dev.cloudfunctions.net/tx_createBankDepositRequest" \
  -H "Origin: https://gobankless.app" \
  -H "Access-Control-Request-Method: POST"
```

Should return 200/204 with CORS headers.


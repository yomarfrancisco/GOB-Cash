# Running Directory Backfill

The backfill function is deployed and can be called from the browser console when signed in.

## Option 1: Browser Console (Recommended)

1. Sign in to the app
2. Open browser console (F12 or Cmd+Option+I)
3. Run:

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '@/lib/firebase'

const functions = getFunctions(getFirebaseApp(), 'us-central1')
const backfill = httpsCallable(functions, 'admin_backfillDirectory')
const result = await backfill({})
console.log('Backfill result:', result.data)
```

Expected output:
```javascript
{
  success: <number>,  // Users successfully processed
  skipped: <number>,  // Users skipped (no handle, etc.)
  errors: <number>    // Users that failed
}
```

## Option 2: Local Script (Requires Service Account)

If you have a service account JSON file:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
node scripts/runBackfill.js
```

## Verification

After running backfill, verify in Firebase Console:

1. Check `/publicDirectory` collection - should have entries with `ownerUserId` set
2. Check `/directoryPrivate` collection - should have entries with `email` and `phoneE164`
3. Count should match number of users with handles + email/phone


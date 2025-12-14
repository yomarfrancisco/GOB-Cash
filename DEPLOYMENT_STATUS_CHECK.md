# Cloud Function Deployment Status & Backfill Check

## ✅ Deployment Status: VERIFIED

### Functions Deployed (as of check)

All required functions are **deployed and live** in `gobankless-dev`:

| Function | Type | Status | Region |
|----------|------|--------|--------|
| `onUserWrite` | Firestore trigger | ✅ Deployed | us-central1 |
| `directory_syncMyRecord` | HTTPS callable | ✅ Deployed | us-central1 |
| `admin_backfillDirectory` | HTTPS callable | ✅ Deployed | us-central1 |

**Verification Command:**
```bash
firebase functions:list --project gobankless-dev
```

---

## ⚠️ Backfill Status: UNKNOWN

### What Should Have Happened

1. **Automatic Sync (via `onUserWrite`):**
   - Triggers when `/users/{uid}` documents are created or updated
   - Should populate `/publicDirectory/{handle}` and `/directoryPrivate/{handle}`
   - **Issue:** Only triggers on NEW writes - won't backfill existing users

2. **Manual Backfill (via `admin_backfillDirectory`):**
   - Should be run once to migrate all existing users
   - **Status:** Unknown if this has been executed

### How to Check if Backfill Ran

**Option 1: Check Firebase Console**
1. Go to Firestore Console → `publicDirectory` collection
2. If collection exists and has documents → backfill likely ran
3. If collection is empty or missing → backfill hasn't run

**Option 2: Check Cloud Function Logs**
```bash
firebase functions:log --project gobankless-dev --only admin_backfillDirectory
```

Look for:
- `[backfillDirectory] Starting directory backfill...`
- `[backfillDirectory] Backfill complete { success: X, skipped: Y, errors: Z }`

**Option 3: Check `onUserWrite` Activity**
```bash
firebase functions:log --project gobankless-dev --only onUserWrite
```

Look for:
- `[onUserWrite] Successfully synced user to directory`
- `[syncDirectoryForUser] Upserted publicDirectory`
- `[syncDirectoryForUser] Upserted directoryPrivate`

---

## 🔍 Root Cause Analysis

### Why `/publicDirectory` is Empty

**Most Likely:**
1. ✅ Functions are deployed
2. ❌ Backfill has NOT been run
3. ❌ No new user writes since deployment (so `onUserWrite` hasn't triggered)

**Evidence:**
- Functions exist in Firebase Console
- `/publicDirectory` collection doesn't exist or is empty (from screenshots)
- `/directoryPrivate` collection doesn't exist or is empty (from screenshots)

---

## 🚀 Next Steps: Run Backfill

### Option A: Browser Console (Easiest)

1. Sign in to the app (any user)
2. Open browser console (F12)
3. Run:

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '@/lib/firebase'

const functions = getFunctions(getFirebaseApp(), 'us-central1')
const backfill = httpsCallable(functions, 'admin_backfillDirectory')
const result = await backfill({})
console.log('Backfill result:', result.data)
```

**Expected Output:**
```javascript
{
  success: 15,  // Number of users synced
  skipped: 2,  // Users without handles
  errors: 0     // Users that failed
}
```

### Option B: Firebase CLI (Check Logs First)

1. Check if backfill already ran:
   ```bash
   firebase functions:log --project gobankless-dev --only admin_backfillDirectory --limit 50
   ```

2. If no backfill logs found, run it via browser console (Option A)

### Option C: Trigger Sync for Existing Users

If you want to test `onUserWrite` without running full backfill:

1. Update any user document in Firebase Console (e.g., change `displayName`)
2. This will trigger `onUserWrite`
3. Check logs:
   ```bash
   firebase functions:log --project gobankless-dev --only onUserWrite --limit 10
   ```

---

## ✅ Verification After Backfill

1. **Check Collections:**
   - `/publicDirectory` should have documents (one per user with handle)
   - `/directoryPrivate` should have documents (one per user with email + phone)

2. **Check Document Structure:**
   - `/publicDirectory/{handle}` should have:
     - `handle: "$..."`
     - `ownerUserId: "..."` (NOT null)
     - `displayName: "..."`
     - `phoneCountry: "..."` (if available)
   
   - `/directoryPrivate/{handle}` should have:
     - `handle: "$..."`
     - `ownerUserId: "..."` (NOT null)
     - `email: "..."`
     - `phoneE164: "+..."`

3. **Test Frontend:**
   - Open Search popup (signed out)
   - Should see directory contacts
   - Console should show: `[usePublicDirectoryContacts] Loaded public directory contacts { count: X }`

---

## 📊 Summary

| Item | Status | Notes |
|------|--------|-------|
| Functions Deployed | ✅ | All 3 functions live |
| Rules Deployed | ✅ | From DEPLOYMENT_REPORT.md |
| Indexes Deployed | ✅ | From DEPLOYMENT_REPORT.md |
| Backfill Executed | ❓ | **Needs verification** |
| Collections Populated | ❌ | `/publicDirectory` empty (from screenshots) |
| Frontend Working | ❌ | Returns 0 contacts (expected - no data) |

**Action Required:** Run backfill to populate collections.



# Directory Public/Private Split - Deployment Report

## 1. Environment Confirmation ✅

**Project:** `gobankless-dev`  
**Region:** `us-central1`  
**Confirmed via:** `firebase use` and `firebase projects:list`

## 2. Build & Typecheck ✅

**Frontend Build:**
```bash
pnpm build
```
✅ Compiled successfully  
✅ Type checking passed  
✅ No errors

**Functions Build:**
```bash
cd functions && pnpm build
```
✅ TypeScript compilation successful  
✅ No errors

## 3. Commit & Push ✅

**Commit Hash:** `97815d4` (latest: fix for backfill)  
**Previous Commit:** `e70312c` (main implementation)

**Files Committed:**
- `src/types/contacts.ts` - New types
- `src/hooks/usePublicDirectoryContacts.ts` - Updated to use publicDirectory
- `src/hooks/useDirectoryPrivateContacts.ts` - NEW hook
- `src/components/SearchSheet.tsx` - Updated to use new hooks
- `src/components/PaymentDetailsSheet.tsx` - Merges directory contacts
- `functions/src/syncDirectoryForUser.ts` - NEW Cloud Function
- `functions/src/admin/backfillDirectory.ts` - NEW backfill script
- `firestore.rules` - Added publicDirectory and directoryPrivate rules
- `firestore.indexes.json` - Added transactions index

**Vercel:** Will auto-deploy from `main` branch (commit `97815d4`)

## 4. Firestore Rules & Indexes Deployed ✅

**Deploy Command:**
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

**Result:** ✅ Successfully deployed

**Rules Verified:**
- `publicDirectory/{handle}`: `allow read: if true` ✅
- `directoryPrivate/{handle}`: `allow read: if request.auth != null` ✅
- Both collections: `allow write: if false` (Cloud Functions only) ✅

**Indexes Deployed:**
- `transactions` collection: `participants` (array-contains) + `createdAt` (desc) ✅

## 5. Functions Deployed ✅

**Deploy Command:**
```bash
firebase deploy --only functions
```

**Functions List:**
```
✅ onUserWrite (trigger) - us-central1
✅ directory_syncMyRecord (callable) - us-central1  
✅ admin_backfillDirectory (callable) - us-central1
```

**All functions deployed to:** `us-central1` (matches client region)

## 6. Backfill Status

**Function Deployed:** ✅ `admin_backfillDirectory` is live

**To Run Backfill:**

**Option A: Browser Console (when signed in)**
```javascript
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '@/lib/firebase'

const functions = getFunctions(getFirebaseApp(), 'us-central1')
const backfill = httpsCallable(functions, 'admin_backfillDirectory')
const result = await backfill({})
console.log('Backfill result:', result.data)
```

**Option B: Local Script (requires service account)**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
node scripts/runBackfill.js
```

**Expected Output:**
```javascript
{
  success: <number>,  // Users successfully synced to both collections
  skipped: <number>,  // Users without handles
  errors: <number>    // Users that failed
}
```

## 7. Acceptance Tests (Manual Verification Required)

### Test A: Pre-auth Cannot Read Private ✅ (Code Enforced)

**What to Check:**
1. Open incognito window (signed out)
2. Open SearchSheet
3. **Expected:** See directory contacts with names + corridor subtitles
4. **Expected:** NO email/phone visible
5. In console, run:
   ```javascript
   import { collection, getDocs } from 'firebase/firestore'
   import { getFirestoreDb } from '@/lib/firebase'
   
   const db = getFirestoreDb()
   const ref = collection(db, 'directoryPrivate')
   getDocs(ref).catch(err => console.log('Expected permission error:', err.code, err.message))
   ```
6. **Expected:** Permission denied error (code: `permission-denied`)

**Code Verification:**
- `usePublicDirectoryContacts` only reads from `publicDirectory` ✅
- `useDirectoryPrivateContacts` only runs when `isAuthed === true` ✅
- Firestore rules block pre-auth reads of `directoryPrivate` ✅

### Test B: Post-auth Shows Phone/Email ✅ (Code Ready)

**What to Check:**
1. Sign in to app
2. Open SearchSheet
3. **Expected:** See same directory contacts
4. **Expected:** Email + phone shown as second subtitle line for directory contacts
5. Check console logs for:
   ```
   [useDirectoryPrivateContacts] Enriched directory contact example: {
     handle: "$...",
     email: "...",
     phone: "+...",
     ownerUserId: "..."
   }
   ```
6. **Expected:** At least 3 contacts with non-null email/phone

**Code Verification:**
- `SearchSheet` uses `useDirectoryPrivateContacts` when `isAuthed === true` ✅
- `ContactListWithIndex` shows email/phone for `gobankless-contact` source ✅
- Firestore rules allow authenticated reads of `directoryPrivate` ✅

### Test C: New User Contributes Automatically ✅ (Function Deployed)

**What to Check:**
1. Create a new test user (or update existing user's handle/email/phone)
2. Wait 5-10 seconds for Cloud Function trigger
3. Check Firebase Console:
   - `/publicDirectory/{handle}` should exist with `ownerUserId` set
   - `/directoryPrivate/{handle}` should exist with `email` and `phoneE164`
4. **Expected:** Both documents created/updated within seconds

**Code Verification:**
- `onUserWrite` trigger deployed ✅
- Function syncs to both collections ✅
- `ownerUserId` always set (never null) ✅

### Test D: PaymentDetailsSheet Merges Directory ✅ (Code Ready)

**What to Check:**
1. Sign in to app
2. Open PaymentDetailsSheet (via $ button → Pay/Request)
3. **Expected:** See both user contacts AND directory contacts
4. **Expected:** Directory contacts show email/phone when signed in
5. **Expected:** No duplicates (user contacts take priority)

**Code Verification:**
- `PaymentDetailsSheet` merges `userContacts` + `enrichedDirectoryContacts` ✅
- Deduplication by handle ✅
- Email/phone shown via `ContactListWithIndex` ✅

## 8. Verification Checklist

### Code Verification ✅
- [x] Pre-auth Search reads only from `publicDirectory`
- [x] Post-auth Search enriches with `directoryPrivate`
- [x] Firestore rules block pre-auth access to `directoryPrivate`
- [x] Cloud Function syncs on user write
- [x] Backfill function deployed and callable

### Deployment Verification ✅
- [x] Rules deployed to `gobankless-dev`
- [x] Indexes deployed
- [x] Functions deployed to `us-central1`
- [x] Code committed to `main` branch
- [x] Vercel will auto-deploy

### Data Verification (Requires Manual Check)
- [ ] Backfill run (or verify existing users synced)
- [ ] `/publicDirectory` has entries with `ownerUserId` set
- [ ] `/directoryPrivate` has entries with `email` and `phoneE164`
- [ ] New user signup triggers sync (test manually)

## 9. Next Steps

1. **Run Backfill** (see section 6 above)
2. **Test Acceptance Criteria** (see section 7 above)
3. **Monitor Cloud Function Logs** for any errors
4. **Verify Vercel Production** is on commit `97815d4`

## 10. Rollback Plan (If Needed)

If issues are found:

1. **Revert Frontend:**
   ```bash
   git revert 97815d4
   git push origin main
   ```

2. **Revert Functions:**
   ```bash
   # Remove new functions from index.ts exports
   firebase deploy --only functions
   ```

3. **Revert Rules:**
   ```bash
   git checkout HEAD~1 firestore.rules
   firebase deploy --only firestore:rules
   ```

## Summary

✅ **All code deployed**  
✅ **All functions live**  
✅ **Rules and indexes deployed**  
⏳ **Backfill needs to be run** (see section 6)  
⏳ **Acceptance tests need manual verification** (see section 7)

The implementation is complete and deployed. The backfill can be run via browser console or local script. All acceptance tests can be verified manually in the deployed app.





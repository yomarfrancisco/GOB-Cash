# Directory Implementation Verification Checklist

## Prerequisites ✅

- [ ] Cloud Functions deployed: `firebase functions:list --project gobankless-dev`
- [ ] Firestore rules deployed: `firebase deploy --only firestore:rules`
- [ ] Firestore indexes deployed: `firebase deploy --only firestore:indexes`
- [ ] Frontend deployed to Vercel (latest commit)

---

## Step 1: Test Pipeline (Single User) ✅

**Command:**
```bash
node scripts/test-onUserWrite.js <uid>
```

**Example:**
```bash
node scripts/test-onUserWrite.js xHKmkizXhPOU25vwTIB6dxhMzSH2
```

**Verification:**
- [ ] Script runs without errors
- [ ] `/publicDirectory/{handle}` is created/updated
- [ ] `/directoryPrivate/{handle}` is created/updated (if user has email + phone)
- [ ] `ownerUserId` is set (NOT null) in both documents
- [ ] Cloud Function logs show: `[onUserWrite] Successfully synced user to directory`

**Screenshot Required:**
- Firebase Console showing `/publicDirectory/{handle}` document with all fields
- Firebase Console showing `/directoryPrivate/{handle}` document with email/phone

**Logs to Check:**
```bash
firebase functions:log --project gobankless-dev --only onUserWrite
```

---

## Step 2: Set Admin Claim ✅

**Command:**
```bash
firebase auth:users:set-claims <your-uid> --project gobankless-dev --claims '{"admin":true}'
```

**Verification:**
- [ ] Custom claim set successfully
- [ ] User signs out and signs back in (to refresh token)
- [ ] Token includes `admin: true` (check in browser console: `firebase.auth().currentUser.getIdTokenResult()`)

---

## Step 3: Run Backfill ✅

**Command:**
```bash
node scripts/runBackfill.js
```

**Verification:**
- [ ] Script completes with `success > 0`
- [ ] No fatal errors
- [ ] Summary shows: `{ success: X, skipped: Y, errors: Z }`

**Expected Output:**
```
[backfill] Starting directory backfill...
[backfill] Found 15 users to process
[backfill] Upserted publicDirectory { handle: '$...', uid: '...' }
[backfill] Upserted directoryPrivate { handle: '$...', uid: '...' }
...
[backfill] Backfill complete { success: 13, skipped: 2, errors: 0 }

✅ Backfill completed: { success: 13, skipped: 2, errors: 0 }
```

---

## Step 4: Verify Collections Populated ✅

### Check `/publicDirectory` Collection

**In Firebase Console:**
1. Navigate to Firestore → `publicDirectory` collection
2. Verify documents exist (count should match users with handles)

**Check Document Structure:**
- [ ] `handle: "$..."` (normalized, lowercase, with $ prefix)
- [ ] `ownerUserId: "..."` (NOT null, matches user UID)
- [ ] `displayName: "..."` (or null)
- [ ] `phoneCountry: "..."` (or null, ISO2 code like "ZA", "MZ")
- [ ] `isAgent: true/false`
- [ ] `createdAt: Timestamp`
- [ ] `updatedAt: Timestamp`

**Screenshot Required:**
- Firebase Console showing `publicDirectory` collection with at least 3 documents
- One document expanded showing all fields

### Check `/directoryPrivate` Collection

**In Firebase Console:**
1. Navigate to Firestore → `directoryPrivate` collection
2. Verify documents exist (count should match users with handles + email + phone)

**Check Document Structure:**
- [ ] `handle: "$..."` (normalized, lowercase, with $ prefix)
- [ ] `ownerUserId: "..."` (NOT null, matches user UID)
- [ ] `email: "..."` (NOT null, valid email)
- [ ] `phoneE164: "+..."` (NOT null, E164 format)
- [ ] `phoneCountry: "..."` (or null, ISO2 code)
- [ ] `createdAt: Timestamp`
- [ ] `updatedAt: Timestamp`

**Screenshot Required:**
- Firebase Console showing `directoryPrivate` collection with at least 3 documents
- One document expanded showing email and phoneE164 fields

---

## Step 5: Verify Frontend - Pre-auth Search ✅

**Test Steps:**
1. Open app in incognito window (signed out)
2. Click Search icon (bottom nav)
3. Observe Search popup

**Expected Behavior:**
- [ ] Directory contacts are visible (handles like `$abiharrison`, `$andrewswan`)
- [ ] Subtitle shows corridor text (e.g., "SADC cash corridor", "International corridor", "GoBankless member")
- [ ] NO email addresses visible
- [ ] NO phone numbers visible
- [ ] Console shows: `[usePublicDirectoryContacts] Loaded public directory contacts { count: X }` where X > 0

**Screenshot Required:**
- Search popup showing directory contacts with corridor subtitles
- Browser console showing count > 0

**Console Check:**
```javascript
// Should NOT be able to read directoryPrivate
import { collection, getDocs } from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'

const db = getFirestoreDb()
const ref = collection(db, 'directoryPrivate')
getDocs(ref).catch(err => {
  console.log('Expected permission error:', err.code) // Should be 'permission-denied'
})
```

---

## Step 6: Verify Frontend - Post-auth Search ✅

**Test Steps:**
1. Sign in to app
2. Click Search icon (bottom nav)
3. Observe Search popup

**Expected Behavior:**
- [ ] Same directory contacts visible as pre-auth
- [ ] Subtitle shows ONLY: `phone • email` (e.g., "+27601234567 • user@example.com")
- [ ] NO corridor text in subtitle
- [ ] Console shows: `[useDirectoryPrivateContacts] Enriched X contacts`

**Screenshot Required:**
- Search popup showing directory contacts with phone/email subtitles (no corridor text)
- Browser console showing enrichment logs

**Console Check:**
```javascript
// Should see enriched contacts
// Check console for:
[useDirectoryPrivateContacts] Enriched directory contact example: {
  handle: "$...",
  email: "...",
  phone: "+...",
  ownerUserId: "..."
}
```

---

## Step 7: Verify Frontend - Payment Details Sheet ✅

**Test Steps:**
1. Sign in to app
2. Click $ button (center action button)
3. Choose "Pay" or "Request"
4. Enter amount
5. Observe Payment Details Sheet contact list

**Expected Behavior:**
- [ ] Directory contacts appear in list (merged with user's personal contacts)
- [ ] Subtitle shows ONLY: `phone • email` (same as post-auth Search)
- [ ] NO corridor text in subtitle
- [ ] No duplicates (user contacts take priority over directory contacts)

**Screenshot Required:**
- Payment Details Sheet showing directory contacts with phone/email subtitles

---

## Step 8: Verify New User Auto-Sync ✅

**Test Steps:**
1. Create a new test user (or update existing user's handle/email/phone)
2. Wait 5-10 seconds
3. Check Firebase Console

**Expected Behavior:**
- [ ] `/publicDirectory/{handle}` is created automatically
- [ ] `/directoryPrivate/{handle}` is created automatically (if user has email + phone)
- [ ] `ownerUserId` is set correctly
- [ ] Cloud Function logs show: `[onUserWrite] Successfully synced user to directory`

**Screenshot Required:**
- Firebase Console showing new documents in both collections
- Cloud Function logs showing successful sync

---

## Step 9: Lock Down Admin Function ✅

**After backfill is complete and verified:**

**Option A: Remove from Exports (Recommended)**
- [ ] Remove `admin_backfillDirectory` from `functions/src/index.ts` exports
- [ ] Redeploy: `firebase deploy --only functions`
- [ ] Verify function is no longer listed: `firebase functions:list --project gobankless-dev`

**Option B: Keep Function but Add Secret**
- [ ] Update function to require secret (see DIRECTORY_BACKFILL_GUIDE.md Step 6)
- [ ] Set secret: `firebase functions:config:set backfill.secret="..." --project gobankless-dev`
- [ ] Redeploy: `firebase deploy --only functions`
- [ ] Verify function requires secret to run

---

## Final Verification Summary

| Test | Status | Notes |
|------|--------|-------|
| Pipeline Test (single user) | ⬜ | Screenshot + logs required |
| Admin Claim Set | ⬜ | User must sign out/in after |
| Backfill Executed | ⬜ | Success count > 0 |
| Collections Populated | ⬜ | Both collections have documents |
| Pre-auth Search | ⬜ | Handles + corridor, no email/phone |
| Post-auth Search | ⬜ | Handles + phone/email only |
| Payment Details | ⬜ | Same as post-auth Search |
| New User Auto-Sync | ⬜ | onUserWrite triggers correctly |
| Admin Function Locked | ⬜ | Removed or secured |

---

## Troubleshooting

### If `test-onUserWrite.js` fails:
- Check Cloud Function logs: `firebase functions:log --project gobankless-dev --only onUserWrite`
- Verify function is deployed: `firebase functions:list --project gobankless-dev`
- Check user document has required fields (handle, email, phone)

### If backfill fails with "permission-denied":
- Verify admin claim is set: `firebase auth:users:get <uid> --project gobankless-dev`
- User must sign out and sign back in after setting claim
- Check token: `firebase.auth().currentUser.getIdTokenResult()` in browser console

### If collections are empty after backfill:
- Check backfill script output for errors
- Verify user documents have handles
- Check Cloud Function logs for errors

### If pre-auth Search shows 0 contacts:
- Verify `/publicDirectory` collection has documents
- Check browser console for query errors
- Verify Firestore rules allow public read: `allow read: if true`

### If post-auth Search doesn't show email/phone:
- Verify `/directoryPrivate` collection has documents
- Check browser console for enrichment logs
- Verify user is signed in: `firebase.auth().currentUser !== null`
- Check Firestore rules allow authenticated read: `allow read: if request.auth != null`

---

## Sign-Off

**Completed by:** _________________  
**Date:** _________________  
**Screenshots attached:** ⬜ Yes ⬜ No  
**All tests passing:** ⬜ Yes ⬜ No



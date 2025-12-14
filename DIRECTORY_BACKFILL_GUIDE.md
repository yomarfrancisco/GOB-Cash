# Directory Backfill Guide

## Step 1: Verify Pipeline Works (Test onUserWrite)

Before running full backfill, verify that `onUserWrite` trigger works correctly.

### Command:
```bash
node scripts/test-onUserWrite.js <uid>
```

### Example:
```bash
node scripts/test-onUserWrite.js xHKmkizXhPOU25vwTIB6dxhMzSH2
```

### What It Does:
1. Updates a single user document (triggers `onUserWrite`)
2. Waits 5 seconds for Cloud Function to execute
3. Checks if `/publicDirectory/{handle}` and `/directoryPrivate/{handle}` were created
4. Prints document data and summary

### Expected Output:
```
[test] Testing onUserWrite trigger for user: xHKmkizXhPOU25vwTIB6dxhMzSH2

[test] User details:
  - UID: xHKmkizXhPOU25vwTIB6dxhMzSH2
  - Handle: $ygor-francisco-6602 (normalized: $ygor-francisco-6602)
  - Email: ygor.francisco@gmail.com
  - Phone: +27601234567
  - DisplayName: Ygor Francisco

[test] Before update:
  - /publicDirectory/$ygor-francisco-6602: MISSING
  - /directoryPrivate/$ygor-francisco-6602: MISSING

[test] Triggering onUserWrite by updating user document...
[test] ✅ User document updated
[test] Waiting 5 seconds for Cloud Function to execute...

[test] After update:
  - /publicDirectory/$ygor-francisco-6602: EXISTS ✅
  - /directoryPrivate/$ygor-francisco-6602: EXISTS ✅

[test] /publicDirectory/$ygor-francisco-6602 data:
  - handle: $ygor-francisco-6602
  - ownerUserId: xHKmkizXhPOU25vwTIB6dxhMzSH2
  - displayName: Ygor Francisco
  - phoneCountry: ZA
  - isAgent: false
  - createdAt: 2025-12-14T...
  - updatedAt: 2025-12-14T...

[test] /directoryPrivate/$ygor-francisco-6602 data:
  - handle: $ygor-francisco-6602
  - ownerUserId: xHKmkizXhPOU25vwTIB6dxhMzSH2
  - email: ygor.francisco@gmail.com
  - phoneE164: +27601234567
  - phoneCountry: ZA
  - createdAt: 2025-12-14T...
  - updatedAt: 2025-12-14T...

[test] Summary:
  ✅ /publicDirectory/$ygor-francisco-6602 was CREATED
  ✅ /directoryPrivate/$ygor-francisco-6602 was CREATED

✅ Test completed
```

### If Test Fails:
1. Check Cloud Function logs:
   ```bash
   firebase functions:log --project gobankless-dev --only onUserWrite
   ```
2. Verify function is deployed:
   ```bash
   firebase functions:list --project gobankless-dev
   ```
3. Check for errors in logs (permission errors, missing fields, etc.)

---

## Step 2: Set Admin Custom Claim (Required for Backfill)

The `admin_backfillDirectory` function now requires admin access. Set custom claim:

### Option A: Firebase Console (Manual)
1. Go to Firebase Console → Authentication → Users
2. Find your user
3. Click "..." → "Edit user"
4. Add custom claim: `admin: true`

### Option B: Firebase CLI (Recommended)
```bash
# Get your UID (from browser console: firebase.auth().currentUser.uid)
# Then set custom claim:
firebase auth:users:set-claims <your-uid> --project gobankless-dev --claims '{"admin":true}'
```

### Option C: Admin Script
Create a one-time script to set your claim:
```javascript
const admin = require('firebase-admin')
admin.initializeApp({ projectId: 'gobankless-dev' })

const uid = 'YOUR_UID_HERE'
admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => console.log('✅ Admin claim set'))
  .catch(err => console.error('❌ Failed:', err))
```

**Note:** After setting custom claim, user must sign out and sign back in for token to refresh.

---

## Step 3: Run Backfill

### Command:
```bash
node scripts/runBackfill.js
```

### Prerequisites:
- Firebase CLI authenticated: `firebase login`
- OR service account key: `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`

### Expected Output:
```
[backfill] Using Application Default Credentials
[backfill] Starting directory backfill...
[backfill] Found 15 users to process
[backfill] Upserted publicDirectory { handle: '$abiharrison', uid: '...' }
[backfill] Upserted directoryPrivate { handle: '$abiharrison', uid: '...' }
...
[backfill] Backfill complete { success: 13, skipped: 2, errors: 0 }

✅ Backfill completed: { success: 13, skipped: 2, errors: 0 }
```

### What It Does:
1. Reads all users from `/users` collection
2. For each user:
   - Creates/updates `/publicDirectory/{handle}` with non-sensitive fields
   - Creates/updates `/directoryPrivate/{handle}` with email + phone (if available)
3. Processes in batches of 10 to avoid rate limiting
4. Returns summary: `{ success, skipped, errors }`

### Troubleshooting:
- **"Failed to initialize Firebase Admin"**: Run `firebase login` or set `GOOGLE_APPLICATION_CREDENTIALS`
- **"Handle already claimed"**: Another user already owns that handle (skip is expected)
- **"Skipping directoryPrivate (missing email or phone)"**: User doesn't have both email and phone (expected for some users)

---

## Step 4: Verify Collections Populated

### Check Firebase Console:
1. Go to Firestore → `publicDirectory` collection
2. Should see documents with:
   - `handle: "$..."`
   - `ownerUserId: "..."` (NOT null)
   - `displayName: "..."`
   - `phoneCountry: "..."` (if available)

3. Go to Firestore → `directoryPrivate` collection
4. Should see documents with:
   - `handle: "$..."`
   - `ownerUserId: "..."` (NOT null)
   - `email: "..."`
   - `phoneE164: "+..."`

### Count Documents:
```bash
# Using Firebase CLI (if available)
# Or check in Firebase Console manually
```

Expected: `publicDirectory` count ≈ number of users with handles  
Expected: `directoryPrivate` count ≈ number of users with handles + email + phone

---

## Step 5: Verify Frontend

### Pre-auth Search (Signed Out):
1. Open app in incognito window
2. Click Search icon
3. **Expected:**
   - See directory contacts (handles)
   - Subtitle shows corridor text (e.g., "SADC cash corridor")
   - NO email/phone visible
   - Console: `[usePublicDirectoryContacts] Loaded public directory contacts { count: X }` (X > 0)

### Post-auth Search (Signed In):
1. Sign in to app
2. Click Search icon
3. **Expected:**
   - See same directory contacts
   - Subtitle shows ONLY: `phone • email` (no corridor text)
   - Console: `[useDirectoryPrivateContacts] Enriched X contacts`

### Payment Details Sheet (Signed In):
1. Sign in to app
2. Click $ button → Pay/Request → Enter amount
3. **Expected:**
   - See directory contacts in list
   - Subtitle shows: `phone • email` (no corridor text)
   - Same as post-auth Search

---

## Step 6: Lock Down Admin Function (After Migration)

After backfill is complete and verified:

### Option A: Disable Function
```bash
# Remove from functions/src/index.ts exports
# Then redeploy:
firebase deploy --only functions
```

### Option B: Keep Function but Add Secret
Update `admin_backfillDirectory` to require a secret:
```typescript
export const admin_backfillDirectory = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    // Require admin claim AND secret
    const token = context.auth.token
    const isAdmin = token.admin === true
    const secret = data.secret
    
    if (!isAdmin || secret !== process.env.BACKFILL_SECRET) {
      throw new functions.https.HttpsError('permission-denied', 'Unauthorized')
    }
    
    // ... rest of function
  })
```

Then set secret:
```bash
firebase functions:config:set backfill.secret="your-secret-here" --project gobankless-dev
firebase deploy --only functions --project gobankless-dev
```

---

## Verification Checklist

- [ ] Step 1: `test-onUserWrite.js` creates both directory entries
- [ ] Step 2: Admin custom claim set on your user
- [ ] Step 3: `runBackfill.js` completes with `success > 0`
- [ ] Step 4: Firebase Console shows documents in both collections
- [ ] Step 5a: Pre-auth Search shows handles + corridor subtitles (no email/phone)
- [ ] Step 5b: Post-auth Search shows handles + phone/email subtitles only
- [ ] Step 5c: Payment Details shows same as post-auth Search
- [ ] Step 6: Admin function locked down or disabled

---

## Quick Reference

```bash
# Test single user sync
node scripts/test-onUserWrite.js <uid>

# Run full backfill
node scripts/runBackfill.js

# Check Cloud Function logs
firebase functions:log --project gobankless-dev --only onUserWrite
firebase functions:log --project gobankless-dev --only admin_backfillDirectory

# List deployed functions
firebase functions:list --project gobankless-dev

# Set admin claim
firebase auth:users:set-claims <uid> --project gobankless-dev --claims '{"admin":true}'
```



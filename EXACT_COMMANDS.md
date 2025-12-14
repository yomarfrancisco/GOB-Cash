# Exact Commands for Directory Backfill

## Prerequisites

```bash
# Ensure you're in the project root
cd "/Volumes/Extreme SSD/GOB-Bankless-App"

# Ensure Firebase CLI is authenticated
firebase login

# Verify project
firebase use gobankless-dev
```

---

## Step 1: Deploy Updated Admin Function (with Security)

```bash
# Build functions
cd functions && npm run build && cd ..

# Deploy only the updated function
firebase deploy --only functions:admin_backfillDirectory --project gobankless-dev
```

**Expected Output:**
```
✔  functions[admin_backfillDirectory(us-central1)] Successful update operation.
```

---

## Step 2: Test Pipeline (Single User)

```bash
# Replace <uid> with an actual user UID from Firebase Console
node scripts/test-onUserWrite.js <uid>
```

**Example:**
```bash
node scripts/test-onUserWrite.js xHKmkizXhPOU25vwTIB6dxhMzSH2
```

**What to Verify:**
- Script completes without errors
- Output shows both `/publicDirectory/{handle}` and `/directoryPrivate/{handle}` were created
- `ownerUserId` is set (not null)

**Check Logs:**
```bash
firebase functions:log --project gobankless-dev --only onUserWrite
```

---

## Step 3: Set Admin Custom Claim

```bash
# Get your UID first (from browser console: firebase.auth().currentUser.uid)
# Then set claim:
firebase auth:users:set-claims <your-uid> --project gobankless-dev --claims '{"admin":true}'
```

**Example:**
```bash
firebase auth:users:set-claims xHKmkizXhPOU25vwTIB6dxhMzSH2 --project gobankless-dev --claims '{"admin":true}'
```

**Verify Claim:**
```bash
firebase auth:users:get <your-uid> --project gobankless-dev
```

**Important:** After setting claim, you MUST sign out and sign back in to the app for the token to refresh.

---

## Step 4: Run Backfill

```bash
node scripts/runBackfill.js
```

**Expected Output:**
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

**If you get "permission-denied":**
- Verify admin claim is set (Step 3)
- Sign out and sign back in
- Try again

---

## Step 5: Verify Collections in Firebase Console

1. Go to: https://console.firebase.google.com/project/gobankless-dev/firestore
2. Check `/publicDirectory` collection:
   - Should have documents (one per user with handle)
   - Each document should have `ownerUserId` set (not null)
3. Check `/directoryPrivate` collection:
   - Should have documents (one per user with handle + email + phone)
   - Each document should have `email` and `phoneE164` set

**Screenshot both collections showing at least 3 documents each.**

---

## Step 6: Verify Frontend (Pre-auth)

1. Open app in incognito window: `http://localhost:5173` (or production URL)
2. Click Search icon (bottom nav)
3. **Expected:** See directory contacts with corridor subtitles, NO email/phone
4. Open browser console (F12)
5. Check for: `[usePublicDirectoryContacts] Loaded public directory contacts { count: X }` where X > 0

**Screenshot Search popup showing contacts.**

---

## Step 7: Verify Frontend (Post-auth)

1. Sign in to app
2. Click Search icon
3. **Expected:** See same contacts, subtitle shows ONLY `phone • email` (no corridor text)
4. Open browser console
5. Check for: `[useDirectoryPrivateContacts] Enriched X contacts`

**Screenshot Search popup showing phone/email subtitles.**

---

## Step 8: Verify Payment Details Sheet

1. Sign in to app
2. Click $ button → Pay/Request → Enter amount
3. **Expected:** Directory contacts in list, subtitle shows `phone • email` only

**Screenshot Payment Details Sheet.**

---

## Step 9: Lock Down Admin Function (After Migration)

**Option A: Remove Function (Recommended)**

```bash
# Edit functions/src/index.ts
# Remove this line:
# export { admin_backfillDirectory } from './admin/backfillDirectory'

# Then redeploy:
firebase deploy --only functions --project gobankless-dev
```

**Option B: Keep Function but Add Secret**

```bash
# Set secret
firebase functions:config:set backfill.secret="your-secret-here" --project gobankless-dev

# Update function code to check secret (see DIRECTORY_BACKFILL_GUIDE.md)

# Redeploy
firebase deploy --only functions:admin_backfillDirectory --project gobankless-dev
```

---

## Troubleshooting Commands

```bash
# Check deployed functions
firebase functions:list --project gobankless-dev

# Check Cloud Function logs
firebase functions:log --project gobankless-dev --only onUserWrite
firebase functions:log --project gobankless-dev --only admin_backfillDirectory

# Check user's custom claims
firebase auth:users:get <uid> --project gobankless-dev

# Verify Firestore rules
firebase firestore:rules:get --project gobankless-dev

# Verify Firestore indexes
firebase firestore:indexes:get --project gobankless-dev
```

---

## Quick Reference

```bash
# Test single user
npm run test:onUserWrite <uid>

# Run backfill
npm run backfill:directory

# Deploy functions
npm run functions:deploy

# Check logs
firebase functions:log --project gobankless-dev --only onUserWrite
```



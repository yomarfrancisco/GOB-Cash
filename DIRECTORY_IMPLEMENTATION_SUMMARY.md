# Directory Public/Private Split - Implementation Summary

## Overview

Implemented a secure public/private directory split that ensures:
- **Pre-auth users** can only read non-sensitive fields (handle, displayName, corridor tags)
- **Post-auth users** can read email/phone for all directory users
- **Every user** contributes their data to the directory on signup

## Changes Made

### Phase 1: Data Model ✅
- **File:** `src/types/contacts.ts`
- Added `PublicDirectoryDoc` type (non-sensitive fields)
- Added `DirectoryPrivateDoc` type (email, phoneE164)
- Kept legacy `DirectoryDoc` for backward compatibility

### Phase 2: Cloud Function ✅
- **File:** `functions/src/syncDirectoryForUser.ts`
- `onUserWrite`: Triggers on `/users/{uid}` write
- `directory_syncMyRecord`: Callable function for manual sync
- Syncs user data to both `publicDirectory` and `directoryPrivate`
- Handles handle changes (migration)
- Prevents handle hijacking

### Phase 3: Frontend Hooks ✅
- **File:** `src/hooks/usePublicDirectoryContacts.ts`
- Updated to read from `/publicDirectory` collection
- Returns contacts with metadata but no email/phone

- **File:** `src/hooks/useDirectoryPrivateContacts.ts` (NEW)
- Enriches public contacts with email/phone from `/directoryPrivate`
- Only works when signed in
- Uses batch queries (Firestore 'in' query, max 10 per batch)

### Phase 4: Firestore Rules ✅
- **File:** `firestore.rules`
- Added `publicDirectory/{handle}`: `allow read: if true`
- Added `directoryPrivate/{handle}`: `allow read: if request.auth != null`
- Both collections: `allow write: if false` (Cloud Functions only)

### Phase 5: Backfill Script ✅
- **File:** `functions/src/admin/backfillDirectory.ts`
- `backfillDirectory()`: Migrates existing users to new collections
- `admin_backfillDirectory`: HTTPS callable (protected by ALLOW_ADMIN_ENDPOINTS)
- Processes users in batches to avoid rate limiting

### Phase 6: UI Components ✅
- **File:** `src/components/SearchSheet.tsx`
- Updated to use `usePublicDirectoryContacts` + `useDirectoryPrivateContacts`
- Pre-auth: Shows public directory only
- Post-auth: Shows public directory enriched with private data

- **File:** `src/components/PaymentDetailsSheet.tsx`
- Merges user contacts with directory contacts
- Shows directory email/phone when signed in

- **File:** `src/components/contacts/ContactListWithIndex.tsx`
- Already has logic to show email/phone for directory contacts
- No changes needed

### Bonus: Firestore Index ✅
- **File:** `firestore.indexes.json`
- Added index for `transactions` collection: `participants` (array-contains) + `createdAt` (desc)

## Deployment Checklist

### 1. Commit & Push
```bash
git add .
git commit -m "feat: Implement public/private directory split for secure contact discovery"
git push origin main
```

### 2. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 3. Deploy Firestore Indexes
```bash
firebase deploy --only firestore:indexes
```

### 4. Deploy Cloud Functions
```bash
firebase deploy --only functions
```

### 5. Run Backfill Migration
After functions are deployed, run the backfill:

**Option A: Via HTTPS Callable (if ALLOW_ADMIN_ENDPOINTS=true)**
```javascript
// In browser console or admin script
const functions = getFunctions()
const backfill = httpsCallable(functions, 'admin_backfillDirectory')
await backfill()
```

**Option B: Local Script (with service account)**
```bash
cd functions
npm install
node -e "require('./src/admin/backfillDirectory').backfillDirectory()"
```

### 6. Verify Vercel Deployment
- Check Vercel Dashboard → Deployments
- Confirm Production is on latest commit
- Verify build succeeded

## Acceptance Tests

### Test 1: Pre-auth Search (Signed Out)
1. Open incognito window
2. Navigate to app
3. Click Search icon
4. **Expected:** See directory contacts with names + corridor subtitles
5. **Expected:** NO email/phone visible anywhere
6. **Expected:** Console shows no permission errors for `directoryPrivate`

### Test 2: Post-auth Search (Signed In)
1. Sign in to app
2. Click Search icon
3. **Expected:** See same directory contacts
4. **Expected:** Email + phone shown as second subtitle line
5. **Expected:** Console shows successful `directoryPrivate` reads

### Test 3: New User Signup
1. Create brand new user account
2. Complete signup (handle assigned)
3. Wait 5-10 seconds (Cloud Function trigger)
4. **Expected:** New user appears in Search for other signed-in users
5. **Expected:** Email + phone visible for new user

### Test 4: Permission Check
1. Open incognito (signed out)
2. Open browser console
3. Try to read `directoryPrivate`:
   ```javascript
   const db = getFirestore()
   const ref = collection(db, 'directoryPrivate')
   getDocs(ref).catch(err => console.log('Expected error:', err))
   ```
4. **Expected:** Permission denied error

## Data Flow

### Pre-auth Flow
```
User (signed out)
  → SearchSheet
  → usePublicDirectoryContacts()
  → Reads /publicDirectory/{handle}
  → Shows: handle, displayName, corridor subtitle
  → NO email/phone (physically impossible to read)
```

### Post-auth Flow
```
User (signed in)
  → SearchSheet
  → usePublicDirectoryContacts() → /publicDirectory
  → useDirectoryPrivateContacts() → /directoryPrivate (batch query)
  → Merges public + private data
  → Shows: handle, displayName, corridor subtitle, email, phone
```

### Signup Flow
```
New user signs up
  → /users/{uid} created/updated
  → onUserWrite Cloud Function triggered
  → syncUserToDirectory()
  → Upserts /publicDirectory/{handle}
  → Upserts /directoryPrivate/{handle}
  → User appears in directory within seconds
```

## Security Guarantees

✅ **Pre-auth cannot read email/phone**: Firestore rules physically prevent access to `directoryPrivate`

✅ **Post-auth can read all directory email/phone**: All authenticated users can read `directoryPrivate`

✅ **No client writes**: Both collections are write-protected (Cloud Functions only)

✅ **Handle hijacking prevented**: Cloud Function checks `ownerUserId` before allowing updates

## Files Modified

### Frontend
- `src/types/contacts.ts` - Added new types
- `src/hooks/usePublicDirectoryContacts.ts` - Updated to use `publicDirectory`
- `src/hooks/useDirectoryPrivateContacts.ts` - NEW hook for private data
- `src/components/SearchSheet.tsx` - Updated to use new hooks
- `src/components/PaymentDetailsSheet.tsx` - Merges directory contacts
- `src/hooks/useEnrichedDirectoryContacts.ts` - DELETED (replaced by `useDirectoryPrivateContacts`)

### Backend
- `functions/src/syncDirectoryForUser.ts` - NEW Cloud Function
- `functions/src/admin/backfillDirectory.ts` - NEW backfill script
- `functions/src/index.ts` - Exported new functions
- `firestore.rules` - Added rules for new collections
- `firestore.indexes.json` - Added transactions index

## Next Steps

1. **Deploy everything** (see Deployment Checklist above)
2. **Run backfill** to migrate existing users
3. **Test acceptance criteria** (see Acceptance Tests above)
4. **Monitor Cloud Function logs** for any errors
5. **Optional:** Remove legacy `/directory` collection after migration complete

## Notes

- Legacy `/directory` collection is kept for backward compatibility during migration
- Old `useEnrichedDirectoryContacts` hook was replaced with `useDirectoryPrivateContacts`
- PaymentDetailsSheet now includes directory contacts, not just user contacts
- All directory writes happen via Cloud Functions (no client writes)


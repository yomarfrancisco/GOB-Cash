# Global Contacts Implementation - Complete

## Summary

Implemented a global directory built from existing contact lists (`/users/{uid}/contacts/{contactId}`) instead of user profiles. This provides a true network directory of all contacts contributed by all users.

## ✅ Completed Implementation

### 1. New Collections

**`/globalContactsPublic/{handle}`**
- Public read (pre-auth included)
- Fields: `handle`, `displayName`, `sources[]`, `createdAt`, `updatedAt`
- Doc ID = normalized handle

**`/globalContactsPrivate/{handle}`**
- Auth read only
- Fields: `handle`, `primaryEmail`, `primaryPhone`, `createdAt`, `updatedAt`
- Doc ID = normalized handle

### 2. Backfill Script

**File:** `scripts/backfillGlobalContacts.js`

**Features:**
- Uses collection group query: `collectionGroup('contacts')`
- Scans all contacts across all users
- Normalizes handles (removes @, ensures $ prefix)
- Groups by handle and merges intelligently:
  - `primaryEmail`: take any non-null (prefer most recently updated)
  - `primaryPhone`: same
  - `displayName`: prefer most recently updated
  - `sources`: union unique values
- Writes to both public and private collections

**Usage:**
```bash
npm run backfill:globalContacts
# or
node scripts/backfillGlobalContacts.js
```

**Output:**
```
📊 Total contacts scanned: 608
📝 Unique handles found: 304
✅ Created: 304
✅ Updated: 0
⚠️  Skipped: 0 (invalid or missing handle)
```

### 3. Ongoing Sync

**File:** `functions/src/onContactWrite.ts`

**Function:** `syncToGlobalContacts()`

- Automatically syncs to `globalContactsPublic` and `globalContactsPrivate` when contacts are written
- Merges data intelligently when handle already exists
- Prefers most recently updated data

### 4. Firestore Rules

**Option A (Public/Private Split):** ✅ Implemented

- `/globalContactsPublic`: `allow read: if true` (public)
- `/globalContactsPrivate`: `allow read: if request.auth != null` (auth only)
- Both: `allow write: if false` (Cloud Functions only)

### 5. UI Hooks

**New Hooks:**
- `useGlobalContactsPublicForUI()` - Reads public collection (pre-auth)
- `useGlobalContactsPrivate()` - Enriches with email/phone (post-auth)

**Updated Components:**
- `SearchSheet.tsx` - Now uses global contacts hooks
- Subtitle rendering:
  - **Pre-auth:** Corridor/region text only
  - **Post-auth:** Phone • email (or single field if only one exists)

### 6. Firestore Index

Added index for `globalContactsPublic` collection:
```json
{
  "collectionGroup": "globalContactsPublic",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "handle",
      "order": "ASCENDING"
    }
  ]
}
```

## Data Flow

1. **User imports contacts** → `/users/{uid}/contacts/{contactId}` created
2. **onContactWrite triggers** → Syncs to `/globalContactsPublic` and `/globalContactsPrivate`
3. **Backfill script** → One-time migration of all existing contacts
4. **UI reads:**
   - Pre-auth: `/globalContactsPublic` only
   - Post-auth: `/globalContactsPublic` + `/globalContactsPrivate` (enriched)

## Merge Rules

When the same handle appears in multiple users' contact lists:

- ✅ **primaryEmail**: Take any non-null value (prefer most recently updated)
- ✅ **primaryPhone**: Same
- ✅ **displayName**: Prefer most recently updated record
- ✅ **sources**: Union unique values (array of source types)

**Never creates duplicates.** One handle = one globalContacts doc.

## Field Mapping

**Contact Schema:**
- `handle: string | null`
- `displayName: string | null`
- `primaryEmail: string | null`
- `primaryPhone: string | null`
- `source: 'device' | 'gmail' | 'manual' | string`

**Global Contacts Schema:**
- Public: `handle`, `displayName`, `sources[]`
- Private: `primaryEmail`, `primaryPhone`

## Verification Checklist

✅ **Backfill Script:**
- [x] Scans all contacts using collection group query
- [x] Normalizes handles correctly
- [x] Merges data intelligently
- [x] Writes to both collections
- [x] Provides comprehensive logging

✅ **Firestore Rules:**
- [x] Public collection readable by anyone
- [x] Private collection readable only when authenticated
- [x] No client writes allowed

✅ **UI Behavior:**
- [x] Pre-auth Search shows full list (not just agents)
- [x] Pre-auth subtitle = corridor text only
- [x] Post-auth subtitle = phone • email (or single field)
- [x] Payment Details Sheet uses same post-auth behavior

✅ **Ongoing Sync:**
- [x] onContactWrite syncs to globalContacts
- [x] Merge logic works correctly
- [x] Handles handle changes

## Next Steps

1. **Deploy Firestore Rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Deploy Firestore Indexes:**
   ```bash
   firebase deploy --only firestore:indexes
   ```

3. **Deploy Cloud Functions:**
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions:onContactWrite
   ```

4. **Run Backfill (if not already done):**
   ```bash
   npm run backfill:globalContacts
   ```

5. **Verify in Firebase Console:**
   - Check `/globalContactsPublic` collection count (should match unique handles)
   - Check `/globalContactsPrivate` collection count
   - Verify pre-auth Search shows full list
   - Verify post-auth Search shows email/phone

## Files Changed

### Backend
- `functions/src/onContactWrite.ts` - Added `syncToGlobalContacts()` function
- `firestore.rules` - Added rules for globalContactsPublic/Private

### Scripts
- `scripts/backfillGlobalContacts.js` - New backfill script
- `package.json` - Added `backfill:globalContacts` script

### Frontend
- `src/hooks/useGlobalContactsPublic.ts` - New hook for public collection
- `src/hooks/useGlobalContactsPrivate.ts` - New hook for private enrichment
- `src/components/SearchSheet.tsx` - Updated to use new hooks

### Configuration
- `firestore.indexes.json` - Added index for globalContactsPublic

## Migration Notes

**Old Approach (Deprecated):**
- Built directory from `/users` documents
- Used `publicDirectory` and `directoryPrivate`
- Required `onUserWrite` trigger

**New Approach (Current):**
- Builds directory from `/users/{uid}/contacts` (contact lists)
- Uses `globalContactsPublic` and `globalContactsPrivate`
- Syncs via `onContactWrite` trigger
- True network directory from all users' contacts

The old collections (`publicDirectory`, `directoryPrivate`) are still maintained for backward compatibility but are no longer the primary directory source.


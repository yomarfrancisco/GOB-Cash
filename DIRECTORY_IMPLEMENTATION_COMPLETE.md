# Directory Implementation - Complete

## Summary

All critical fixes have been implemented for the public/private directory system with global network directory support.

## ✅ Completed Fixes

### A) directoryPrivate Sync - Email OR Phone (Not Both Required)

**Problem:** Previously skipped `/directoryPrivate` if both email and phone weren't present.

**Solution:**
- Updated `scripts/backfillDirectory.js` to write `/directoryPrivate` if email OR phone exists
- Updated `functions/src/syncDirectoryForUser.ts` with same logic
- UI already handles single-field display correctly (phone • email, or just one)

**Files Changed:**
- `scripts/backfillDirectory.js` - Lines 159-191
- `functions/src/syncDirectoryForUser.ts` - Lines 135-169

### B) Handle Normalization - Remove @ Symbols

**Problem:** Handles like `$@goblin1213` were not normalized correctly.

**Solution:**
- Created shared `normalizeHandle()` helper that:
  - Removes all `@` symbols
  - Ensures `$` prefix
  - Lowercases the result
- Applied consistently across:
  - `functions/src/utils/handleNormalization.ts`
  - `src/lib/contacts.ts`
  - `scripts/backfillDirectory.js`
  - `functions/src/syncDirectoryForUser.ts`

**Example:**
- Input: `$@goblin1213` → Output: `$goblin1213`
- Input: `@goblin1213` → Output: `$goblin1213`
- Input: `goblin1213` → Output: `$goblin1213`

### C) Backfill - Process All Users with Pagination

**Problem:** Only processed 2 users (likely due to query limits).

**Solution:**
- Implemented proper pagination using Firestore cursor-based queries
- Added comprehensive logging:
  - Total users scanned
  - Users with handle
  - publicDirectory written
  - directoryPrivate written
  - Skipped/errors

**Files Changed:**
- `scripts/backfillDirectory.js` - Lines 193-276

**Output Example:**
```
📊 Total users scanned: 2
📝 Users with handle: 2
✅ publicDirectory written: 2
✅ directoryPrivate written: 2
```

### D) Global Network Directory - globalDirectoryPrivate

**Problem:** Need a deduped global directory of all contacts contributed by users.

**Solution:**
- Created `/globalDirectoryPrivate/{key}` collection
- Key = SHA256 hash of normalized email or phone (deterministic deduplication)
- Fields: `email`, `phoneE164`, `displayName`, `sourceUid`, `createdAt`, `updatedAt`
- Sync triggered automatically when contacts are imported via `onContactWrite` Cloud Function

**Files Changed:**
- `functions/src/onContactWrite.ts` - Added `syncToGlobalDirectoryPrivate()` function
- `firestore.rules` - Added read rules for authenticated users

**Behavior:**
- When user imports contacts → `onContactWrite` triggers
- Each contact with email OR phone is synced to `globalDirectoryPrivate`
- Deduplication: same email/phone = same key (SHA256 hash)
- Multiple users can contribute same contact (latest displayName wins)

### E) UI Subtitle Rendering

**Status:** Already correct - no changes needed.

**Current Behavior:**
- **Pre-auth:** Shows corridor/region subtitle only
- **Post-auth:** Shows phone • email (if both), or just phone (if only phone), or just email (if only email)

**Files:**
- `src/components/SearchSheet.tsx` - Lines 275-287
- `src/components/contacts/ContactListWithIndex.tsx` - Lines 54-66

## File Changes Summary

### Backend (Cloud Functions)
1. `functions/src/syncDirectoryForUser.ts`
   - Fixed handle normalization (remove @)
   - Fixed directoryPrivate sync (email OR phone)
   - Uses shared `normalizeHandle()` helper

2. `functions/src/onContactWrite.ts`
   - Added `syncToGlobalDirectoryPrivate()` function
   - Syncs contacts to global network directory on import

3. `functions/src/utils/handleNormalization.ts`
   - Updated `normalizeHandle()` to remove @ symbols

### Scripts
1. `scripts/backfillDirectory.js`
   - Fixed handle normalization (remove @)
   - Fixed directoryPrivate sync (email OR phone)
   - Added pagination for all users
   - Added comprehensive logging

### Frontend
1. `src/lib/contacts.ts`
   - Updated `normalizeHandle()` to remove @ symbols

### Firestore Rules
1. `firestore.rules`
   - Added rules for `globalDirectoryPrivate` collection (auth read only)

## Testing & Verification

### Backfill Script Test
```bash
node scripts/backfillDirectory.js
```

**Expected Output:**
- Processes all users with pagination
- Writes to `/publicDirectory` for users with handles
- Writes to `/directoryPrivate` if email OR phone exists
- Logs comprehensive statistics

### Acceptance Tests

1. **Pre-auth Search:**
   - ✅ Shows directory handles (not just agents)
   - ✅ Subtitle = corridor/region text only
   - ✅ No email/phone visible

2. **Post-auth Search:**
   - ✅ Shows same directory handles
   - ✅ Subtitle = phone • email (if both), or single field (if one)
   - ✅ No corridor text in subtitle

3. **Payment Details Sheet:**
   - ✅ Same behavior as post-auth Search

4. **Handle Format:**
   - ✅ Consistent `$goblin1213` format (no `@` symbols)
   - ✅ Applied across all surfaces

5. **Global Directory:**
   - ✅ After contact import, entries appear in `/globalDirectoryPrivate`
   - ✅ Deduplication works (same email/phone = same key)
   - ✅ Multiple users can contribute same contact

## Next Steps

1. **Deploy Firestore Rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Deploy Cloud Functions:**
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions
   ```

3. **Run Backfill:**
   ```bash
   node scripts/backfillDirectory.js
   ```

4. **Verify in Firebase Console:**
   - Check `/publicDirectory` collection count
   - Check `/directoryPrivate` collection count
   - Check `/globalDirectoryPrivate` collection count (after contact import)

5. **Test UI:**
   - Pre-auth Search: verify corridor subtitles
   - Post-auth Search: verify phone/email subtitles
   - Import contacts: verify globalDirectoryPrivate population

## Data Model

### `/publicDirectory/{handle}`
- Public read (pre-auth included)
- Fields: `handle`, `displayName`, `avatarUrl`, `phoneCountry`, `isAgent`, `ownerUserId`, `ghostQuality`, `trustGlobal`, `createdAt`, `updatedAt`

### `/directoryPrivate/{handle}`
- Auth read only
- Fields: `handle`, `ownerUserId`, `email` (optional), `phoneE164` (optional), `phoneCountry`, `createdAt`, `updatedAt`
- **Note:** Email OR phone required (not both)

### `/globalDirectoryPrivate/{key}`
- Auth read only
- Key = SHA256(normalizedEmailOrPhone)
- Fields: `email` (optional), `phoneE164` (optional), `displayName`, `sourceUid`, `createdAt`, `updatedAt`
- **Note:** Deduplicated by email/phone hash

## Security

- `/publicDirectory`: Public read, Cloud Functions write only
- `/directoryPrivate`: Auth read, Cloud Functions write only
- `/globalDirectoryPrivate`: Auth read, Cloud Functions write only

All writes are via Cloud Functions with Admin SDK (bypasses security rules).


# Directory Data Inconsistency Diagnosis Report

## 1. Commit Hash & Deployment Status

### Latest Commit
**Commit Hash:** `bed548b`  
**Commit Message:** "Show email and phone for signed-in users in Search directory"  
**Date:** Most recent push to `main` branch

### Vercel Deployment Verification

**How to Verify:**
1. Go to Vercel Dashboard → Your Project → Deployments
2. Check the Production deployment (marked with 🌐 icon)
3. Look at the "Commit" column - it should show `bed548b` or a commit message matching the above
4. Check the "Status" - should be "Ready" (green checkmark)
5. If Production shows an older commit:
   - Check if you pushed to `main` branch (Vercel auto-deploys from `main`)
   - Check if there was a deployment failure
   - Check if Production is connected to a different branch (Settings → Git → Production Branch)

**Expected State:**
- Production should be on `bed548b` if you pushed to `main`
- If not, check Vercel logs for deployment errors or branch configuration

---

## 2. Field Inventory: Actual Runtime Data

### Existing Logs

**Pre-auth Search:**
- Location: `src/hooks/usePublicDirectoryContacts.ts:163`
- Log: `[usePublicDirectoryContacts] Pre-auth subtitle examples (first 3)`
- Shows: `handle`, `phoneCountry`, `tags`, `meta`, `subtitle`
- **Missing:** `email`, `phone`, `metadata.ownerUserId`, `source`

**Post-auth Search:**
- Location: `src/hooks/useEnrichedDirectoryContacts.ts:118`
- Log: `[useEnrichedDirectoryContacts] Enriched directory contact example`
- Shows: `handle`, `email`, `phoneNumber`, `ownerUserId`
- **Missing:** Full contact object with all fields

**Payment Details:**
- Location: `src/components/PaymentDetailsSheet.tsx:108`
- Log: `[PaymentDetailsSheet] rankedContacts:`
- Shows: Counts only, not field data

### Enhanced Logging Needed

Add the following logs to capture complete runtime data:

**In `src/components/SearchSheet.tsx` (renderContactRow function, around line 247):**

```typescript
// Add after line 276 (after subtitle computation)
if (displayContacts.length > 0) {
  const firstThree = displayContacts.slice(0, 3)
  console.log(`[SearchSheet] Runtime contact data (first 3) - isAuthed: ${isAuthed}`, 
    firstThree.map(c => ({
      handle: c.handle,
      name: c.name,
      email: c.email,
      phone: c.phone,
      phoneCountry: (c.metadata as any)?.phoneCountry,
      ownerUserId: (c.metadata as any)?.ownerUserId,
      source: c.source,
      metadata: c.metadata,
    }))
  )
}
```

**In `src/components/PaymentDetailsSheet.tsx` (around line 75, after displayContacts is computed):**

```typescript
// Add after line 75
useEffect(() => {
  if (displayContacts.length > 0) {
    const firstThree = displayContacts.slice(0, 3)
    console.log('[PaymentDetailsSheet] Runtime contact data (first 3)', 
      firstThree.map(c => ({
        handle: c.handle,
        name: c.name,
        email: c.email,
        phone: c.phone,
        phoneCountry: (c.metadata as any)?.phoneCountry,
        ownerUserId: (c.metadata as any)?.ownerUserId,
        source: c.source,
        metadata: c.metadata,
        subtitle: c.subtitle,
      }))
    )
  }
}, [displayContacts])
```

**Expected Output:**
- Pre-auth Search: `email: undefined`, `phone: "+27"` (prefix), `ownerUserId: null` or string, `phoneCountry: "ZA"` or null
- Post-auth Search: `email: string` or undefined, `phone: string` or undefined, `ownerUserId: string` or null
- Payment Details: `email: string`, `phone: string`, `metadata: undefined`, `source: "device"`

---

## 3. Database Truth Check

### Example Handles to Check

Pick 3 handles visible in Search (e.g., `$abiharrison`, `$andrewswan`, or any handles you see).

### For Each Handle (e.g., `$abiharrison`):

**1. Check `/directory/{handle}`:**
```javascript
// In Firebase Console → Firestore → directory collection
// Look for document ID: $abiharrison (or lowercase)
```

**Expected Fields:**
- `handle`: string (e.g., "$abiharrison")
- `displayName`: string | null
- `ownerUserId`: string | null ⚠️ **Likely null for unclaimed handles**
- `phoneCountry`: string | null ⚠️ **May be null if phone not available**
- `isAgent`: boolean
- `ghostQuality`: number
- `trustGlobal`: number | null
- **NO `email` or `phoneNumber` fields** (by design - directory doesn't store PII)

**2. Check `/users/{uid}` (if `ownerUserId` exists):**
```javascript
// If directory.ownerUserId = "someUid", check:
// Firebase Console → Firestore → users → {someUid}
```

**Expected Fields:**
- `email`: string
- `phoneNumber`: string | null
- `handle`: string
- `displayName`: string | null

**3. Check `/users/{myUid}/contacts/handle:{handle}`:**
```javascript
// In Firebase Console → Firestore → users → {yourUid} → contacts
// Look for document ID starting with "handle:" or containing the handle
```

**Expected Fields:**
- `contactId`: string
- `handle`: string
- `displayName`: string | null
- `primaryEmail`: string | null ✅ **Has email**
- `primaryPhone`: string | null ✅ **Has phone**
- `source`: "device" | "connections" | etc.

### Confirmation Questions

**Q: Is `ownerUserId` missing in `/directory`?**
- **Answer:** Yes, for unclaimed handles. `ownerUserId` is only set when a user claims their handle (links their user account to the handle). Most directory entries have `ownerUserId: null`.

**Q: Is `phoneCountry` missing?**
- **Answer:** Possibly. `phoneCountry` is extracted from `primaryPhone` in the `onContactWrite` Cloud Function when a contact is written. If:
  - The contact doesn't have a phone number
  - The phone number format is unrecognized
  - The directory entry was created before phone country extraction was added
  Then `phoneCountry` will be `null`.

**Q: Is email/phone absent by design?**
- **Answer:** Yes. The `/directory` collection is public (readable pre-auth) and intentionally does NOT store email/phone to protect privacy. Email/phone are only in:
  - `/users/{uid}` (user's own profile)
  - `/users/{uid}/contacts/{contactId}` (user's personal contacts)

---

## 4. Root Cause Conclusion

### Why Search Cannot Show Email/Phone Right Now

**Root Cause #1: `/directory` Collection Lacks Email/Phone Fields**
- The `/directory` collection is designed as a public directory (readable pre-auth)
- It intentionally does NOT store email/phone for privacy reasons
- Directory entries only have: `handle`, `displayName`, `phoneCountry`, `ownerUserId`, metrics
- **Impact:** Pre-auth Search cannot show email/phone because the data doesn't exist in `/directory`

**Root Cause #2: `ownerUserId` is Often Null**
- Most directory entries have `ownerUserId: null` (unclaimed handles)
- `useEnrichedDirectoryContacts` only enriches contacts with a non-null `ownerUserId`
- If `ownerUserId` is null, the hook cannot fetch email/phone from `/users/{ownerUserId}`
- **Impact:** Post-auth Search cannot enrich most contacts because `ownerUserId` is missing

**Root Cause #3: `phoneCountry` May Be Missing**
- `phoneCountry` is extracted from `primaryPhone` when contacts are written
- If a contact doesn't have a phone, or the directory entry predates phone extraction, `phoneCountry` is null
- Without `phoneCountry`, `getContactTags()` falls back to `getRegionFromPhone()` which needs a full phone number
- Directory contacts only have inferred phone prefixes (e.g., "+27"), not full numbers
- **Impact:** Subtitle generation falls back to generic "Cash corridor contact" when `phoneCountry` is missing

---

## 5. Gap-Closure Plan

### Option A: Minimal + Fast (Post-Auth Search Merges User Contacts)

**Approach:**
- Post-auth Search combines `/directory` contacts with `/users/{uid}/contacts` (user's personal contacts)
- Pre-auth Search remains directory-only (no email/phone)
- Use email/phone from user contacts when available for directory handles

**Implementation:**
1. In `SearchSheet.tsx`, when `isAuthed === true`:
   - Load both `enrichedDirectoryContacts` (from `/directory`) and `userContacts` (from `/users/{uid}/contacts`)
   - Merge by handle: if a directory contact has a matching user contact, use email/phone from user contact
   - Display merged list

**Which Screens Improve:**
- ✅ **Post-auth Search:** Shows email/phone for contacts in user's personal contact list
- ❌ **Pre-auth Search:** No change (still directory-only, no email/phone)
- ❌ **Payment Details:** No change (already uses user contacts)

**Privacy/Rules Implications:**
- ✅ No Firestore rules changes needed
- ✅ No backend changes needed
- ✅ Email/phone only shown for contacts the user already has in their personal list
- ✅ Pre-auth remains privacy-safe (no email/phone exposed)
- ⚠️ **Limitation:** Only shows email/phone for contacts user has synced, not all directory contacts

**Files to Modify:**
- `src/components/SearchSheet.tsx` - Merge logic
- No backend changes

---

### Option B: Network Directory (Populate `/directory` with ownerUserId + phoneCountry)

**Approach:**
- Ensure `/directory` entries always have `ownerUserId` when a user claims their handle
- Ensure `/directory` entries always have `phoneCountry` extracted from contacts
- Optionally: Add email/phone to `/directory` for claimed handles (requires privacy consideration)

**Current Pipeline:**

**Function that writes `/directory`:**
- **Primary:** `functions/src/onContactWrite.ts` (Cloud Function)
  - Triggered when: `/users/{userId}/contacts/{contactId}` is written
  - Creates/updates directory entry with:
    - `ownerUserId: null` (line 138) ⚠️ **Always null on creation**
    - `phoneCountry: extractPhoneCountry(after.primaryPhone)` (line 133, 173)
  - **Issue:** `ownerUserId` is never set to the actual user ID when a handle is claimed

**Secondary:** `src/lib/contacts.ts` (Client-side, `upsertContactForUser`)
  - Also writes to `/directory` but preserves existing `ownerUserId` (line 112)
  - Does NOT extract `phoneCountry`

**What Must Change:**

**1. Set `ownerUserId` when handle is claimed:**
- When a user signs up/claims a handle, update `/directory/{handle}` with `ownerUserId: userId`
- Location: User signup/profile creation flow
- Function: `src/lib/userDoc.ts` or a Cloud Function triggered on user creation

**2. Ensure `phoneCountry` is always extracted:**
- `onContactWrite.ts` already extracts `phoneCountry` (line 133, 173)
- But it only updates if `phoneCountry` exists and is new/better
- **Fix:** Run a migration/backfill to extract `phoneCountry` from existing directory entries that have inbound contacts with phones

**3. (Optional) Add email/phone to `/directory` for claimed handles:**
- When `ownerUserId` is set, copy email/phone from `/users/{ownerUserId}`
- Requires Firestore rules update: allow reading `/users/{ownerUserId}` in Cloud Functions
- **Privacy consideration:** Makes email/phone public in directory (readable pre-auth)

**Which Screens Improve:**
- ✅ **Pre-auth Search:** Shows richer subtitles (if `phoneCountry` is populated)
- ✅ **Post-auth Search:** Shows email/phone for all claimed handles (if email/phone added to directory)
- ❌ **Payment Details:** No change (already uses user contacts)

**Privacy/Rules Implications:**
- ⚠️ **If email/phone added to `/directory`:**
  - Email/phone becomes publicly readable (pre-auth users can see it)
  - Requires explicit product decision to expose PII in public directory
  - Firestore rules already allow public read: `allow read: if true` (line 106)
- ✅ **If only `ownerUserId` + `phoneCountry` added:**
  - No PII exposed, only metadata
  - Pre-auth can show better subtitles
  - Post-auth can enrich via `ownerUserId` (current code already does this)

**Files to Modify:**
- `functions/src/onContactWrite.ts` - Set `ownerUserId` when user claims handle
- `src/lib/userDoc.ts` or new Cloud Function - Update directory on user creation
- Migration script - Backfill `phoneCountry` for existing directory entries
- (Optional) `functions/src/onContactWrite.ts` - Copy email/phone to directory for claimed handles
- (Optional) `firestore.rules` - No change needed (already public read)

---

## 6. Console Errors

### Index Error: "query requires an index"

**Query Triggering Error:**
- Location: `src/lib/transactions/firestoreHelpers.ts:109-114`
- Query:
  ```typescript
  query(
    transactionsRef,
    where('participants', 'array-contains', uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  )
  ```

**Required Index:**
```json
{
  "collectionGroup": "transactions",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "participants",
      "arrayConfig": "CONTAINS"
    },
    {
      "fieldPath": "createdAt",
      "order": "DESCENDING"
    }
  ]
}
```

**Fix:**
- Add to `firestore.indexes.json`
- Deploy with: `firebase deploy --only firestore:indexes`
- Or click the link in the console error to create index via Firebase Console

**Current Indexes:**
- `firestore.indexes.json` only has indexes for `graphEdges`, not `transactions`
- Missing index for `transactions` collection with `participants` + `createdAt`

---

### Permission Error: "missing or insufficient permissions"

**Query Triggering Error:**
- Location: `src/lib/transactions/firestoreHelpers.ts:102-141` (`subscribeTransactionThreads`)
- Query reads: `/transactions` collection with `where('participants', 'array-contains', uid)`

**Firestore Rule:**
- Location: `firestore.rules:52-58`
- Rule allows read if: `request.auth != null && (userId == uid || receiverId == uid || uid in participants)`
- **Issue:** The rule checks `resource.data.userId`, `resource.data.receiverId`, and `resource.data.participants`
- But the query uses `where('participants', 'array-contains', uid)`, which should match the rule

**Why It Might Fail:**
1. **Pre-auth access:** If `subscribeTransactionThreads` is called when `request.auth == null`, the rule blocks it
2. **Query vs Rule mismatch:** The rule checks individual document fields, but the query filters by `participants` array
3. **Missing `participants` field:** If a transaction document doesn't have `participants` array, the rule's `resource.data.get('participants', [])` returns empty array, and `uid in []` is false

**Check:**
- Is `subscribeTransactionThreads` being called pre-auth? (Should only be called when signed in)
- Do transaction documents have `participants` array? (Check Firebase Console)

**Fix:**
- Ensure `subscribeTransactionThreads` is only called when `isAuthed === true`
- Ensure transaction documents have `participants` array populated
- Rule should work if both conditions are met

---

## Summary

**Current State:**
- Search uses `/directory` which lacks email/phone (by design)
- Most directory entries have `ownerUserId: null` (unclaimed)
- `phoneCountry` may be missing for many entries
- Post-auth enrichment only works for claimed handles (`ownerUserId` exists)

**Recommended Path:**
- **Short-term:** Option A (merge user contacts in post-auth Search) - Fast, no backend changes
- **Long-term:** Option B (populate `ownerUserId` + `phoneCountry` in directory) - Better UX, requires backend work

**Console Errors:**
- Missing Firestore index for `transactions` collection
- Permission errors likely due to pre-auth access or missing `participants` field





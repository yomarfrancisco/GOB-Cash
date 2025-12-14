# Directory Backfill Checklist

## A) Firestore Rules ✅

**File:** `firestore.rules`

```firestore
match /publicDirectory/{handle} {
  allow read: if true;  // ✅ Public read
  allow write: if false; // ✅ Cloud Functions only
}

match /directoryPrivate/{handle} {
  allow read: if request.auth != null; // ✅ Auth-only read
  allow write: if false; // ✅ Cloud Functions only
}
```

**Status:** ✅ Rules are correct

---

## B) Backfill Script ✅

**File:** `scripts/backfillDirectory.js`

**Command:**
```bash
node scripts/backfillDirectory.js
```

**Or via npm:**
```bash
npm run backfill:directory
```

**What it does:**
1. Reads all `/users` documents
2. For each user with a handle:
   - Upserts `/publicDirectory/{handle}` with: handle, displayName, avatarUrl, phoneCountry, isAgent, ownerUserId, updatedAt
   - Upserts `/directoryPrivate/{handle}` with: handle, email, phoneE164, ownerUserId, updatedAt (only if user has both email and phone)

**Expected Output:**
```
[backfill] Using Application Default Credentials
[backfill] Starting directory backfill...

[backfill] Found 15 users to process

[backfill] Processing batch 1/2 (10 users)...
[backfill] ✅ publicDirectory/$abiharrison
[backfill] ✅ directoryPrivate/$abiharrison
[backfill] ✅ publicDirectory/$andrewswan
[backfill] ✅ directoryPrivate/$andrewswan
...

[backfill] Backfill complete
  ✅ Success: 13
  ⚠️  Skipped: 2
  ❌ Errors: 0
  📝 Note: 1 users synced to publicDirectory but skipped directoryPrivate (missing email/phone)

✅ Backfill completed: { success: 13, skipped: 2, errors: 0, privateSkipped: 1 }
```

---

## C) Sync Mechanism ✅

**File:** `functions/src/syncDirectoryForUser.ts`

**Function:** `onUserWrite` (Firestore trigger on `/users/{uid}`)

**Status:** ✅ Already deployed and active

**What it does:**
- Triggers automatically when `/users/{uid}` is created or updated
- Syncs to both `/publicDirectory/{handle}` and `/directoryPrivate/{handle}`

---

## D) Diagnosis: Why SearchSheet Shows Only Agents

### Step 1: Check if `/publicDirectory` is empty

**In Firebase Console:**
1. Go to Firestore → `publicDirectory` collection
2. Check document count

**Expected:** If empty, that's why Search shows only agents

### Step 2: Run backfill script

```bash
node scripts/backfillDirectory.js
```

**Verify output shows:**
- `Success: X` where X > 0
- No fatal errors

### Step 3: Verify documents created

**In Firebase Console:**
1. Check `/publicDirectory` collection
2. Should see documents with handles like `$abiharrison`, `$andrewswan`, etc.
3. Each document should have `ownerUserId` set (not null)

**Screenshot:** Show at least 3 documents in `/publicDirectory`

### Step 4: Verify SearchSheet loads docs

**Pre-auth (signed out):**
1. Open app in incognito
2. Click Search icon
3. **Expected:** See directory contacts (not just agents)
4. Console should show: `[usePublicDirectoryContacts] Loaded public directory contacts { count: X }` where X > 0

**If still showing only agents:**
- Check browser console for errors
- Verify query path: `collection(db, 'publicDirectory')`
- Check Firestore rules allow public read

---

## E) UI Rendering Spec ✅

### Pre-auth SearchSheet

**File:** `src/components/SearchSheet.tsx` (lines 275-290)

**Code:**
```typescript
// Pre-auth: corridor text only
subtitle = buildContactSubtitle(meta, { isAuthenticated: false, isAgent })
```

**Expected:** Subtitle shows corridor text (e.g., "SADC cash corridor", "International cash corridor")

### Post-auth SearchSheet

**File:** `src/components/SearchSheet.tsx` (lines 275-290)

**Code:**
```typescript
// Post-auth directory contacts: phone + email ONLY
if (isAuthed && contact.source === 'gobankless-contact' && (contact.email || contact.phone)) {
  const parts: string[] = []
  if (contact.phone) parts.push(contact.phone)
  if (contact.email) parts.push(contact.email)
  subtitle = parts.join(' • ')
}
```

**Expected:** Subtitle shows ONLY `phone • email` (e.g., "+27601234567 • user@example.com")

### PaymentDetailsSheet

**File:** `src/components/contacts/ContactListWithIndex.tsx` (lines 52-65)

**Same logic as SearchSheet:**
- Pre-auth: corridor text
- Post-auth: phone + email only

---

## Final Verification Checklist

- [ ] **A) Firestore rules:** ✅ Confirmed correct
- [ ] **B) Backfill script:** Run `node scripts/backfillDirectory.js`
- [ ] **C) Sync mechanism:** ✅ `onUserWrite` trigger deployed
- [ ] **D) Diagnosis:**
  - [ ] `/publicDirectory` has documents (screenshot)
  - [ ] Backfill script output shows `Success: X` where X > 0
  - [ ] Pre-auth Search shows directory contacts (not just agents)
  - [ ] Console shows `count: X` where X > 0
- [ ] **E) UI rendering:**
  - [ ] Pre-auth Search: subtitle = corridor text only
  - [ ] Post-auth Search: subtitle = phone • email only (no corridor)
  - [ ] Payment Details: same as post-auth Search

---

## Quick Test

```bash
# 1. Run backfill
node scripts/backfillDirectory.js

# 2. Check Firebase Console
# - /publicDirectory should have documents
# - /directoryPrivate should have documents (for users with email + phone)

# 3. Test pre-auth Search
# - Open incognito
# - Click Search
# - Should see directory contacts with corridor subtitles

# 4. Test post-auth Search
# - Sign in
# - Click Search
# - Should see same contacts with phone • email subtitles only
```


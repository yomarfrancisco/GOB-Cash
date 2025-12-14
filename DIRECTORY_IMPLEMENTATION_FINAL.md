# Directory Implementation - Final Deliverables

## 1. Exact File Paths Changed

### A) Firestore Rules ✅
**File:** `firestore.rules` (lines 102-122)
- ✅ `publicDirectory/{handle}`: `allow read: if true`, `allow write: if false`
- ✅ `directoryPrivate/{handle}`: `allow read: if request.auth != null`, `allow write: if false`

### B) Backfill Script ✅
**File:** `scripts/backfillDirectory.js` (NEW)
- Uses Admin SDK with Application Default Credentials
- Reads all `/users` documents
- Upserts `/publicDirectory/{handle}` and `/directoryPrivate/{handle}`

**Package script:** `package.json` (line 12)
```json
"backfill:directory": "node scripts/backfillDirectory.js"
```

### C) Sync Mechanism ✅
**File:** `functions/src/syncDirectoryForUser.ts` (lines 227-275)
- `onUserWrite` trigger on `/users/{uid}` writes
- Already deployed and active

### D) UI Fixes ✅
**File:** `src/components/SearchSheet.tsx` (lines 275-290)
**File:** `src/components/contacts/ContactListWithIndex.tsx` (lines 52-65)

---

## 2. Backfill Script Content

**File:** `scripts/backfillDirectory.js`

**Key Code Snippet:**
```javascript
async function syncUserToDirectory(uid, userData) {
  const handle = userData.handle
  if (!handle || handle.trim() === '') {
    return { skipped: true, reason: 'no handle' }
  }

  const normalizedHandle = handle.startsWith('$') 
    ? handle.toLowerCase() 
    : `$${handle.toLowerCase()}`

  const now = admin.firestore.Timestamp.now()
  const phoneCountry = userData.phoneCountry || extractPhoneCountry(userData.phoneE164 || userData.phoneNumber)
  const phoneE164 = userData.phoneE164 || userData.phoneNumber || null

  // Upsert publicDirectory
  const publicDirData = {
    handle: normalizedHandle,
    displayName: userData.displayName || userData.fullName || null,
    avatarUrl: userData.avatarUrl || null,
    phoneCountry: phoneCountry || null,
    isAgent: userData.isAgent || false,
    ownerUserId: uid,
    trustGlobal: userData.trustGlobal || null,
    updatedAt: now,
  }
  await publicDirRef.set(publicDirData, { merge: true })

  // Upsert directoryPrivate (only if email + phone exist)
  if (userData.email && phoneE164) {
    const privateDirData = {
      handle: normalizedHandle,
      ownerUserId: uid,
      email: userData.email,
      phoneE164: phoneE164,
      phoneCountry: phoneCountry || null,
      updatedAt: now,
    }
    await privateDirRef.set(privateDirData, { merge: true })
  }
}
```

---

## 3. Exact Run Command

**From repo root:**
```bash
node scripts/backfillDirectory.js
```

**Or via npm:**
```bash
npm run backfill:directory
```

**Prerequisites:**
- Firebase CLI authenticated: `firebase login`
- OR service account: `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`

---

## 4. Expected Console Output

```
[backfill] Using Application Default Credentials
[backfill] Starting directory backfill...

[backfill] Found 15 users to process

[backfill] Processing batch 1/2 (10 users)...
[backfill] ✅ publicDirectory/$abiharrison
[backfill] ✅ directoryPrivate/$abiharrison
[backfill] ✅ publicDirectory/$andrewswan
[backfill] ✅ directoryPrivate/$andrewswan
[backfill] ✅ publicDirectory/$ygor-francisco-6602
[backfill] ✅ directoryPrivate/$ygor-francisco-6602
[backfill] ⚠️  directoryPrivate/$someuser skipped (missing email or phone)
[backfill] Processing batch 2/2 (5 users)...
[backfill] ✅ publicDirectory/$anotheruser
[backfill] ✅ directoryPrivate/$anotheruser

[backfill] Backfill complete
  ✅ Success: 13
  ⚠️  Skipped: 2
  ❌ Errors: 0
  📝 Note: 1 users synced to publicDirectory but skipped directoryPrivate (missing email/phone)

✅ Backfill completed: { success: 13, skipped: 2, errors: 0, privateSkipped: 1 }
```

---

## 5. UI Code Changes

### SearchSheet.tsx (lines 275-290)

**Before:**
```typescript
const subtitle = buildContactSubtitle(meta, { isAuthenticated: isAuthed, isAgent })
const showContactDetails = isAuthed && contact.source === 'gobankless-contact' && (contact.email || contact.phone)
// ... renders subtitle + second line with contactDetails
```

**After:**
```typescript
// Post-auth directory contacts: subtitle = phone + email ONLY (no corridor text)
// Pre-auth directory contacts: subtitle = corridor text only
let subtitle: string
if (isAuthed && contact.source === 'gobankless-contact' && (contact.email || contact.phone)) {
  // Post-auth: phone + email only
  const parts: string[] = []
  if (contact.phone) parts.push(contact.phone)
  if (contact.email) parts.push(contact.email)
  subtitle = parts.join(' • ')
} else {
  // Pre-auth: corridor text only
  subtitle = buildContactSubtitle(meta, { isAuthenticated: isAuthed, isAgent })
}
// ... renders single subtitle line only
```

### ContactListWithIndex.tsx (lines 52-65)

**Same logic as SearchSheet** - replaced corridor + second line with conditional single subtitle.

---

## 6. Verification Checklist

### Step 1: Run Backfill
```bash
node scripts/backfillDirectory.js
```
- [ ] Script completes with `Success: X` where X > 0
- [ ] No fatal errors

### Step 2: Verify Collections
**Firebase Console:**
- [ ] `/publicDirectory` has documents (screenshot showing at least 3 docs)
- [ ] Each document has `ownerUserId` set (not null)
- [ ] `/directoryPrivate` has documents (for users with email + phone)

### Step 3: Verify Pre-auth Search
- [ ] Open app in incognito (signed out)
- [ ] Click Search icon
- [ ] See directory contacts (not just agents)
- [ ] Subtitle shows corridor text only (e.g., "SADC cash corridor")
- [ ] Console shows: `[usePublicDirectoryContacts] Loaded public directory contacts { count: X }` where X > 0

### Step 4: Verify Post-auth Search
- [ ] Sign in to app
- [ ] Click Search icon
- [ ] See same directory contacts
- [ ] Subtitle shows ONLY `phone • email` (e.g., "+27601234567 • user@example.com")
- [ ] NO corridor text in subtitle
- [ ] Console shows: `[useDirectoryPrivateContacts] Enriched X contacts`

### Step 5: Verify Payment Details
- [ ] Sign in to app
- [ ] Click $ button → Pay/Request → Enter amount
- [ ] See directory contacts in list
- [ ] Subtitle shows ONLY `phone • email` (same as post-auth Search)

---

## Summary

| Component | Status | File |
|-----------|--------|------|
| Firestore Rules | ✅ Correct | `firestore.rules` |
| Backfill Script | ✅ Created | `scripts/backfillDirectory.js` |
| Sync Mechanism | ✅ Deployed | `functions/src/syncDirectoryForUser.ts` |
| Pre-auth UI | ✅ Fixed | `src/components/SearchSheet.tsx` |
| Post-auth UI | ✅ Fixed | `src/components/SearchSheet.tsx`, `src/components/contacts/ContactListWithIndex.tsx` |

**Next Step:** Run `node scripts/backfillDirectory.js` and verify collections are populated.


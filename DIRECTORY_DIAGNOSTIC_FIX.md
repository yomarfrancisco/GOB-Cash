# Directory Contacts Diagnostic Fix

## Changes Made

### 1. Added Comprehensive Diagnostic Logging

**File:** `src/hooks/usePublicDirectoryContacts.ts`

Added logging to verify:
- ✅ Firebase project connection (projectId, authDomain, apiKey)
- ✅ Exact query path (collection name, path)
- ✅ Simple query test (no orderBy) to verify collection has docs
- ✅ Ordered query result
- ✅ Sample document data (first 3 docs)
- ✅ Filter results (before/after filtering by handle)

### 2. Added Fallback Query

**File:** `src/hooks/usePublicDirectoryContacts.ts`

If the ordered query fails (missing index), automatically falls back to:
- Simple query without `orderBy` (no index required)
- Same mapping and sorting logic (client-side sort)
- Ensures contacts load even if index is missing

### 3. Added Missing Firestore Index

**File:** `firestore.indexes.json`

Added index for `publicDirectory` collection:
```json
{
  "collectionGroup": "publicDirectory",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "handle",
      "order": "ASCENDING"
    }
  ]
}
```

**Deploy:** `firebase deploy --only firestore:indexes`

---

## What to Check in Browser Console

After loading the app, check console for:

### 1. Firebase Connection
```
[usePublicDirectoryContacts] Firebase connection: {
  projectId: "gobankless-dev",  // ← Verify this matches Firebase Console
  authDomain: "...",
  apiKey: "..."
}
```

**Action:** If `projectId` doesn't match Firebase Console, check:
- Vercel environment variables
- `.env.local` file
- Firebase project selection

### 2. Query Path
```
[usePublicDirectoryContacts] Query path: {
  collection: "publicDirectory",  // ← Must be exactly "publicDirectory"
  collectionId: "publicDirectory",
  path: "publicDirectory"
}
```

**Action:** Verify collection name is exactly `publicDirectory` (case-sensitive)

### 3. Simple Query Test
```
[usePublicDirectoryContacts] Simple query result: {
  docCount: 0,  // ← If 0, collection is empty
  docIds: []
}
```

**Action:** If `docCount: 0`:
- Check Firebase Console → Firestore → `publicDirectory` collection
- If empty, run backfill: `admin_backfillDirectory` function
- Or check if `onUserWrite` trigger is working

### 4. Ordered Query Result
```
[usePublicDirectoryContacts] Ordered query result: {
  docCount: 5,  // ← Should match simple query count
  docIds: ["$handle1", "$handle2", ...]
}
```

**Action:** If this fails with index error, the fallback will activate automatically

### 5. Sample Documents
```
[usePublicDirectoryContacts] Sample doc: {
  docId: "$abiharrison",
  handle: "$abiharrison",
  displayName: "Abi Harrison",
  hasOwnerUserId: true,
  phoneCountry: "ZA"
}
```

**Action:** Verify documents have required fields (`handle`, `ownerUserId`)

### 6. Filter Results
```
[usePublicDirectoryContacts] After filtering by handle: {
  beforeFilter: 10,
  afterFilter: 10,  // ← If 0, all docs have empty handles
  filteredOut: 0
}
```

**Action:** If `afterFilter: 0` but `beforeFilter > 0`, all documents have empty/null handles

---

## Expected Console Output (Success)

```
[usePublicDirectoryContacts] Firebase connection: { projectId: "gobankless-dev", ... }
[usePublicDirectoryContacts] Query path: { collection: "publicDirectory", ... }
[usePublicDirectoryContacts] Testing simple query (no orderBy)...
[usePublicDirectoryContacts] Simple query result: { docCount: 5, docIds: [...] }
[usePublicDirectoryContacts] Attempting ordered query...
[usePublicDirectoryContacts] Ordered query result: { docCount: 5, docIds: [...] }
[usePublicDirectoryContacts] Sample doc: { docId: "$...", handle: "$...", ... }
[usePublicDirectoryContacts] After filtering by handle: { beforeFilter: 5, afterFilter: 5, filteredOut: 0 }
[usePublicDirectoryContacts] Loaded public directory contacts { source: 'publicDirectory', count: 5, isAuthed: false }
```

---

## Troubleshooting

### Issue: `docCount: 0` in simple query
**Cause:** Collection is empty  
**Fix:** Run backfill or verify `onUserWrite` trigger is syncing users

### Issue: Ordered query fails with index error
**Cause:** Missing Firestore index  
**Fix:** 
1. Deploy index: `firebase deploy --only firestore:indexes`
2. Wait for index to build (check Firebase Console → Firestore → Indexes)
3. Fallback query will work in the meantime

### Issue: `projectId` doesn't match Firebase Console
**Cause:** Wrong Firebase project configured  
**Fix:** Update environment variables in Vercel or `.env.local`

### Issue: `afterFilter: 0` but `beforeFilter > 0`
**Cause:** All documents have empty/null handles  
**Fix:** Check Cloud Function sync logic - ensure `handle` field is always set

---

## Next Steps

1. **Deploy the index:**
   ```bash
   firebase deploy --only firestore:indexes
   ```

2. **Check browser console** for diagnostic logs

3. **Verify Firebase Console:**
   - Project matches `projectId` from console log
   - `publicDirectory` collection has documents
   - Index is building/completed

4. **If collection is empty:**
   - Run backfill function
   - Or verify `onUserWrite` trigger is working

5. **Once contacts load:**
   - Verify Search popup shows directory contacts
   - Then fix subtitle logic (phone + email only for post-auth)




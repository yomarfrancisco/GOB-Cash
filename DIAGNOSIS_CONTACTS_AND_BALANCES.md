# Diagnosis: Contact Sync & Balance Leak Issues

## Phase 1: Diagnosis Only

### A) Contact Import Issue

#### Current Code Reality

**1. Where Google Contacts are fetched:**
- **File:** `src/lib/google/contacts.ts`
- **Function:** `fetchGoogleContacts(accessToken: string)`
- **API:** Google People API (`https://people.googleapis.com/v1`)
- **Endpoints:**
  - `people/me/connections` (My Contacts)
  - `otherContacts` (Other contacts from Gmail)

**2. OAuth Scopes:**
- **File:** `src/lib/firebase.ts:133-139`
- **Current:** `GoogleAuthProvider` is created with **NO additional scopes**
- **Comment says:** `// No additional scopes; contacts are synced from client-side data`
- **Problem:** Firebase Auth with Google does NOT request contacts scope by default
- **Required scope:** `https://www.googleapis.com/auth/contacts.readonly` or `https://www.googleapis.com/auth/userinfo.profile`

**3. When contact import runs:**
- **Answer: NEVER**
- **Root cause:** `fetchGoogleContacts()` function exists but is **never called anywhere in the codebase**
- **Evidence:** No imports or calls to `fetchGoogleContacts` found in:
  - `FirebaseAuthListener.tsx` (auth state changes)
  - `useSyncContacts.ts` (contact sync hook)
  - `SearchSheet.tsx` (where contacts are displayed)
  - Any other component

**4. Contact sync flow (current):**
- `useSyncContacts` hook syncs contacts from `useContactsStore` (Zustand store)
- `useContactsStore` is populated from... **nowhere** (empty by default)
- Contacts are only synced if they exist in the store
- **No code fetches Google contacts and populates the store**

**5. Gating logic:**
- `syncContactsForUser()` checks:
  - `if (!userId || !localContacts?.length)` → skips
  - No check for `socialGraphShareContacts` flag
  - No check for `emailVerified` or `phoneVerified`

**6. What writes to Firestore:**
- `syncContactsForUser()` → `uploadContactsInBatches()` → `upsertContactForUser()`
- Writes to: `/users/{uid}/contacts/{contactId}`
- Then `onContactWrite` Cloud Function syncs to `globalContactsPublic` and `globalContactsPrivate`

#### Why Contact Import Didn't Work

**Diagnosis:**
1. **No OAuth scope requested:** Firebase Auth doesn't request contacts scope
2. **No fetch code:** `fetchGoogleContacts()` exists but is never called
3. **Empty contacts store:** `useContactsStore` starts empty and never gets populated
4. **Sync hook short-circuits:** `useSyncContacts` skips when `localContacts.length === 0`

**Result:** User creates contact in Google Contacts → logout/login → contacts store is empty → `useSyncContacts` skips → no Firestore writes → no global contacts

---

### B) Balance Leak on Re-Login

#### Current Code Reality

**1. WalletAllocProvider initialization:**
- **File:** `src/state/walletAlloc.tsx:45-53`
- **Initial state:** Uses `DEMO` (R6,103.00) when `!isAuthed`, `ZERO` when `isAuthed`
- **Auth state change:** `useEffect` resets to `ZERO` when `isAuthed === true` (line 62-70)

**2. Hydration gate:**
- **File:** `src/state/walletAlloc.tsx:59`
- **Flag:** `hydratedRef.current` (defaults to `false`)
- **Set to true:** Only after `syncFromWallets()` completes for authed users (line 232)
- **Guards:** All setters check `hydratedRef.current` before writing to Firestore

**3. Potential leak points:**

**A) Initial state race:**
- When user signs in, `WalletAllocProvider` initializes with `ZERO`
- But if `useEffect` (line 62) runs AFTER component mount, there might be a window where demo values exist
- **However:** `useState(() => (isAuthed ? ZERO : DEMO))` should handle this correctly

**B) setEarnings not guarded:**
- **File:** `src/state/walletAlloc.tsx:197-205`
- **Problem:** `setEarnings()` does NOT write to Firestore (no `updateWalletBalances` call)
- **But:** If `earningsCents` is set in initial `DEMO` state, it persists in local state
- **When:** User signs out → `DEMO` state (earningsCents: 61030 = R610.30)
- **Then:** User signs in → `useEffect` resets to `ZERO` BUT if there's a race condition...

**C) Portfolio initialization:**
- **File:** `src/app/page.tsx:277-279`
- **Code:** `initPortfolioFromAlloc(alloc.cashCents, alloc.ethCents, alloc.zwdCents, alloc.totalCents)`
- **Runs:** Every time `alloc` changes
- **Potential issue:** If `alloc` has demo values when user signs in, portfolio gets initialized with demo values

**D) Animation cycle:**
- **File:** `src/lib/animations/useAiActionCycle.ts:53-55`
- **Guard:** `if (isAuthed) return` - should stop animations for authed users
- **But:** If animation runs before auth state updates, it could write demo values

**E) Re-login scenario:**
- User signs out → `WalletAllocProvider` resets to `DEMO` (line 70)
- User signs back in → `useEffect` should reset to `ZERO` (line 65)
- **BUT:** If `syncFromWallets` hasn't run yet, and something triggers a setter...

#### Most Likely Cause

**Hypothesis:** On re-login, the `useEffect` that resets to `ZERO` (line 65) might run AFTER some component reads the `DEMO` state and initializes portfolio/UI with demo values. Then when `syncFromWallets` runs, it reads from Firestore (which should be zero), but if there's a timing issue...

**OR:** The `setEarnings` function doesn't write to Firestore, so earnings balance persists in local state even after sign-in, and then gets written somewhere else.

**OR:** The portfolio initialization (`initPortfolioFromAlloc`) runs with demo values before the `useEffect` resets to zero.

---

## Phase 2: Required Fixes (After Diagnosis Confirmed)

### A) Contacts: Implement Deterministic Resync

**Required changes:**
1. Add contacts scope to Google Auth Provider
2. Call `fetchGoogleContacts()` after sign-in
3. Populate `useContactsStore` with fetched contacts
4. Add throttling via `/users/{uid}/debug/contactsSync`
5. Check `socialGraphShareContacts` flag before syncing

### B) Balances: Hard Separation

**Required changes:**
1. Ensure `setEarnings` never writes to Firestore (already correct)
2. Add guard to `initPortfolioFromAlloc` to skip if not hydrated
3. Add audit logging to all `updateWalletBalances` calls
4. Ensure `useEffect` reset runs synchronously before any reads

---

## Next Steps

1. **Add diagnostic logging** to confirm diagnosis
2. **Add audit logging** to track all balance writes
3. **Implement fixes** after confirmation


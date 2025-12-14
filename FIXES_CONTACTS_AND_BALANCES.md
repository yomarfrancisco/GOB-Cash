# Fixes: Automatic Contact Sync & Zero Balance Enforcement

## Summary

This commit implements two critical fixes:

1. **Automatic Google Contacts sync on sign-in** - Contacts are now automatically imported when users sign in with Google
2. **Zero balance enforcement** - Authenticated users always start with zero balances and balances remain zero on re-login

## Files Changed

### A) Contact Sync Implementation

1. **`src/lib/firebase.ts`**
   - Added contacts scope to Google Auth Provider: `https://www.googleapis.com/auth/contacts.readonly`

2. **`src/hooks/useFirebaseAuth.ts`**
   - Modified `signInWithGoogle()` to capture Google OAuth access token from sign-in result
   - Stores access token in `sessionStorage` for contact sync

3. **`src/components/FirebaseAuthListener.tsx`**
   - Added access token capture for redirect flow
   - Triggers automatic contact sync in `subscribeToCurrentUserDoc` callback when `socialGraphShareContacts === true`

4. **`src/lib/contacts/syncGoogleContactsOnSignIn.ts`** (NEW)
   - New function that automatically syncs Google Contacts on sign-in
   - Fetches contacts from Google People API
   - Populates contacts store
   - Syncs to Firestore via existing `syncContactsForUser` flow
   - Implements 24h throttling via `lastContactsSyncAt` on user doc
   - Logs to `/users/{uid}/debug/contactsSyncLogs/{timestamp}`

### B) Balance Zero Enforcement

1. **`src/lib/wallets.ts`**
   - Added comprehensive audit logging to `updateWalletBalances()`
   - Logs all balance writes with caller info, stack trace, and warnings for non-zero writes

2. **`src/app/page.tsx`**
   - Modified portfolio initialization to only run with Firestore data for authed users
   - Prevents portfolio initialization with demo values for authenticated users

3. **`src/state/walletAlloc.tsx`**
   - Added comment clarifying `setEarnings()` never writes to Firestore (intentional)

## How to Verify

### A) Contact Sync Verification

**Test Steps:**
1. Create a test contact in Google Contacts (e.g., "Test User" with email)
2. Sign out of the app
3. Sign back in with Google
4. Wait a few seconds for sync to complete

**Expected Results:**
- ✅ Console shows: `[ContactSync] Starting automatic Google Contacts sync`
- ✅ Console shows: `[ContactSync] Fetched N contacts from Google`
- ✅ Firestore `/users/{uid}/contacts/{contactId}` has documents
- ✅ Firestore `/users/{uid}/debug/contactsSyncLogs/{timestamp}` exists with sync log
- ✅ Firestore `/globalContactsPublic/{handle}` has entries for contacts with handles
- ✅ Firestore `/globalContactsPrivate/{handle}` has email/phone for contacts
- ✅ Pre-auth Search shows contacts (from `globalContactsPublic`)
- ✅ Post-auth Search shows contacts with email/phone (from `globalContactsPrivate`)

**If contacts are empty:**
- ✅ Sync log shows `contactsFetchedCount: 0` and `contactsWrittenCount: 0`
- ✅ This proves sync ran even with 0 contacts

**Throttling Test:**
- Sign out and sign back in immediately → sync should be skipped (throttled)
- Console shows: `[ContactSync] Skipping: last sync was X.Xh ago (throttle: 24h)`

### B) Balance Zero Enforcement Verification

**Test Steps:**
1. **New User Signup:**
   - Delete test user from Firestore (or use fresh account)
   - Sign up with new Google account
   - Check balances immediately after signup

2. **Re-Login Test:**
   - Sign out
   - Sign back in with same account
   - Check balances

3. **Refresh Test:**
   - While signed in, refresh the page
   - Check balances

**Expected Results:**
- ✅ All balances are zero: `cashZAR: 0`, `eth: 0`, `cashZWD: 0`, `earnings: 0`
- ✅ Console shows: `[Wallets] AUDIT: updateWalletBalances called` for any writes
- ✅ No non-zero balance writes appear in audit logs for authed users
- ✅ Firestore `/users/{uid}/wallets/*` all have `fiatBalance: 0` and `usdtBalance: 0`

**If non-zero balance appears:**
- ✅ Check console for `[Wallets] AUDIT WARNING: Writing non-zero balance`
- ✅ Check the `caller` field in audit log to identify source
- ✅ Verify `hydratedRef.current === true` before any write (should be true after first `syncFromWallets`)

**Portfolio Initialization:**
- ✅ Portfolio only initializes after wallets are loaded from Firestore (not with demo values)
- ✅ Console shows: `[Wallet] Synced WalletAlloc from wallets:` before portfolio init

## Implementation Details

### Contact Sync Flow

1. User signs in with Google → `signInWithGoogle()` captures OAuth access token
2. Token stored in `sessionStorage` as `google_access_token`
3. `FirebaseAuthListener` detects sign-in → calls `ensureUserDocument()`
4. `subscribeToCurrentUserDoc` callback fires with user doc data
5. If `socialGraphShareContacts !== false`, calls `syncGoogleContactsOnSignIn()`
6. Function checks throttling (24h), fetches contacts, populates store, syncs to Firestore
7. Existing `onContactWrite` Cloud Function automatically syncs to `globalContactsPublic/Private`

### Balance Zero Enforcement

1. `WalletAllocProvider` initializes with `ZERO` for authed users, `DEMO` for pre-auth
2. `useEffect` resets to `ZERO` when `isAuthed` changes to `true`
3. `syncFromWallets()` reads from Firestore (all zeros) and sets `hydratedRef.current = true`
4. All setters (`setCash`, `setEth`, `setZwd`) check `hydratedRef.current` before writing
5. Portfolio initialization waits for Firestore data before initializing
6. Audit logging captures all balance writes with full context

## Notes

- Contact sync is throttled to once per 24 hours per user
- Access token is stored in `sessionStorage` and may expire; user may need to sign in again if token expires
- Balance audit logs are verbose in console; production may want to reduce logging
- `setEarnings()` intentionally does NOT write to Firestore (earnings should only come from real transactions)


# Fixes: Remove Google Contacts Sync + Zero Balance Display + Directory Auto-Sync

## Summary

This commit implements three fixes:

1. **Removed Google Contacts sync** - Eliminates "unverified app" warning by removing contacts scope
2. **Fixed card balance display** - Cards now read directly from Firestore wallets for authed users, preventing demo value leaks
3. **Directory auto-sync verified** - Signed-up users automatically appear in global directory via existing `onUserWrite` Cloud Function

## Files Changed

### A) Remove Google Contacts Sync

1. **`src/lib/firebase.ts`**
   - Removed contacts scope: `https://www.googleapis.com/auth/contacts.readonly`
   - Reverted to no additional scopes

2. **`src/hooks/useFirebaseAuth.ts`**
   - Removed access token capture logic (lines 35-42)
   - Removed `GoogleAuthProvider` import (no longer needed)

3. **`src/components/FirebaseAuthListener.tsx`**
   - Removed automatic contact sync trigger from `subscribeToCurrentUserDoc`
   - Removed access token capture from redirect flow

4. **`src/lib/contacts/syncGoogleContactsOnSignIn.ts`** (DELETED)
   - Entire file removed - no longer needed

### B) Fix Card Balance Display (Prevent Demo Value Leaks)

1. **`src/components/CardStackCard.tsx`**
   - Cards now read directly from Firestore wallets for authed users
   - For authed users: `wallets[walletId].fiatBalance` (source of truth)
   - For pre-auth: `alloc[allocKey]` (demo values for marketing)
   - Prevents cards from showing demo values during auth state transitions

**Key change:**
```typescript
// For authed users: use Firestore wallets (source of truth), fallback to 0 if not loaded yet
// For pre-auth: use alloc (demo values)
let cents: number
if (isAuthed && wallets && !demoMode && walletId) {
  // Read directly from Firestore wallets
  const wallet = (wallets as any)[walletId]
  const fiatBalance = wallet?.fiatBalance ?? 0
  cents = Math.round(fiatBalance * 100)
} else {
  // Pre-auth: use alloc (demo values)
  cents = (alloc as any)[allocKey] || 0
}
```

### C) Directory Auto-Sync (Already Implemented)

**Verified:** `onUserWrite` Cloud Function already syncs signed-up users to global directory:

1. **`functions/src/syncDirectoryForUser.ts`**
   - Calls `syncUserToGlobalContacts()` on every user write (line 281)

2. **`functions/src/syncUserToGlobalContacts.ts`**
   - Syncs to `globalContactsPublic/{handle}` with public fields
   - Syncs to `globalContactsPrivate/{handle}` with email/phone
   - Uses source: "signup" to distinguish from device contacts

3. **`functions/src/syncUserToGlobalContacts.ts`** (Updated)
   - Changed source from "user" to "signup" for clarity

4. **`scripts/backfillUsersToGlobalContacts.js`** (Updated)
   - Changed source from "user" to "signup" for consistency

## How to Verify

### A) No Google "Unverified App" Warning

**Test Steps:**
1. Sign in with Google on iOS
2. Check OAuth consent screen

**Expected Results:**
- ✅ No "Google hasn't verified this app" warning
- ✅ Only basic profile/email scopes requested
- ✅ No contacts-related permissions

### B) Card Balances Stay Zero for Authed Users

**Test Steps:**
1. Sign up as new user
2. Observe card balances immediately after signup
3. Sign out and sign back in
4. Observe card balances on re-login
5. Refresh page while signed in
6. Scroll cards (if applicable)

**Expected Results:**
- ✅ All cards show `0.00` immediately after signup
- ✅ All cards show `0.00` on re-login (no flash of demo values)
- ✅ All cards show `0.00` after refresh
- ✅ No "scroll → returns to 0" symptom (no data source swapping)
- ✅ Console shows: `[Wallet] Using Firestore wallets:` (not demo wallets)

**If demo values appear:**
- ✅ Check console for `[Wallets] AUDIT:` logs to identify source
- ✅ Verify `wallets` store has `demoMode: false` for authed users
- ✅ Verify cards are reading from `wallets[walletId].fiatBalance` not `alloc[allocKey]`

### C) Signed-Up Users Appear in Directory

**Test Steps:**
1. Sign up a brand new user with handle (e.g., `@testuser`)
2. Wait a few seconds for Cloud Function to run
3. Check Firestore:
   - `/users/{uid}` exists
   - `/globalContactsPublic/{normalizedHandle}` exists (e.g., `$testuser`)
   - `/globalContactsPrivate/{normalizedHandle}` exists (if email/phone present)
4. Open Search (pre-auth and post-auth)
5. Check if user appears in results

**Expected Results:**
- ✅ New user appears in Search results (both pre-auth and post-auth)
- ✅ Pre-auth: Shows handle + generic subtitle (no email/phone)
- ✅ Post-auth: Shows handle + email/phone subtitle (if available)
- ✅ Current user's own row is disabled (not selectable, shows "You")
- ✅ Avatar renders correctly (user's avatarUrl or generic fallback)

**Cloud Function Verification:**
- ✅ Check Cloud Function logs: `[onUserWrite] Successfully synced user to directory`
- ✅ Check Cloud Function logs: `[syncUserToGlobalContacts] Created/Updated globalContactsPublic`
- ✅ Verify source field in `globalContactsPublic` doc includes "signup"

## Implementation Details

### Card Balance Display Fix

**Problem:** Cards were reading from `alloc` state which could contain demo values during auth transitions.

**Solution:** Cards now read directly from Firestore wallets store for authed users:
- `isAuthed && wallets && !demoMode` → Read from `wallets[walletId].fiatBalance`
- Otherwise → Read from `alloc[allocKey]` (demo values for pre-auth)

This ensures:
- No demo values leak into authed user card displays
- Cards show `0.00` until Firestore wallets load (then show real values)
- No "scroll → returns to 0" symptom (single source of truth)

### Directory Auto-Sync

**Already Working:** The `onUserWrite` Cloud Function automatically syncs every user to `globalContactsPublic` and `globalContactsPrivate` when:
- User document is created (signup)
- User document is updated (profile changes)

**Source Tagging:** Users synced from signup have `sources: ['signup']` to distinguish from device contacts (`sources: ['device']`).

## Notes

- Google Contacts sync is completely removed - no more "unverified app" warning
- Cards will show `0.00` for authed users until Firestore wallets load (expected behavior)
- Directory sync happens server-side automatically - no client-side code needed
- All signed-up users appear in Search results automatically via `onUserWrite` trigger


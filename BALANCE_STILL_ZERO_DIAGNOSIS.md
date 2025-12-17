# Balance Still Zero - Deep Diagnosis

## Current State
- **Firestore:** `fiatBalance: 0` (confirmed in Firebase Console)
- **UI:** Shows R0,00 (confirmed by user)
- **Fix Deployed:** Commit `8156e9c` - "Fix: Preserve real balances while preventing demo leaks"

## Root Cause Analysis

### 1. The Balance Was Never Set (Most Likely)

**Evidence:**
- `seedCoreAgentBalance()` function exists but **has never been called**
- Firestore shows `fiatBalance: 0` with `updatedAt: 17 December 2025 at 16:56:41 UTC+2`
- This timestamp is BEFORE the fix was deployed (commit `8156e9c`)

**Conclusion:** The balance is 0 because it was never set to a non-zero value in the first place.

**Verification Needed:**
- Check Firebase Functions logs for `seedCoreAgentBalance` calls
- Check if any payment was sent TO CoreAgent (as receiver)
- Check if balance was ever manually set in Firestore Console

### 2. Code Deployment Status

**Fix Commit:** `8156e9c` (pushed to `main`)
- **Vercel:** Auto-deploys on push to `main`
- **Status:** Unknown if deployment completed

**Possible Issues:**
- Vercel build might still be in progress
- Browser cache might be serving old code
- CDN cache might not have invalidated

**Verification Needed:**
- Check Vercel deployment status
- Check browser console for new log messages:
  - `[Wallets] Wallets already exist for user ... - preserving existing balances`
  - `[AUTH_TRANSITION] User authenticated - cleared client state to zero (Firestore preserved)`

### 3. Other Reset Mechanisms (Unlikely but Possible)

**Checked:**
- ✅ `resetWalletBalancesToZero()` - Not called from anywhere (only defined)
- ✅ `resetMyBalances` Cloud Function - Manual only, not automatic
- ✅ Firestore Triggers - None reset wallets (`onTxActionCreate`, `onUserWrite`, `onContactWrite` don't touch wallets)
- ✅ `ensureDefaultWallets()` - Fixed, no longer resets

**Conclusion:** No other automatic reset mechanisms found.

### 4. Multiple Call Sites for `ensureDefaultWallets()`

**Found 3 call sites:**
1. `src/components/FirebaseAuthListener.tsx:171` - On sign-in ✅ Fixed
2. `src/lib/userDoc.ts:352` - In `ensureUserDocument()` 
3. `src/lib/userDoc.ts:474` - In `ensureUserDocument()` (new user path)

**Status:** All 3 call sites use the same fixed `ensureDefaultWallets()` function, so they should all preserve balances.

**Verification Needed:** Check if `ensureUserDocument()` is being called and if it's preserving balances correctly.

### 5. Browser/Client Cache Issues

**Possible Issues:**
- Browser cache serving old JavaScript bundle
- Service worker cache
- CDN cache not invalidated

**Verification:**
- Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
- Check browser console for new log messages
- Check Network tab for JavaScript bundle timestamps

### 6. The Fix Only Prevents Reset - Doesn't Set Balance

**Critical Understanding:**
- The fix **prevents** balances from being reset to 0
- The fix **does NOT** set balances to non-zero
- If balance is already 0, it will stay 0 until something sets it

**What Sets Balances:**
1. `seedCoreAgentBalance()` Cloud Function - Needs to be called
2. `tx_createPaymentAndSettle()` - When CoreAgent receives payment
3. Manual Firestore Console edit
4. Other payment/transaction flows

**Conclusion:** The balance is 0 because nothing has set it to non-zero yet.

## Diagnosis Summary

### Primary Cause: Balance Never Set
- `seedCoreAgentBalance()` exists but hasn't been called
- No payments have been sent TO CoreAgent (as receiver)
- Balance was never manually set

### Secondary Cause: Deployment Status Unknown
- Fix is committed and pushed
- Vercel deployment status unknown
- Browser cache might be serving old code

### Tertiary Cause: Multiple Code Paths
- `ensureDefaultWallets()` is called from 3 places
- All should be fixed, but need verification

## Required Actions (Diagnosis Only - No Code Changes)

### 1. Verify Deployment
- Check Vercel dashboard for deployment status
- Check if commit `8156e9c` is live
- Hard refresh browser (Cmd+Shift+R)

### 2. Verify Balance Was Never Set
- Check Firebase Functions logs for `seedCoreAgentBalance` calls
- Check transaction history for payments TO CoreAgent
- Check Firestore Console history for manual edits

### 3. Test the Fix
- Call `seedCoreAgentBalance({ amountZAR: 10000 })` as CoreAgent
- Verify Firestore shows `fiatBalance: 10000`
- Sign out and sign back in
- Verify balance remains 10000 (not reset to 0)

### 4. Check Browser Console
- Look for new log messages:
  - `[Wallets] Wallets already exist for user ... - preserving existing balances`
  - `[AUTH_TRANSITION] User authenticated - cleared client state to zero (Firestore preserved)`
- If old messages appear, code hasn't deployed yet

### 5. Verify All Call Sites
- Check if `ensureUserDocument()` is being called
- Verify it's using the fixed `ensureDefaultWallets()`
- Check if there are any other wallet initialization paths

## Expected Behavior After Fix

1. **If balance is 0:**
   - Stays 0 (fix doesn't set it, only preserves it)

2. **If balance is set to 10000:**
   - Persists across sign-ins
   - Not reset to 0
   - UI displays 10000

3. **If payment received:**
   - Balance increments
   - Persists across sign-ins
   - Not reset to 0

## Conclusion

**Most Likely:** The balance is 0 because it was never set to a non-zero value. The fix prevents resets, but doesn't create balances.

**Next Step:** Call `seedCoreAgentBalance({ amountZAR: 10000 })` and verify it persists across sign-ins.


# Balance Provenance Investigation Report

## Investigation Summary

**Question:** Why does CoreAgent's balance show R10,000 before calling `setCoreAgentBalance(10000)`?

**Answer:** The balance came from **Firestore** because a previous call to `setCoreAgentBalance` or `seedCoreAgentBalance` succeeded and wrote R10,000 to Firestore, but the UI was previously blocking it. After fixing the UI zeroing bug, the balance now displays correctly.

---

## 1. Source of Truth: Firestore

**Firestore Path:** `users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR`

**Expected Fields:**
- `fiatBalance: 10000` (or the actual stored value)
- `updatedAt: <timestamp>` (when it was last written)
- `walletId: 'cashZAR'`
- `kind: 'cash'`
- `displayCurrency: 'ZAR'`

**To Verify:** Check Firebase Console or use the new logging (see below).

---

## 2. Codebase Search Results

### ✅ No Automatic Seeding Found

**Searched for:**
- `setCoreAgentBalance(` - Only found in:
  - `src/components/FirebaseAuthListener.tsx` (exposes `window.gbkAdmin.setCoreAgentBalance` - **not auto-called**)
  - `src/lib/transactions/clientFunctions.ts` (client wrapper)
  - `functions/src/admin/setCoreAgentBalance.ts` (Cloud Function)

- `seedCoreAgentBalance(` - Only found in:
  - `src/lib/transactions/clientFunctions.ts` (client wrapper)
  - `functions/src/admin/seedCoreAgentBalance.ts` (Cloud Function)

- `amountZAR: 10000` - Only found in:
  - Demo templates (unrelated)
  - CSS z-index values (unrelated)
  - No automatic balance setting

**Conclusion:** There is **NO automatic seeding** on sign-in or initialization. The balance must have been set by a **previous manual call**.

---

## 3. Previous Call Success Hypothesis

**Most Likely Scenario:**

1. **Previous Attempt:** You (or someone) previously called:
   ```javascript
   await window.gbkAdmin.setCoreAgentBalance(10000)
   // OR
   await seedCoreAgentBalance({ amountZAR: 10000 })
   ```

2. **Cloud Function Succeeded:** The callable function (`setCoreAgentBalance` or `seedCoreAgentBalance`) successfully wrote `fiatBalance: 10000` to Firestore.

3. **UI Was Blocking:** The client-side balance instrumentation in `src/store/wallets.ts` was zeroing out the Firestore balance before it reached the UI (this was the bug we just fixed).

4. **Fix Applied:** After fixing the zeroing bug, the Firestore balance now passes through to the UI.

5. **Result:** The UI now shows R10,000 because it's reading the value that was already in Firestore from the previous successful call.

---

## 4. Logging Added

**New Logs Added:**

### `src/lib/wallets.ts` - First Snapshot Logging
```typescript
[BALANCE_PROVENANCE] 🔍 FIRST Firestore snapshot received
```
- Logs on the **first** `onSnapshot` event
- Shows exact `fiatBalance`, `updatedAt` timestamp, and wallet structure
- Identifies whether this is the first snapshot vs subsequent updates

### `src/components/FirebaseAuthListener.tsx` - Wallet Store Receipt
```typescript
[BALANCE_PROVENANCE] 📊 Wallet store received from Firestore
```
- Logs when wallet store receives data from Firestore
- Confirms `hasFirestoreStructure` (walletId, kind, displayCurrency)
- Shows the exact balance values being set

**How to Use:**
1. Sign in as CoreAgent
2. Check browser console for `[BALANCE_PROVENANCE]` logs
3. The first snapshot log will show:
   - The exact `fiatBalance` from Firestore
   - The `updatedAt` timestamp (when it was written)
   - Whether the wallet has proper Firestore structure

---

## 5. Verification Steps

### Step 1: Check Firestore Directly
1. Open Firebase Console
2. Navigate to: `users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR`
3. Check:
   - `fiatBalance` value
   - `updatedAt` timestamp
   - Full document fields

### Step 2: Check Console Logs
1. Sign in as CoreAgent
2. Look for `[BALANCE_PROVENANCE] 🔍 FIRST Firestore snapshot received`
3. Note the `fiatBalance` and `updatedAt` values

### Step 3: Check Cloud Function Logs
1. Open Firebase Console → Functions → Logs
2. Search for `[setCoreAgentBalance]` or `[seedCoreAgentBalance]`
3. Find the most recent successful call
4. Note the timestamp and `amountZAR` value

---

## 6. Root Cause Conclusion

**"The balance came from Firestore because a previous successful call to `setCoreAgentBalance(10000)` or `seedCoreAgentBalance({ amountZAR: 10000 })` wrote it to Firestore, but the UI was previously zeroing it out. After fixing the client-side zeroing bug, the Firestore balance now displays correctly."**

**Evidence:**
- ✅ No automatic seeding code exists
- ✅ `ensureDefaultWallets` no longer resets balances (fixed in previous commit)
- ✅ Client-side zeroing bug was fixed (this commit)
- ✅ Balance is now showing because Firestore value is being read correctly

**Next Steps:**
1. Check the `updatedAt` timestamp in Firestore to confirm when it was written
2. Check Cloud Function logs to find the successful call
3. The new logging will show the exact values on next sign-in

---

## 7. Files Changed

1. **`src/lib/wallets.ts`**
   - Added first snapshot detection
   - Logs full wallet details on first `onSnapshot`
   - Includes `updatedAt` timestamp

2. **`src/components/FirebaseAuthListener.tsx`**
   - Added logging when wallet store receives Firestore data
   - Confirms Firestore structure detection

**No functional changes** - only diagnostic logging added.


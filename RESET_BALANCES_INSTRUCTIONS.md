# Reset Balances & Fix Firestore Permissions

## ✅ Completed

### 1. Firestore Rules Updated
- **File**: `firestore.rules`
- **Changes**:
  - Added rules for `transactions/{txId}` collection
  - Added rules for `transactions/{txId}/messages/{msgId}` subcollection
  - Added rules for `transactions/{txId}/proofs/{proofId}` subcollection
  - Added rules for `withdrawals/{withdrawalId}` collection
  - Rules allow authenticated users to read transactions where they are participants
  - Rules block client writes (Cloud Functions only via Admin SDK)
- **Deployed**: ✅ Rules deployed to `gobankless-dev`

### 2. Reset Balances Function
- **Cloud Function**: `resetMyBalances` (deployed to `us-central1`)
- **Client Wrapper**: `src/lib/resetBalances.ts`

## 🔧 How to Reset Your Balances

### Option 1: Browser Console (Recommended)
1. Open your browser console (F12 or Cmd+Option+I)
2. Find your UID from the console logs (look for `[Firebase] Auth state changed: user <uid>` or `[Firebase] User details: { uid: ... }`)
3. Run this in the console:

```javascript
// Import the reset function
import { resetMyBalances } from '/src/lib/resetBalances'

// Call it
await resetMyBalances()
```

**OR** if the import doesn't work, use the Firebase Functions SDK directly:

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '/src/lib/firebase'

const functions = getFunctions(getFirebaseApp(), 'us-central1')
const resetFn = httpsCallable(functions, 'resetMyBalances')
const result = await resetFn({})
console.log('Reset result:', result.data)
```

### Option 2: Firebase Console (Manual)
1. Go to [Firebase Console](https://console.firebase.google.com/project/gobankless-dev/firestore)
2. Navigate to `users/{your-uid}/wallets`
3. For each wallet document (cashZAR, cashMZN, etc.):
   - Click on the document
   - Set `fiatBalance` = 0
   - Set `usdtBalance` = 0
   - Set `lockedBalance` = 0 (if present)
   - Set `availableBalance` = 0 (if present)
   - Click "Update"
4. Also check `users/{your-uid}` document:
   - Set `balance` = 0 (if present)
   - Set `balanceZAR` = 0 (if present)
   - Set `balanceUSDT` = 0 (if present)
   - Set `balances.ZAR` = 0 (if present)
   - Set `balances.USDT` = 0 (if present)

## ✅ Verification Checklist

After resetting balances and refreshing the page:

1. **Balances are zero**:
   - [ ] UI shows R0.00 (or 0.00 for other currencies)
   - [ ] Firestore `users/{uid}/wallets/cashZAR.fiatBalance` = 0
   - [ ] Firestore `users/{uid}/wallets/cashZAR.usdtBalance` = 0

2. **Permissions errors are gone**:
   - [ ] No `"Missing or insufficient permissions"` error for transaction thread subscription
   - [ ] No `"Missing or insufficient permissions"` error for `ensureUserDocument`
   - [ ] Console shows: `[Transaction] Loaded transaction threads: X` (or 0 if no transactions)

3. **Transaction threads work**:
   - [ ] If you create a test transaction in Firestore, it appears in the inbox
   - [ ] Messages stream live from `transactions/{txId}/messages`

## 🔍 If Balances Reappear

If balances reappear after reset, check:

1. **Demo wallets**: The code uses `demoWallets` as fallback when `demoMode` is true. Check:
   - `src/store/wallets.ts` - `demoWallets` object
   - `src/app/page.tsx` - logic that uses `demoMode`

2. **Auto-write code**: Search for code that writes balances to Firestore:
   ```bash
   grep -r "fiatBalance.*=" src/
   grep -r "updateWalletBalances" src/
   ```

3. **Cloud Functions**: Check if any Cloud Functions are writing balances:
   - `tx_creditAndLock` - credits locked balance
   - `tx_unlockSweep` - moves locked to available

## 📝 Files Changed

1. `firestore.rules` - Added transaction collection rules
2. `functions/src/resetMyBalances.ts` - New Cloud Function to reset balances
3. `functions/src/index.ts` - Exported `resetMyBalances`
4. `src/lib/resetBalances.ts` - Client wrapper for reset function

## 🚀 Next Steps

1. Reset your balances using one of the methods above
2. Refresh the page and verify balances are zero
3. Check console for permission errors (should be gone)
4. Test transaction thread subscription (should work now)


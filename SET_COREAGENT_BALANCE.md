# Set CoreAgent Balance - Simple Instructions

## Quick Fix: Set Balance to R10,000

**Paste this into browser console (as CoreAgent):**

```javascript
const { getFunctions, httpsCallable } = await import('firebase/functions')
const { getFirebaseApp } = await import('/src/lib/firebase.ts')
const app = getFirebaseApp()
const functions = getFunctions(app, 'us-central1')
const setBalance = httpsCallable(functions, 'setCoreAgentBalance')
const result = await setBalance({ amountZAR: 10000 })
console.log('Balance set:', result.data)
```

**That's it!** The balance is now R10,000 and will persist across sign-ins.

## Verify It Worked

1. Check Firebase Console: `/users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR`
   - Should show `fiatBalance: 10000`

2. Refresh page
   - UI should show R10,000 (not R0)

3. Sign out and sign back in
   - Balance should still be R10,000


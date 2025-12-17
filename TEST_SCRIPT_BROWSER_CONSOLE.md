# Browser Console Test Script

## Quick Test (Paste into Browser Console)

**Must be run as CoreAgent (xHKmkizXhPOU25vwTIB6dxhMzSH2)**

```javascript
async function testSeed() {
  const { getFunctions, httpsCallable } = await import('firebase/functions')
  const { getFirebaseApp } = await import('/src/lib/firebase.ts')
  const { getFirestoreDb } = await import('/src/lib/firebase.ts')
  const { doc, getDoc } = await import('firebase/firestore')
  
  const app = getFirebaseApp()
  const functions = getFunctions(app, 'us-central1')
  const db = getFirestoreDb()
  
  const CORE_AGENT_UID = 'xHKmkizXhPOU25vwTIB6dxhMzSH2'
  const TEST_AMOUNT = 12345
  const walletPath = `users/${CORE_AGENT_UID}/wallets/cashZAR`
  
  console.log('=== Testing Seed Function ===')
  console.log('Project ID:', app.options.projectId)
  console.log('Wallet path:', walletPath)
  console.log('Test amount:', TEST_AMOUNT)
  
  // Read BEFORE
  const walletRef = doc(db, 'users', CORE_AGENT_UID, 'wallets', 'cashZAR')
  const beforeSnap = await getDoc(walletRef)
  console.log('\n[BEFORE] Firestore data:', beforeSnap.data())
  
  // Call function
  const seedFn = httpsCallable(functions, 'seedCoreAgentBalance')
  console.log('\n[Calling] seedCoreAgentBalance...')
  try {
    const result = await seedFn({ amountZAR: TEST_AMOUNT })
    console.log('[Function Result]:', result.data)
  } catch (error) {
    console.error('[Function Error]:', error)
    console.error('Error code:', error.code)
    console.error('Error message:', error.message)
    console.error('Error details:', error.details)
    throw error
  }
  
  // Read AFTER
  const afterSnap = await getDoc(walletRef)
  const afterData = afterSnap.data()
  console.log('\n[AFTER] Firestore data:', afterData)
  
  if (afterData?.fiatBalance === TEST_AMOUNT) {
    console.log('\n✅ SUCCESS: Balance is', TEST_AMOUNT)
    return { success: true, balance: afterData.fiatBalance }
  } else {
    console.error('\n❌ FAIL: Balance is', afterData?.fiatBalance, 'expected', TEST_AMOUNT)
    return { success: false, balance: afterData?.fiatBalance, expected: TEST_AMOUNT }
  }
}

testSeed()
```

## What to Check

### 1. Build Marker
- Look in console for: `[BUILD] 8156e9c`
- If missing: Hard refresh (Cmd+Shift+R)

### 2. Function Logs
Run in terminal:
```bash
firebase functions:log --only seedCoreAgentBalance --project gobankless-dev
```

Look for:
- `[seedCoreAgentBalance] Writing to path: users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR`
- `projectId: gobankless-dev`
- `[seedCoreAgentBalance] Before update:` or `Creating new wallet:`
- `[seedCoreAgentBalance] After update:` or `After create:`
- `fiatBalance: 12345`

### 3. Firestore Verification
After running test:
- Check Firebase Console: `/users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR`
- Should show `fiatBalance: 12345`

### 4. Persistence Test
1. Hard refresh (Cmd+Shift+R)
2. Check console for: `[Wallets] Wallets already exist for user ... - preserving existing balances`
3. Check UI: Should show R12,345 (not R0)
4. Sign out and sign back in
5. Check Firestore: Should still be 12345
6. Check UI: Should still show R12,345

## Expected Output

**Browser Console:**
```
=== Testing Seed Function ===
Project ID: gobankless-dev
Wallet path: users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR
Test amount: 12345

[BEFORE] Firestore data: { fiatBalance: 0, ... }

[Calling] seedCoreAgentBalance...
[Function Result]: { success: true, uid: "xHKmkizXhPOU25vwTIB6dxhMzSH2", walletId: "cashZAR", amountZAR: 12345 }

[AFTER] Firestore data: { fiatBalance: 12345, ... }

✅ SUCCESS: Balance is 12345
```

**Function Logs:**
```
[seedCoreAgentBalance] Writing to path: users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR
projectId: gobankless-dev
[seedCoreAgentBalance] Before update: { existingFiatBalance: 0, ... }
[seedCoreAgentBalance] After update: { fiatBalance: 12345, ... }
```


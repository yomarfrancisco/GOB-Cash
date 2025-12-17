# CoreAgent Balance Verification Steps

## Step 1: Verify Build Deployment

**Check browser console on gobankless.app:**
- Look for: `[BUILD] 8156e9c`
- If present: ✅ Code is deployed
- If missing: ❌ Old code is running (clear cache, hard refresh)

## Step 2: Verify Function is Deployed

**Already verified:**
```bash
firebase functions:list --project gobankless-dev
# Output: seedCoreAgentBalance | v1 | callable | us-central1
```

✅ Function is deployed

## Step 3: Test Seed Function from Browser Console

**Paste this into browser console (as CoreAgent):**

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

## Step 4: Check Function Logs

**Run:**
```bash
firebase functions:log --only seedCoreAgentBalance --project gobankless-dev
```

**Look for:**
- `[seedCoreAgentBalance] Writing to path: users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR`
- `[seedCoreAgentBalance] Before update:` (or `Creating new wallet:`)
- `[seedCoreAgentBalance] After update:` (or `After create:`)
- `projectId: gobankless-dev`

## Step 5: Test Persistence

1. **After seeding:**
   - Verify Firestore shows `fiatBalance: 12345`
   - Note the `updatedAt` timestamp

2. **Hard refresh (Cmd+Shift+R / Ctrl+Shift+R):**
   - Check browser console for `[BUILD] 8156e9c`
   - Check console for: `[Wallets] Wallets already exist for user ... - preserving existing balances`
   - Verify UI shows R12,345 (not R0)

3. **Sign out and sign back in:**
   - Check Firestore: `fiatBalance` should still be 12345
   - Check UI: Should show R12,345
   - Check console: Should NOT see reset logs

## Expected Deliverables

1. ✅ Browser console shows `[BUILD] 8156e9c`
2. ✅ Function logs show successful write with correct path
3. ✅ Firestore doc shows `fiatBalance: 12345` after seeding
4. ✅ Balance persists after refresh and sign-in
5. ✅ UI displays R12,345 (not R0)

## Troubleshooting

**If function fails:**
- Check error code and message in console
- Verify caller UID matches CoreAgent UID
- Check function logs for permission errors

**If Firestore stays 0:**
- Verify projectId in function logs matches `gobankless-dev`
- Verify wallet path matches exactly: `users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR`
- Check if walletId is exactly `cashZAR` (case-sensitive)

**If balance resets after sign-in:**
- Check console for `[Wallets] Wallets already exist ... - preserving existing balances`
- If you see "reset balances to zero" → old code is running
- Hard refresh and check build marker again


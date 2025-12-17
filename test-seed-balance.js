/**
 * Test script to seed CoreAgent balance and verify persistence
 * Run from browser console as CoreAgent (xHKmkizXhPOU25vwTIB6dxhMzSH2)
 * 
 * Usage:
 * 1. Open gobankless.app as CoreAgent
 * 2. Open browser console
 * 3. Copy and paste this entire script
 * 4. Run: testSeedBalance()
 */

async function testSeedBalance() {
  console.log('=== Testing CoreAgent Balance Seeding ===')
  
  const CORE_AGENT_UID = 'xHKmkizXhPOU25vwTIB6dxhMzSH2'
  const TEST_AMOUNT = 12345
  
  try {
    // Step 1: Check build marker
    console.log('\n[Step 1] Checking build marker...')
    // Build marker should appear in console on page load
    
    // Step 2: Import seed function
    console.log('\n[Step 2] Importing seedCoreAgentBalance...')
    const { seedCoreAgentBalance } = await import('/src/lib/transactions/clientFunctions.ts')
    console.log('✅ seedCoreAgentBalance imported')
    
    // Step 3: Read Firestore BEFORE seeding
    console.log('\n[Step 3] Reading Firestore BEFORE seeding...')
    const { getFirestoreDb } = await import('/src/lib/firebase.ts')
    const { doc, getDoc } = await import('firebase/firestore')
    const db = getFirestoreDb()
    const walletRef = doc(db, 'users', CORE_AGENT_UID, 'wallets', 'cashZAR')
    const beforeSnap = await getDoc(walletRef)
    const beforeData = beforeSnap.data()
    console.log('Before seeding:', {
      exists: beforeSnap.exists,
      fiatBalance: beforeData?.fiatBalance,
      walletId: beforeData?.walletId,
      path: `users/${CORE_AGENT_UID}/wallets/cashZAR`,
    })
    
    // Step 4: Call seed function
    console.log(`\n[Step 4] Calling seedCoreAgentBalance with amountZAR: ${TEST_AMOUNT}...`)
    const result = await seedCoreAgentBalance({ amountZAR: TEST_AMOUNT })
    console.log('✅ seedCoreAgentBalance returned:', result)
    
    // Step 5: Read Firestore AFTER seeding
    console.log('\n[Step 5] Reading Firestore AFTER seeding...')
    const afterSnap = await getDoc(walletRef)
    const afterData = afterSnap.data()
    console.log('After seeding:', {
      exists: afterSnap.exists,
      fiatBalance: afterData?.fiatBalance,
      walletId: afterData?.walletId,
      updatedAt: afterData?.updatedAt?.toDate().toISOString(),
      path: `users/${CORE_AGENT_UID}/wallets/cashZAR`,
    })
    
    // Step 6: Verify balance matches
    if (afterData?.fiatBalance === TEST_AMOUNT) {
      console.log('✅ SUCCESS: Balance matches expected value!')
    } else {
      console.error('❌ FAIL: Balance does not match!', {
        expected: TEST_AMOUNT,
        actual: afterData?.fiatBalance,
      })
    }
    
    console.log('\n=== Test Complete ===')
    console.log('Next: Refresh page and sign in again to test persistence')
    
    return {
      success: afterData?.fiatBalance === TEST_AMOUNT,
      beforeBalance: beforeData?.fiatBalance,
      afterBalance: afterData?.fiatBalance,
      expectedBalance: TEST_AMOUNT,
    }
  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    })
    throw error
  }
}

// Export for use
window.testSeedBalance = testSeedBalance
console.log('✅ testSeedBalance() function loaded. Run: testSeedBalance()')


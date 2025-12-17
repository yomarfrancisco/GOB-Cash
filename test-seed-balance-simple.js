/**
 * Simplified test script - paste into browser console
 * Must be run as CoreAgent (xHKmkizXhPOU25vwTIB6dxhMzSH2)
 */

async function testSeed() {
  console.log('=== Testing CoreAgent Balance Seeding ===')
  
  try {
    // Import dependencies
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
    
    console.log('Project ID:', app.options.projectId)
    console.log('Wallet path:', walletPath)
    
    // Read BEFORE
    const walletRef = doc(db, 'users', CORE_AGENT_UID, 'wallets', 'cashZAR')
    const beforeSnap = await getDoc(walletRef)
    console.log('BEFORE:', beforeSnap.data())
    
    // Call function
    const seedFn = httpsCallable(functions, 'seedCoreAgentBalance')
    console.log('Calling seedCoreAgentBalance...')
    const result = await seedFn({ amountZAR: TEST_AMOUNT })
    console.log('Function result:', result.data)
    
    // Read AFTER
    const afterSnap = await getDoc(walletRef)
    console.log('AFTER:', afterSnap.data())
    
    if (afterSnap.data()?.fiatBalance === TEST_AMOUNT) {
      console.log('✅ SUCCESS: Balance is', TEST_AMOUNT)
    } else {
      console.error('❌ FAIL: Balance is', afterSnap.data()?.fiatBalance, 'expected', TEST_AMOUNT)
    }
    
    return afterSnap.data()
  } catch (error) {
    console.error('Error:', error)
    throw error
  }
}

window.testSeed = testSeed
console.log('Run: testSeed()')


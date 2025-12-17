/**
 * Diagnostic script to check CoreAgent wallet data in Firestore
 * Run: node diagnose-coreagent-balance.js
 */

const admin = require('firebase-admin')

// Initialize Firebase Admin
const serviceAccount = require('./functions/serviceAccountKey.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'gobankless-dev',
})

const db = admin.firestore()
const CORE_AGENT_UID = 'xHKmkizXhPOU25vwTIB6dxhMzSH2'

async function diagnose() {
  console.log('=== CoreAgent Balance Diagnosis ===\n')
  console.log('CoreAgent UID:', CORE_AGENT_UID)
  console.log('Project ID:', admin.app().options.projectId)
  console.log('Firestore Region:', 'eur3 (checking...)\n')

  try {
    // Check user document
    const userDoc = await db.collection('users').doc(CORE_AGENT_UID).get()
    if (!userDoc.exists) {
      console.log('❌ User document does not exist')
      return
    }
    console.log('✅ User document exists')
    const userData = userDoc.data()
    console.log('User handle:', userData?.handle || userData?.userHandle || 'N/A')
    console.log('')

    // Check wallets subcollection
    const walletsRef = db.collection('users').doc(CORE_AGENT_UID).collection('wallets')
    const walletsSnapshot = await walletsRef.get()

    if (walletsSnapshot.empty) {
      console.log('❌ No wallet documents found')
      console.log('Expected wallets: cashZAR, cashMZN, cashZWD, eth, btc, earnings')
      return
    }

    console.log(`✅ Found ${walletsSnapshot.size} wallet document(s):\n`)

    const expectedWallets = ['cashZAR', 'cashMZN', 'cashZWD', 'eth', 'btc', 'earnings']
    const foundWallets = new Set()

    walletsSnapshot.forEach((doc) => {
      const data = doc.data()
      const walletId = data.walletId || doc.id
      foundWallets.add(walletId)

      console.log(`Wallet: ${walletId}`)
      console.log(`  - fiatBalance: ${data.fiatBalance} (type: ${typeof data.fiatBalance})`)
      console.log(`  - usdtBalance: ${data.usdtBalance} (type: ${typeof data.usdtBalance})`)
      console.log(`  - displayCurrency: ${data.displayCurrency || 'N/A'}`)
      console.log(`  - kind: ${data.kind || 'N/A'}`)
      console.log(`  - updatedAt: ${data.updatedAt ? data.updatedAt.toDate().toISOString() : 'N/A'}`)
      console.log('')
    })

    // Check for missing wallets
    const missingWallets = expectedWallets.filter((w) => !foundWallets.has(w))
    if (missingWallets.length > 0) {
      console.log(`⚠️  Missing wallets: ${missingWallets.join(', ')}`)
    }

    // Check cashZAR specifically
    const cashZAR = walletsSnapshot.docs.find((d) => {
      const data = d.data()
      return (data.walletId || d.id) === 'cashZAR'
    })

    if (cashZAR) {
      const data = cashZAR.data()
      console.log('\n=== cashZAR Analysis ===')
      console.log('fiatBalance value:', data.fiatBalance)
      console.log('fiatBalance type:', typeof data.fiatBalance)
      console.log('fiatBalance is null?', data.fiatBalance === null)
      console.log('fiatBalance is undefined?', data.fiatBalance === undefined)
      console.log('fiatBalance is 0?', data.fiatBalance === 0)
      console.log('fiatBalance > 0?', data.fiatBalance > 0)
    } else {
      console.log('\n❌ cashZAR wallet not found')
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    process.exit(0)
  }
}

diagnose()


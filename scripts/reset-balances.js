/**
 * Script to reset user wallet balances to zero
 * Usage: node scripts/reset-balances.js <uid>
 * 
 * This script uses Firebase Admin SDK to reset all wallet balances for a user.
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'gobankless-dev'
});

const db = admin.firestore();

async function resetBalances(uid) {
  console.log(`Resetting balances for user: ${uid}`);
  
  const walletsRef = db.collection('users').doc(uid).collection('wallets');
  const walletsSnap = await walletsRef.get();
  
  if (walletsSnap.empty) {
    console.log('No wallets found for this user');
    return;
  }
  
  const batch = db.batch();
  let count = 0;
  
  walletsSnap.forEach((doc) => {
    const walletData = doc.data();
    const updates = {};
    
    // Reset all balance fields to 0
    if (walletData.fiatBalance !== undefined) {
      updates.fiatBalance = 0;
    }
    if (walletData.usdtBalance !== undefined) {
      updates.usdtBalance = 0;
    }
    if (walletData.lockedBalance !== undefined) {
      updates.lockedBalance = 0;
    }
    if (walletData.availableBalance !== undefined) {
      updates.availableBalance = 0;
    }
    
    // Also reset any other balance-related fields
    if (walletData.balance !== undefined) {
      updates.balance = 0;
    }
    if (walletData.balanceZAR !== undefined) {
      updates.balanceZAR = 0;
    }
    if (walletData.balanceUSDT !== undefined) {
      updates.balanceUSDT = 0;
    }
    
    if (Object.keys(updates).length > 0) {
      batch.update(doc.ref, updates);
      count++;
      console.log(`  - ${doc.id}: resetting ${Object.keys(updates).join(', ')}`);
    }
  });
  
  // Also check user document for any balance fields
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  
  if (userSnap.exists) {
    const userData = userSnap.data();
    const userUpdates = {};
    
    if (userData.balance !== undefined) {
      userUpdates.balance = 0;
    }
    if (userData.balanceZAR !== undefined) {
      userUpdates.balanceZAR = 0;
    }
    if (userData.balanceUSDT !== undefined) {
      userUpdates.balanceUSDT = 0;
    }
    if (userData.balances) {
      userUpdates.balances = {};
      if (userData.balances.ZAR) userUpdates.balances.ZAR = 0;
      if (userData.balances.USDT) userUpdates.balances.USDT = 0;
    }
    
    if (Object.keys(userUpdates).length > 0) {
      batch.update(userRef, userUpdates);
      console.log(`  - user document: resetting ${Object.keys(userUpdates).join(', ')}`);
    }
  }
  
  if (count > 0 || Object.keys(userUpdates || {}).length > 0) {
    await batch.commit();
    console.log(`\n✅ Successfully reset balances for ${count} wallet(s)`);
  } else {
    console.log('\n⚠️  No balance fields found to reset');
  }
}

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node scripts/reset-balances.js <uid>');
  console.error('Please provide the user UID as an argument');
  process.exit(1);
}

resetBalances(uid)
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });


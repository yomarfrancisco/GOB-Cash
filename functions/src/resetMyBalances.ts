/**
 * Cloud Function: resetMyBalances
 * 
 * Resets the calling user's wallet balances to zero.
 * Useful for testing and account reset.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()

export const resetMyBalances = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const uid = context.auth.uid
    console.log(`[resetMyBalances] Resetting balances for user: ${uid}`)
    
    const walletsRef = db.collection('users').doc(uid).collection('wallets')
    const walletsSnap = await walletsRef.get()
    
    const batch = db.batch()
    let walletCount = 0
    
    // Reset all wallet balances
    walletsSnap.forEach((doc) => {
      const walletData = doc.data()
      const updates: any = {}
      
      // Reset all balance fields to 0
      if (walletData.fiatBalance !== undefined) {
        updates.fiatBalance = 0
      }
      if (walletData.usdtBalance !== undefined) {
        updates.usdtBalance = 0
      }
      if (walletData.lockedBalance !== undefined) {
        updates.lockedBalance = 0
      }
      if (walletData.availableBalance !== undefined) {
        updates.availableBalance = 0
      }
      if (walletData.balance !== undefined) {
        updates.balance = 0
      }
      if (walletData.balanceZAR !== undefined) {
        updates.balanceZAR = 0
      }
      if (walletData.balanceUSDT !== undefined) {
        updates.balanceUSDT = 0
      }
      
      if (Object.keys(updates).length > 0) {
        batch.update(doc.ref, updates)
        walletCount++
        console.log(`[resetMyBalances] Resetting ${doc.id}: ${Object.keys(updates).join(', ')}`)
      }
    })
    
    // Also reset user document balance fields if present
    const userRef = db.collection('users').doc(uid)
    const userSnap = await userRef.get()
    
    let userUpdatesCount = 0
    if (userSnap.exists) {
      const userData = userSnap.data()!
      const userUpdates: any = {}
      
      if (userData.balance !== undefined) {
        userUpdates.balance = 0
      }
      if (userData.balanceZAR !== undefined) {
        userUpdates.balanceZAR = 0
      }
      if (userData.balanceUSDT !== undefined) {
        userUpdates.balanceUSDT = 0
      }
      if (userData.balances) {
        userUpdates.balances = {}
        if (userData.balances.ZAR !== undefined) {
          userUpdates.balances.ZAR = 0
        }
        if (userData.balances.USDT !== undefined) {
          userUpdates.balances.USDT = 0
        }
      }
      
      if (Object.keys(userUpdates).length > 0) {
        batch.update(userRef, userUpdates)
        userUpdatesCount = Object.keys(userUpdates).length
        console.log(`[resetMyBalances] Resetting user doc: ${Object.keys(userUpdates).join(', ')}`)
      }
    }
    
    if (walletCount > 0 || userUpdatesCount > 0) {
      await batch.commit()
      console.log(`[resetMyBalances] Successfully reset balances for ${walletCount} wallet(s)`)
      return { 
        ok: true, 
        walletsReset: walletCount,
        message: `Reset ${walletCount} wallet(s) to zero`
      }
    } else {
      return { 
        ok: true, 
        walletsReset: 0,
        message: 'No balance fields found to reset'
      }
    }
  })


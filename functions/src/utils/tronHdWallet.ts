/**
 * TRON HD Wallet Derivation
 * Derives per-user TRON addresses from HD mnemonic seed
 * Path: m/44'/195'/0'/0/{index}
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { mnemonicToSeedSync } from '@scure/bip39'
import { HDKey } from '@scure/bip32'
import TronWeb from 'tronweb'

const db = admin.firestore()

/**
 * TRON coin type (BIP44)
 */
const TRON_COIN_TYPE = 195

/**
 * Derivation path template: m/44'/195'/0'/0/{index}
 */
function getDerivationPath(index: number): string {
  return `m/44'/${TRON_COIN_TYPE}'/0'/0/${index}`
}

/**
 * Derive TRON address from mnemonic and index
 */
export function deriveTronAddress(mnemonic: string, index: number): { address: string; path: string } {
  // Validate mnemonic
  if (!mnemonic || typeof mnemonic !== 'string') {
    throw new Error('Invalid mnemonic')
  }

  // Convert mnemonic to seed
  const seed = mnemonicToSeedSync(mnemonic)
  
  // Create HD key from seed
  const hdKey = HDKey.fromMasterSeed(seed)
  
  // Derive key at path
  const path = getDerivationPath(index)
  const derivedKey = hdKey.derive(path)
  
  if (!derivedKey.privateKey) {
    throw new Error('Failed to derive private key')
  }
  
  // Convert private key to TRON address
  // TRON uses secp256k1, same as Bitcoin
  const privateKeyHex = Buffer.from(derivedKey.privateKey).toString('hex')
  
  // Use TronWeb static utility to get address from private key
  // TronWeb.address is a static utility, not an instance method
  const address = (TronWeb as any).address.fromPrivateKey(privateKeyHex)
  
  return {
    address,
    path,
  }
}

/**
 * Get or create TRON address for user
 * Uses system/counters doc to track tronIndex
 */
export async function ensureTronAddress(userId: string): Promise<{ address: string; index: number; path: string }> {
  // Check if user already has TRON address
  const userRef = db.collection('users').doc(userId)
  const userSnap = await userRef.get()
  
  if (userSnap.exists) {
    const userData = userSnap.data()
    const chainAddresses = userData?.chain_addresses as any
    
    if (chainAddresses?.tron?.address) {
      // User already has address, return it
      return {
        address: chainAddresses.tron.address,
        index: chainAddresses.tron.index,
        path: chainAddresses.tron.path,
      }
    }
  }
  
  // Get mnemonic from env
  const mnemonic = functions.config().tron?.master_seed
  if (!mnemonic) {
    throw new Error('TRON_MASTER_SEED not configured')
  }
  
  // Get next index from system/counters
  const countersRef = db.collection('system').doc('counters')
  
  let tronIndex: number = 0
  await db.runTransaction(async (t) => {
    const countersSnap = await t.get(countersRef)
    const countersData = countersSnap.data() || {}
    
    // Get current index or start at 0
    tronIndex = countersData.tronIndex || 0
    
    // Increment for next user
    t.set(countersRef, {
      ...countersData,
      tronIndex: tronIndex + 1,
    }, { merge: true })
  })
  
  // Derive address
  const { address, path } = deriveTronAddress(mnemonic, tronIndex)
  
  // Store on user doc
  const now = admin.firestore.Timestamp.now()
  await userRef.set({
    chain_addresses: {
      tron: {
        address,
        index: tronIndex,
        path,
        createdAt: now,
      },
    },
  }, { merge: true })
  
  console.log('[TronHdWallet] Assigned TRON address to user', {
    userId,
    address,
    index: tronIndex,
    path,
  })
  
  return {
    address,
    index: tronIndex,
    path,
  }
}


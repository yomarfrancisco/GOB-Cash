/**
 * TRON utility functions
 * Shared utilities for TRON network operations
 */

import * as functions from 'firebase-functions'
import TronWeb from 'tronweb'

/**
 * USDT TRC-20 contract address (mainnet)
 * Tether USD (USDT) on TRON: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
 */
export const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

/**
 * USDT decimals (TRC-20)
 */
export const USDT_DECIMALS = 6

/**
 * Initialize TronWeb instance
 */
export function getTronWeb(): TronWeb {
  const privateKey = functions.config().tron?.treasury_private_key
  const fullHost = functions.config().tron?.fullhost || 'https://api.trongrid.io'
  const apiKey = functions.config().tron?.api_key

  if (!privateKey) {
    throw new Error('TRON_TREASURY_PRIVATE_KEY not configured')
  }

  const tronWeb = new TronWeb({
    fullHost,
    headers: apiKey ? { 'TRON-PRO-API-KEY': apiKey } : undefined,
    privateKey,
  })

  return tronWeb
}

/**
 * Get treasury address from private key
 */
export function getTreasuryAddress(): string {
  const privateKey = functions.config().tron?.treasury_private_key
  if (!privateKey) {
    throw new Error('TRON_TREASURY_PRIVATE_KEY not configured')
  }

  // Use TronWeb's static address utility
  return (TronWeb as any).address.fromPrivateKey(privateKey)
}

/**
 * Get treasury USDT balance (on-chain)
 */
export async function getTreasuryUsdtBalance(): Promise<number> {
  const tronWeb = getTronWeb()
  const treasuryAddress = getTreasuryAddress()

  try {
    const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS)
    
    // Call balanceOf method - TronWeb contract API
    const balanceResult: any = await contract.balanceOf(treasuryAddress).call()
    
    // Extract balance value (may be BigNumber or string)
    const balanceValue = balanceResult?.toString() || balanceResult || '0'
    const balanceSun = Number(balanceValue)
    
    // Convert from smallest unit (Sun) to USDT (divide by 10^6)
    const balanceUSDT = balanceSun / Math.pow(10, USDT_DECIMALS)
    
    console.log('[TronUtils] Treasury USDT balance:', {
      treasuryAddress,
      balanceSun: balanceValue,
      balanceUSDT,
    })
    
    return balanceUSDT
  } catch (error: any) {
    console.error('[TronUtils] Error getting treasury balance:', error)
    throw new Error(`Failed to get treasury balance: ${error.message}`)
  }
}

/**
 * Validate TRON address format
 */
export function validateTronAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false
  }
  
  const trimmed = address.trim()
  
  // TRON addresses: start with T, base58check, ~34 characters
  if (!trimmed.startsWith('T')) {
    return false
  }
  
  if (trimmed.length < 33 || trimmed.length > 35) {
    return false
  }
  
  // Basic format check (base58 characters)
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/
  if (!base58Regex.test(trimmed)) {
    return false
  }
  
  return true
}


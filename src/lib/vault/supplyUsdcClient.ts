'use client'

import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from '@/lib/firebase'
import { useSupplyUsdcSheet } from '@/store/useSupplyUsdcSheet'
import { useVaultStore } from '@/store/vault'
import { useDeskChromeStore } from '@/store/deskChrome'
import { buildUsdcSupplySolanaPayUrl, isMobileSolanaClient } from './solanaPayUrl'

function functionsUsCentral() {
  return getFunctions(getFirebaseApp(), 'us-central1')
}

export type CreateUsdcSupplyResult = {
  supplyId: string
  reference: string
  solanaPayUrl: string
  treasury: string
  mint: string
}

export async function createUsdcSupplyRequest(): Promise<CreateUsdcSupplyResult> {
  const fn = httpsCallable(functionsUsCentral(), 'vault_createUsdcSupply')
  const res = await fn({})
  return res.data as CreateUsdcSupplyResult
}

export type CheckUsdcSupplyResult = {
  status: 'pending' | 'confirmed' | 'not_found'
  amountUsdc?: number
  sender?: string
  signature?: string
}

export async function checkUsdcSupplyRequest(supplyId: string): Promise<CheckUsdcSupplyResult> {
  const fn = httpsCallable(functionsUsCentral(), 'vault_checkUsdcSupply')
  const res = await fn({ supplyId })
  return res.data as CheckUsdcSupplyResult
}

/**
 * Earn "Supply USDC" / "Supply more": create Solana Pay request, open Phantom on
 * mobile or QR sheet on desktop, mark Earn pending.
 */
export async function startSupplyUsdcWithPhantom(): Promise<void> {
  useDeskChromeStore.getState().setMode('earn')

  const created = await createUsdcSupplyRequest()
  const url = created.solanaPayUrl || buildUsdcSupplySolanaPayUrl(created.reference)

  useVaultStore.getState().setPendingSupply({
    id: created.supplyId,
    reference: created.reference,
    createdAtMs: Date.now(),
  })

  if (isMobileSolanaClient()) {
    window.location.href = url
    return
  }

  useSupplyUsdcSheet.getState().openWith({
    solanaPayUrl: url,
    reference: created.reference,
    supplyId: created.supplyId,
  })
}

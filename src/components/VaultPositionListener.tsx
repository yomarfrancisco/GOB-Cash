'use client'

import { useEffect } from 'react'
import { subscribeVaultPosition } from '@/lib/vault/subscribeVaultPosition'

/** Sync Earn vault position from Firestore into the client store. */
export default function VaultPositionListener() {
  useEffect(() => subscribeVaultPosition(), [])
  return null
}

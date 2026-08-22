'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useBankingDetailsSheet } from '@/store/useBankingDetailsSheet'
import { useWhatsAppClaimStore } from '@/store/useWhatsAppClaim'
import { parseWhatsAppClaimToken } from '@/lib/whatsappClaim'
import WhatsAppClaimAmaSheet from './WhatsAppClaimAmaSheet'

export default function WhatsAppClaimBootstrap() {
  const pathname = usePathname()
  const router = useRouter()
  const { open: openBankingDetails } = useBankingDetailsSheet()
  const { isActive, start } = useWhatsAppClaimStore()

  useEffect(() => {
    const match = pathname?.match(/^\/claim\/([^/?#]+)$/)
    if (!match) return

    const token = decodeURIComponent(match[1])
    const parsed = parseWhatsAppClaimToken(token)
    if (!parsed) {
      router.replace('/')
      return
    }

    start({ amountZAR: parsed.amountZAR, token, nonce: parsed.nonce })
    openBankingDetails('withdraw', null, parsed.amountZAR)
  }, [pathname, router, start, openBankingDetails])

  if (!isActive) return <WhatsAppClaimAmaSheet />

  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9990,
          background: 'transparent',
        }}
        onClick={() => useWhatsAppClaimStore.getState().exitToHome()}
      />
      <WhatsAppClaimAmaSheet />
    </>
  )
}

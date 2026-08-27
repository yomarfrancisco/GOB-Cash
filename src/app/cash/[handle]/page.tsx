'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

/** Native-camera scans of an agent QR land here, then open the Cash keypad on home. */
export default function AgentCashQrLandingPage() {
  const params = useParams<{ handle: string }>()
  const router = useRouter()

  useEffect(() => {
    const handle = typeof params.handle === 'string' ? params.handle : ''
    router.replace(`/?cash=${encodeURIComponent(handle)}`)
  }, [params.handle, router])

  return null
}

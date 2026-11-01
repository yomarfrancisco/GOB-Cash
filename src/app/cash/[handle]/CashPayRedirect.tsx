'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

export default function CashPayRedirect({ handle }: { handle: string }) {
  const router = useRouter()
  const { authReady } = useAuthStore()

  useEffect(() => {
    if (!authReady || !handle) return
    router.replace(`/?cash=${encodeURIComponent(handle)}`)
  }, [authReady, handle, router])

  return null
}

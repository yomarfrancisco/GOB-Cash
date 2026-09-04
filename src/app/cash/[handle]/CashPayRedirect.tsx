'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

export default function CashPayRedirect({ handle }: { handle: string }) {
  const router = useRouter()
  const { isAuthed, authReady } = useAuthStore()

  useEffect(() => {
    if (!authReady || !handle) return
    const q = `cash=${encodeURIComponent(handle)}`
    router.replace(isAuthed ? `/profile?${q}` : `/?${q}`)
  }, [authReady, isAuthed, handle, router])

  return null
}

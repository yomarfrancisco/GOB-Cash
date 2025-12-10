'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Convenience route: /ama redirects to /profile/ama
export default function AmaPage() {
  const router = useRouter()
  
  useEffect(() => {
    router.replace('/profile/ama')
  }, [router])

  return null
}


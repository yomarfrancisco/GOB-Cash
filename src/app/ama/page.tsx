'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Legacy /ama convenience route — stay on Home. */
export default function AmaPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/')
  }, [router])

  return null
}

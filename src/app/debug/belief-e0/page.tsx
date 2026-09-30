'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Legacy debug entry — redirect to the real desk E0 surface. */
export default function BeliefE0RedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/desk/e0')
  }, [router])
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <p>Redirecting to the protected desk E0 preview…</p>
    </main>
  )
}

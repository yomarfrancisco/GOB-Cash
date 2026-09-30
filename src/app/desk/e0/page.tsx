'use client'

import E0DeskThread from '@/components/belief/E0DeskThread'
import { E0_ISOLATION } from '@/lib/belief/e0Fixture'

const E0_ENABLED = process.env.NEXT_PUBLIC_ENABLE_BELIEF_E0 === 'true'

export default function DeskE0Page() {
  if (!E0_ENABLED) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
        <h1>Not found</h1>
        <p>E0 preview is disabled. Set NEXT_PUBLIC_ENABLE_BELIEF_E0=true on this deployment.</p>
        <pre style={{ fontSize: 12, opacity: 0.7 }}>{JSON.stringify(E0_ISOLATION, null, 2)}</pre>
      </main>
    )
  }

  return <E0DeskThread />
}

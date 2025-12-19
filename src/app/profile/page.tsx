import { Suspense } from 'react'
import ProfileClient from './ProfileClient'

// Force dynamic rendering to prevent prerender/export issues with useSearchParams()
export const dynamic = 'force-dynamic'

export default function ProfilePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProfileClient />
    </Suspense>
  )
}

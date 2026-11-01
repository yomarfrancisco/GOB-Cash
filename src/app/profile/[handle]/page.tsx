import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Quarantined: public profile routes never render — stay on Home. */
export default function ProfileHandlePage() {
  redirect('/')
}

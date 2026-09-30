import { notFound } from 'next/navigation'
import E0DeskGate from '@/components/belief/E0DeskGate'

/**
 * Production-review E0 desk.
 * Existence is gated by server-only BELIEF_E0_PRODUCTION_REVIEW.
 * Operator UID is enforced client-side via Firebase Auth + server API verifyIdToken.
 */
export default function DeskE0Page() {
  if (process.env.BELIEF_E0_PRODUCTION_REVIEW !== 'true') {
    notFound()
  }

  return <E0DeskGate />
}

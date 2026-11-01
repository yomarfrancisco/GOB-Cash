import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Quarantined: profile never renders — everything stays on Home. */
export default function ProfilePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const params = new URLSearchParams()
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === 'string') params.set(key, value)
      else if (Array.isArray(value) && value[0]) params.set(key, value[0])
    }
  }
  if (params.get('activity') === '1') {
    params.delete('activity')
    params.set('desk', '1')
  }
  const q = params.toString()
  redirect(q ? `/?${q}` : '/')
}

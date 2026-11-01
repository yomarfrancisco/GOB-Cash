import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Quarantine: /profile and /profile/* never render.
 * Everything lands on Home; activity deep-links open the routing desk.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname !== '/profile' && !pathname.startsWith('/profile/')) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/'
  if (url.searchParams.get('activity') === '1') {
    url.searchParams.delete('activity')
    url.searchParams.set('desk', '1')
  }
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/profile', '/profile/:path*'],
}

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Version marker - this will be set at build time by Vercel
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_VERSION || 'unknown'

export async function GET() {
  return NextResponse.json({
    version: APP_VERSION,
    commit: APP_VERSION,
    commitShort: APP_VERSION.substring(0, 7),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  })
}


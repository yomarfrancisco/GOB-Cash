import { NextResponse } from 'next/server'

export const runtime = 'edge'

// Version marker - updated at build time
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_VERSION || 'unknown'

export async function GET() {
  return NextResponse.json({ 
    ok: true,
    version: APP_VERSION,
    commit: APP_VERSION,
    timestamp: new Date().toISOString()
  })
}


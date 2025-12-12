/**
 * API route to get user's country from IP (optional, for phone resolution)
 * 
 * Returns ISO2 country code or null if unavailable.
 */

import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Stub for now - can integrate with Vercel's geolocation or external service
    // For now, return null to indicate unavailable
    return NextResponse.json({ country: null })
  } catch (error) {
    return NextResponse.json({ country: null })
  }
}


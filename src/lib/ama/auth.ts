/**
 * Ama Auth Utilities
 * Shared helpers for extracting and validating Firebase ID tokens
 */

import type { NextRequest } from 'next/server'

/**
 * Extract Bearer token from request (handles header casing variations)
 * Checks: authorization, Authorization, AUTHORIZATION headers
 * Falls back to body.authToken or body.token if present
 */
export function extractBearerToken(req: NextRequest, body?: any): string | null {
  // NextRequest headers can be weirdly normalized depending on runtime.
  const h = req.headers
  const authHeader =
    h.get('authorization') ||
    h.get('Authorization') ||
    h.get('AUTHORIZATION')

  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim()
  }

  // Backward-compatible body fallback (if you previously supported it)
  const bodyToken = body?.authToken || body?.token
  if (typeof bodyToken === 'string' && bodyToken.length > 20) {
    return bodyToken
  }

  return null
}

/**
 * Get diagnostic info about token presence (for error messages)
 * Never logs token contents
 */
export function getTokenDiagnostics(req: NextRequest): {
  hasAuthorizationHeader: boolean
  hasauthorizationHeader: boolean
  hasAUTHORIZATIONHeader: boolean
} {
  const h = req.headers
  return {
    hasAuthorizationHeader: Boolean(h.get('Authorization')),
    hasauthorizationHeader: Boolean(h.get('authorization')),
    hasAUTHORIZATIONHeader: Boolean(h.get('AUTHORIZATION')),
  }
}


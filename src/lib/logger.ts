/**
 * Development-only logger utility
 * Logs are disabled in production to reduce console noise and improve performance
 */

/**
 * Log only in development mode
 */
export function devLog(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args)
  }
}

/**
 * Warn only in development mode
 */
export function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(...args)
  }
}

/**
 * Debug log (alias for devLog, for clarity)
 */
export function devDebug(...args: unknown[]): void {
  devLog(...args)
}

/**
 * Error logs - always enabled (use console.error directly for real errors)
 * This is just a convenience wrapper if needed
 */
export function prodError(...args: unknown[]): void {
  console.error(...args)
}


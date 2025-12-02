/**
 * Demo Animation Configuration
 * Controls the intensity of demo animations for pre-sign-in vs post-sign-in experience
 */

export type DemoIntensity = 'lively' | 'calm'

/**
 * Get demo configuration based on auth state
 */
export function getDemoConfig(isAuthed: boolean): DemoIntensity {
  return isAuthed ? 'calm' : 'lively'
}

/**
 * Demo Notification Engine Configuration
 */
export const DEMO_NOTIFICATION_CONFIG = {
  lively: {
    INITIAL_DELAY_MS: 8000,           // 8s - faster start
    INTERVAL_MIN_MS: 8000,            // 8s - minimum between notifications
    INTERVAL_MAX_MS: 15000,           // 15s - maximum between notifications
    RATE_LIMIT_MS: 30000,             // 30s - rate limit window
    MAX_NOTIFICATIONS_PER_WINDOW: 2,  // Allow 2 per window for liveliness
  },
  calm: {
    INITIAL_DELAY_MS: 20000,          // 20s - current value
    INTERVAL_MIN_MS: 60000,           // 60s - current minimum
    INTERVAL_MAX_MS: 120000,          // 120s - current maximum
    RATE_LIMIT_MS: 120000,            // 120s - current value
    MAX_NOTIFICATIONS_PER_WINDOW: 1,  // Current value
  },
}

/**
 * AI Action Cycle Configuration
 */
export const AI_ACTION_CONFIG = {
  lively: {
    INTERVAL_MIN_MS: 18000,           // 18s - minimum between actions
    INTERVAL_MAX_MS: 30000,           // 30s - maximum between actions
  },
  calm: {
    INTERVAL_MIN_MS: 90000,           // 90s - current value
    INTERVAL_MAX_MS: 90000,           // 90s - current value (fixed, not random)
  },
}

/**
 * Random Card Flips Configuration
 */
export const RANDOM_FLIP_CONFIG = {
  lively: {
    QUIET_MS: 20000,                  // 20s - shorter quiet period
    MIN_MS: 30000,                    // 30s - minimum interval between bursts
    MAX_MS: 90000,                    // 90s - maximum interval between bursts
    MIN_COUNT: 1,
    MAX_COUNT: 2,                     // Allow 2 flips per burst for liveliness
    BURST_STEP_MS: 400,               // 400ms - faster burst
  },
  calm: {
    QUIET_MS: 60000,                  // 60s - current value
    MIN_MS: 120000,                   // 120s (2 min) - current value
    MAX_MS: 360000,                   // 360s (6 min) - current value
    MIN_COUNT: 1,
    MAX_COUNT: 1,                     // Current value
    BURST_STEP_MS: 700,               // 700ms - current value
  },
}


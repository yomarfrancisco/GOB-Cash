# Card & Notification Animation System - Audit Report

## PHASE 1: Current Behavior Audit

### 1. Components & Code Paths

#### A. Demo Notification Engine
**File:** `src/lib/demo/demoNotificationEngine.ts`

**Purpose:** Generates demo notifications (AI trades, co-op events, member payments) that appear in the notification feed.

**Initialization:**
- **Location:** `src/app/page.tsx` lines 257-287
- **Trigger:** `useEffect` that runs when `pushNotification` or `isAuthed` changes
- **Condition:** Only starts if `NEXT_PUBLIC_DEMO_MODE === 'true'` AND `isAuthed === false`
- **Function:** `startDemoNotificationEngine(pushNotification, options)`

**Stopping:**
- **Location 1:** `src/app/page.tsx` line 262 - stops when `isAuthed === true`
- **Location 2:** `src/store/auth.ts` line 53 - stops in `completeAuth()` function
- **Function:** `stopDemoNotificationEngine()`

#### B. AI Action Cycle (Card Animations)
**File:** `src/lib/animations/useAiActionCycle.ts`

**Purpose:** Automatically flips cards and updates balances to simulate AI trading activity.

**Initialization:**
- **Location:** `src/app/page.tsx` lines 242-253
- **Trigger:** `useAiActionCycle(cardStackRef, balanceUpdaters, !isAuthed)`
- **Condition:** Enabled when `!isAuthed` (pre-sign-in only)

**Stopping:**
- Automatically stops when `enabled` prop becomes `false` (when `isAuthed === true`)

#### C. Random Card Flips
**File:** `src/lib/animations/useRandomCardFlips.ts`

**Purpose:** Randomly cycles through cards in bursts to add visual interest.

**Initialization:**
- **Location:** Used in `CardStack` component (not directly in `page.tsx`)
- **Condition:** Only enabled when:
  - `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS === '1'`
  - `NEXT_PUBLIC_DEMO_MODE === 'true'`
  - `!isAuthed`

**Stopping:**
- Automatically stops when `shouldEnable` becomes `false` (when `isAuthed === true`)

---

### 2. Current Timing Configuration

#### A. Demo Notification Engine

**Current Values (SLOW - after tuning down):**
```typescript
const INITIAL_DELAY_MS = 20000        // 20s - first notification delay
const RATE_LIMIT_MS = 120000          // 120s (2 min) - rate limit window
const MAX_NOTIFICATIONS_PER_WINDOW = 1 // Max 1 notification per window
const INTERVAL_MS = 60000 + Math.random() * 60000  // 60-120s between notifications
```

**Historical Values (from ANIMATION_FREQUENCY_CHANGES.md):**
- **Original:** 4-9 seconds between notifications
- **After first slowdown:** 8-18 seconds (doubled)
- **Current:** 60-120 seconds (much slower than documented!)

**Average Time Between Notifications:**
- **Current:** ~90 seconds (60-120s random)
- **Rate limit:** Max 1 notification per 120-second window

#### B. AI Action Cycle (Card Animations)

**Current Values:**
```typescript
const INTERVAL_MS = 90000  // 90s - time between AI card animations
```

**Historical Values:**
- **Original:** 14 seconds
- **After first slowdown:** 28 seconds (doubled)
- **Current:** 90 seconds (much slower than documented!)

**Average Time Between Card Animations:**
- **Current:** 90 seconds

#### C. Random Card Flips

**Current Values:**
```typescript
const QUIET_MS = 60000              // 60s - initial quiet period (doubled from 30s)
const MIN_MS = 120000               // 2 min - minimum interval between bursts (doubled from 3s)
const MAX_MS = 360000               // 6 min - maximum interval between bursts (doubled from 180s)
const MIN_COUNT = 1                 // Never multiple flips
const MAX_COUNT = 1                 // Never multiple flips
const BURST_STEP_MS = 700           // 700ms between flips in a burst (doubled from 350ms)
```

**Average Time Between Bursts:**
- **Current:** ~4 minutes (random between 2-6 minutes)
- **Initial quiet period:** 60 seconds before first burst

---

### 3. Pre vs Post-Sign-In Behavior

#### Pre-Sign-In (`isAuthed === false`)

**Demo Notification Engine:**
- ✅ **Running:** Starts after 20s delay
- ✅ **Frequency:** One notification every 60-120 seconds
- ✅ **Rate limit:** Max 1 per 120s window

**AI Action Cycle:**
- ✅ **Running:** Enabled via `!isAuthed` prop
- ✅ **Frequency:** Card flip + balance update every 90 seconds

**Random Card Flips:**
- ✅ **Running:** Enabled when demo mode is on
- ✅ **Frequency:** Burst every 2-6 minutes (after 60s quiet period)

**Result:** All three systems are active, but at very slow intervals.

#### Post-Sign-In (`isAuthed === true`)

**Demo Notification Engine:**
- ❌ **Stopped:** `stopDemoNotificationEngine()` called in:
  - `src/app/page.tsx` line 262 (useEffect cleanup)
  - `src/store/auth.ts` line 53 (`completeAuth()`)
- ❌ **Notifications cleared:** `clearNotifications()` called in `completeAuth()`

**AI Action Cycle:**
- ❌ **Stopped:** `enabled={!isAuthed}` becomes `false`

**Random Card Flips:**
- ❌ **Stopped:** `shouldEnable` becomes `false` when `isAuthed === true`

**Result:** All demo animations stop immediately on sign-in.

---

### 4. Configuration Knobs (Current Values)

#### Demo Notification Engine (`src/lib/demo/demoNotificationEngine.ts`)

| Constant | Current Value | Purpose |
|----------|--------------|---------|
| `INITIAL_DELAY_MS` | 20000 (20s) | Delay before first notification |
| `RATE_LIMIT_MS` | 120000 (120s) | Rate limit window duration |
| `MAX_NOTIFICATIONS_PER_WINDOW` | 1 | Max notifications per window |
| `INTERVAL_MS` | 60000-120000 (60-120s) | Random interval between notifications |

**Note:** The interval is hardcoded in `scheduleNext()` function (line 255), not a constant.

#### AI Action Cycle (`src/lib/animations/useAiActionCycle.ts`)

| Constant | Current Value | Purpose |
|----------|--------------|---------|
| `INTERVAL_MS` | 90000 (90s) | Time between card animations |

#### Random Card Flips (`src/lib/animations/useRandomCardFlips.ts`)

| Constant | Current Value | Purpose | Env Override |
|----------|--------------|---------|--------------|
| `QUIET_MS` | 60000 (60s) | Initial quiet period | `NEXT_PUBLIC_RANDOM_FLIP_QUIET_MS` |
| `MIN_MS` | 120000 (2 min) | Min interval between bursts | `NEXT_PUBLIC_RANDOM_FLIP_MIN_MS` |
| `MAX_MS` | 360000 (6 min) | Max interval between bursts | `NEXT_PUBLIC_RANDOM_FLIP_MAX_MS` |
| `MIN_COUNT` | 1 | Min flips per burst | `NEXT_PUBLIC_RANDOM_FLIP_MIN_COUNT` |
| `MAX_COUNT` | 1 | Max flips per burst | `NEXT_PUBLIC_RANDOM_FLIP_MAX_COUNT` |
| `BURST_STEP_MS` | 700 (0.7s) | Delay between flips in burst | `NEXT_PUBLIC_RANDOM_FLIP_BURST_STEP_MS` |

**Environment Variable Gate:**
- `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS` must be `'1'` to enable

---

### 5. Key Findings

1. **Current behavior is MUCH slower than documented:**
   - Demo notifications: Documented as 8-18s, actually 60-120s
   - AI actions: Documented as 28s, actually 90s
   - This suggests additional tuning happened after the documented changes

2. **All systems are properly gated:**
   - All stop when `isAuthed === true`
   - Demo notification engine has explicit stop calls
   - AI action cycle and random flips stop via `enabled` prop

3. **No variant-based gating:**
   - None of these systems check `variant === 'landing'`
   - They only check `isAuthed` and demo mode flags

4. **Legacy slowdown code:**
   - The `ANIMATION_FREQUENCY_CHANGES.md` shows values were doubled
   - But current code shows even slower values
   - We can reverse this by halving (or more) the current intervals

---

## PHASE 2: Proposed Configuration

### Goal
- **Pre-sign-in:** Lively, demo-like, frequent activity (not overwhelming)
- **Post-sign-in:** Calm, demo stopped or drastically reduced

### Proposed Constants

Create a new config file: `src/lib/demo/demoConfig.ts`

```typescript
/**
 * Demo Animation Configuration
 * Controls the intensity of demo animations for pre-sign-in experience
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
    RATE_LIMIT_MS: 30000,              // 30s - rate limit window
    MAX_NOTIFICATIONS_PER_WINDOW: 2,   // Allow 2 per window for liveliness
  },
  calm: {
    INITIAL_DELAY_MS: 60000,          // 60s - slow start
    INTERVAL_MIN_MS: 120000,          // 120s - very slow
    INTERVAL_MAX_MS: 180000,          // 180s - very slow
    RATE_LIMIT_MS: 300000,            // 300s - large window
    MAX_NOTIFICATIONS_PER_WINDOW: 1,   // Max 1 per window
  },
}

/**
 * AI Action Cycle Configuration
 */
export const AI_ACTION_CONFIG = {
  lively: {
    INTERVAL_MS: 18000,                // 18s - frequent card animations
  },
  calm: {
    INTERVAL_MS: 120000,               // 120s - very slow
  },
}

/**
 * Random Card Flips Configuration
 */
export const RANDOM_FLIP_CONFIG = {
  lively: {
    QUIET_MS: 20000,                   // 20s - shorter quiet period
    MIN_MS: 30000,                     // 30s - frequent bursts
    MAX_MS: 90000,                     // 90s - frequent bursts
    MIN_COUNT: 1,
    MAX_COUNT: 2,                      // Allow 2 flips per burst
    BURST_STEP_MS: 400,                // 400ms - faster burst
  },
  calm: {
    QUIET_MS: 120000,                  // 120s - long quiet
    MIN_MS: 300000,                    // 5 min - very slow
    MAX_MS: 600000,                    // 10 min - very slow
    MIN_COUNT: 1,
    MAX_COUNT: 1,
    BURST_STEP_MS: 800,                // 800ms - slower burst
  },
}
```

### Implementation Plan

#### 1. Update Demo Notification Engine

**File:** `src/lib/demo/demoNotificationEngine.ts`

**Changes:**
- Import `getDemoConfig` and `DEMO_NOTIFICATION_CONFIG`
- Replace hardcoded constants with config-based values
- Accept `isAuthed` parameter or read from store

**Patch:**
```typescript
import { getDemoConfig, DEMO_NOTIFICATION_CONFIG } from './demoConfig'

// In startDemoNotificationEngine function:
export function startDemoNotificationEngine(
  pushNotification: (notification: NotificationInput) => void,
  options: DemoEngineOptions = {},
  isAuthed: boolean = false  // Add parameter
): void {
  const intensity = getDemoConfig(isAuthed)
  const config = DEMO_NOTIFICATION_CONFIG[intensity]
  
  // Replace hardcoded values:
  // INITIAL_DELAY_MS → config.INITIAL_DELAY_MS
  // RATE_LIMIT_MS → config.RATE_LIMIT_MS
  // MAX_NOTIFICATIONS_PER_WINDOW → config.MAX_NOTIFICATIONS_PER_WINDOW
  // INTERVAL_MS → config.INTERVAL_MIN_MS + Math.random() * (config.INTERVAL_MAX_MS - config.INTERVAL_MIN_MS)
}
```

#### 2. Update AI Action Cycle

**File:** `src/lib/animations/useAiActionCycle.ts`

**Changes:**
- Import config and use intensity-based interval
- Accept `isAuthed` or read from store

**Patch:**
```typescript
import { getDemoConfig, AI_ACTION_CONFIG } from '@/lib/demo/demoConfig'

// In useAiActionCycle function:
export function useAiActionCycle(
  cardStackRef: React.RefObject<CardStackHandle | null>,
  balanceUpdaters: BalanceUpdaters,
  enabled: boolean = true
) {
  const isAuthed = useAuthStore((state) => state.isAuthed)
  const intensity = getDemoConfig(isAuthed)
  const INTERVAL_MS = AI_ACTION_CONFIG[intensity].INTERVAL_MS
  
  // Use INTERVAL_MS in scheduleNext()
}
```

#### 3. Update Random Card Flips

**File:** `src/lib/animations/useRandomCardFlips.ts`

**Changes:**
- Import config and use intensity-based values
- Already reads `isAuthed` from store

**Patch:**
```typescript
import { getDemoConfig, RANDOM_FLIP_CONFIG } from '@/lib/demo/demoConfig'

export function useRandomCardFlips(...) {
  const isAuthed = useAuthStore((state) => state.isAuthed)
  const intensity = getDemoConfig(isAuthed)
  const config = RANDOM_FLIP_CONFIG[intensity]
  
  // Replace constants:
  // QUIET_MS → config.QUIET_MS
  // MIN_MS → config.MIN_MS
  // MAX_MS → config.MAX_MS
  // MIN_COUNT → config.MIN_COUNT
  // MAX_COUNT → config.MAX_COUNT
  // BURST_STEP_MS → config.BURST_STEP_MS
}
```

#### 4. Update page.tsx

**File:** `src/app/page.tsx`

**Changes:**
- Pass `isAuthed` to `startDemoNotificationEngine`

**Patch:**
```typescript
startDemoNotificationEngine(pushNotification, {
  onMapPan,
  onCardAnimation,
}, isAuthed)  // Pass isAuthed parameter
```

---

### Summary of Proposed Values

#### Pre-Sign-In (Lively)
- **Notifications:** Every 8-15 seconds (vs current 60-120s)
- **AI Actions:** Every 18 seconds (vs current 90s)
- **Random Flips:** Burst every 30-90 seconds (vs current 2-6 min)

#### Post-Sign-In (Calm)
- **Notifications:** Every 120-180 seconds (or stopped)
- **AI Actions:** Every 120 seconds (or stopped)
- **Random Flips:** Burst every 5-10 minutes (or stopped)

**Note:** For post-sign-in, we could also completely disable by checking `isAuthed` before starting engines, which is already the case. The "calm" config is a fallback if we want to keep some minimal activity.

---

## Legacy Code Utilization

The `ANIMATION_FREQUENCY_CHANGES.md` shows that values were **doubled** to slow things down. To speed things up, we can:

1. **Halve the current values** for "lively" mode
2. **Use the documented "before" values** as a reference for "lively" mode
3. **Keep current values** for "calm" mode (or make them even slower)

The legacy code structure is perfect for this - we just need to make the constants configurable based on `isAuthed` state.


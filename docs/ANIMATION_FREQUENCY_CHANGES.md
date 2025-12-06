# Animation Frequency Changes - Before/After

## Summary
Doubled all animation frequency intervals (not just durations) for pre-signed-in users to create a slower, more relaxed demo experience.

## Changes Made

### 1. AI Action Cycle (`src/lib/animations/useAiActionCycle.ts`)

**Before:**
```typescript
const INTERVAL_MS = 14000 // time between actions
```

**After:**
```typescript
const INTERVAL_MS = 28000 // time between actions (doubled from 14000 for slower pre-signin animations)
```

**Impact:** AI card animations now happen every 28 seconds instead of 14 seconds.

**Pre-signin only:** ✅ Yes - gated by `!isAuthed` in `src/app/page.tsx:251`

---

### 2. Random Card Flips (`src/lib/animations/useRandomCardFlips.ts`)

**Before:**
```typescript
const QUIET_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_QUIET_MS ?? 30000)
const MIN_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MIN_MS ?? 3000)
const MAX_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MAX_MS ?? 180000)
const BURST_STEP_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_BURST_STEP_MS ?? 350)
```

**After:**
```typescript
const QUIET_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_QUIET_MS ?? 60000) // doubled from 30000
const MIN_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MIN_MS ?? 6000) // doubled from 3000
const MAX_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_MAX_MS ?? 360000) // doubled from 180000
const BURST_STEP_MS = Number(process.env.NEXT_PUBLIC_RANDOM_FLIP_BURST_STEP_MS ?? 700) // doubled from 350
```

**Impact:**
- Initial quiet period: 30s → 60s
- Inter-burst interval: 3-180s → 6-360s
- Burst step delay: 350ms → 700ms

**Pre-signin only:** ✅ Yes - only enabled when `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS === '1'` (demo mode)

---

### 3. Demo Notification Engine (`src/lib/demo/demoNotificationEngine.ts`)

**Before:**
```typescript
const RATE_LIMIT_MS = 20000 // 20 seconds
// ...
// Random interval between 4-9 seconds
const delay = 4000 + Math.random() * 5000
// ...
// Start the first event after a short delay (2 seconds)
setTimeout(() => {
  scheduleNext()
}, 2000)
```

**After:**
```typescript
const RATE_LIMIT_MS = 40000 // 40 seconds (doubled from 20000 for slower pre-signin animations)
// ...
// Random interval between 8-18 seconds (doubled from 4-9 for slower pre-signin animations)
const delay = 8000 + Math.random() * 10000
// ...
// Start the first event after a short delay (4 seconds, doubled from 2)
setTimeout(() => {
  scheduleNext()
}, 4000)
```

**Impact:**
- Rate limit window: 20s → 40s
- Notification interval: 4-9s → 8-18s
- Initial delay: 2s → 4s

**Pre-signin only:** ✅ Yes - only runs when `NEXT_PUBLIC_DEMO_MODE === 'true'` (demo mode)

---

## Environment Variables (Vercel)

If these are set in Vercel, they should be doubled:

- `NEXT_PUBLIC_RANDOM_FLIP_MIN_MS` → 2× current value
- `NEXT_PUBLIC_RANDOM_FLIP_MAX_MS` → 2× current value
- `NEXT_PUBLIC_RANDOM_FLIP_BURST_STEP_MS` → 2× current value
- `NEXT_PUBLIC_RANDOM_FLIP_QUIET_MS` → 2× current value (if set)

**Note:** `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS` should remain `'1'` (no change)

---

## Verification: Pre-Signin Only

✅ **AI Action Cycle:** Gated by `!isAuthed` in `src/app/page.tsx:251`
✅ **Random Card Flips:** Only enabled when `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS === '1'` (demo mode)
✅ **Demo Notifications:** Only runs when `NEXT_PUBLIC_DEMO_MODE === 'true'` (demo mode)

**Result:** All slower frequencies apply ONLY to pre-signed-in demo experience. Real user sessions are unaffected.

---

## Combined Effect

With both duration × 2 and frequency × 2:
- **Animation speed:** 2× slower (durations doubled)
- **Animation frequency:** 2× less often (intervals doubled)
- **Visual result:** Much more relaxed, slower-paced demo experience


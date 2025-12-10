# GOB-Cash Project Onboarding Prompt

Use this prompt at the start of a new chat session to onboard a Cursor agent to this project.

---

## Project Overview

**GOB-Cash** (GoBankless Cash-Card UI) is a mobile-first Next.js 14 application built with TypeScript, React 18, and vanilla CSS (no Tailwind). It's a financial dashboard application that showcases a card-based wallet interface with Mapbox integration, demo animations, and a sophisticated notification system.

### Key Technologies
- **Framework:** Next.js 14.2.5 (App Router)
- **Language:** TypeScript
- **State Management:** Zustand
- **Maps:** Mapbox GL JS 3.16.0
- **Styling:** Vanilla CSS modules (no Tailwind)
- **Package Manager:** pnpm

### Project Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Main landing/dashboard page
│   ├── profile/           # User profile page
│   ├── transactions/      # Transaction history
│   ├── activity/          # Activity feed
│   └── inbox/             # Financial inbox
├── components/            # React components
│   ├── CardStack.tsx      # Main card deck component
│   ├── MapboxMap.tsx      # Mapbox integration
│   ├── TopGlassBar.tsx    # Top navigation bar
│   └── BottomGlassBar.tsx # Bottom navigation bar
├── lib/                   # Utility libraries
│   ├── animations/        # Animation hooks and logic
│   ├── demo/              # Demo mode configuration
│   ├── portfolio/         # Portfolio calculation logic
│   └── notifications/     # Notification formatting
├── store/                 # Zustand stores
│   ├── auth.ts           # Authentication state
│   ├── notifications.ts  # Notification state
│   └── portfolio.ts      # Portfolio state
└── state/                 # Additional state management
    ├── walletAlloc.tsx   # Wallet allocation state
    └── aiFabHighlight.ts # AI FAB highlight state
```

---

## Current State & Recent Work

### Branch: `feature/isolate-user-marker`
**Current Commit:** `1a80111` - "fix(demo): preserve quiet period in AI action cycle"

### Recent Animation System Changes

The project has undergone significant animation timing refinements for the pre-sign-in demo experience:

1. **Lively Demo Configuration** (`ba3a9e4`):
   - Created `src/lib/demo/demoConfig.ts` with parameterized "lively" vs "calm" configurations
   - Pre-sign-in uses "lively" config (faster intervals)
   - Post-sign-in uses "calm" config (slower intervals)

2. **AI Action Cycle Timing** (`1a80111`):
   - **Current behavior:** Waits 5 seconds, then starts normal schedule (which waits 18-30s for first action)
   - **First action fires at:** 5s + 18-30s = 23-35s (preserves quiet period)
   - **Subsequent actions:** Every 18-30s (lively mode)
   - **File:** `src/lib/animations/useAiActionCycle.ts`

3. **Random Card Flips**:
   - **Current behavior:** No special initial burst (reverted)
   - **Normal behavior:** Quiet period (20s in lively mode), then bursts every 30-90s
   - **File:** `src/lib/animations/useRandomCardFlips.ts`
   - **Wired up in:** `src/app/page.tsx` line 257

4. **Demo Notification Engine**:
   - **Pre-sign-in:** Notifications every 8-15s (lively mode)
   - **Post-sign-in:** Notifications every 60-120s (calm mode)
   - **File:** `src/lib/demo/demoNotificationEngine.ts`

---

## Animation System Architecture

### Three Animation Systems

#### 1. AI Action Cycle (`useAiActionCycle`)
**Purpose:** Simulates AI trading activity with full card flip sequence and balance updates.

**Location:** `src/lib/animations/useAiActionCycle.ts`

**Behavior:**
- Flips to target card (ETH or PEPE) → updates balance → flips back to Cash → updates cash balance
- Creates credit/debit effect (one card changes, then Cash balances it)
- Full sequence takes ~3-4 seconds (flip animations + slot counter animations)

**Timing (Lively Mode):**
- First action: 5s delay + 18-30s interval = 23-35s after page load
- Subsequent actions: Every 18-30s (random)

**Configuration:** `src/lib/demo/demoConfig.ts` → `AI_ACTION_CONFIG.lively`

**Key Constants:**
- `FLIP_MS = 300` (card flip duration)
- `CASH_UPDATE_DELAY_MS = 900` (delay before cash update after flip back)
- `SLOT_MS = 1400` (slot counter animation duration)

**Gating:**
- Only runs when `!isAuthed` (pre-sign-in)
- Stops immediately when `isAuthed === true`

#### 2. Random Card Flips (`useRandomCardFlips`)
**Purpose:** Randomly cycles through cards in bursts for visual interest.

**Location:** `src/lib/animations/useRandomCardFlips.ts`

**Behavior:**
- Quiet period → random bursts of 1-2 card flips
- Each flip spaced by `BURST_STEP_MS` (400ms in lively mode)

**Timing (Lively Mode):**
- Quiet period: 20s
- Burst interval: 30-90s (random)
- Flips per burst: 1-2 (random)

**Configuration:** `src/lib/demo/demoConfig.ts` → `RANDOM_FLIP_CONFIG.lively`

**Environment Variable Gate:**
- Requires `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS === '1'`
- Also requires `NEXT_PUBLIC_DEMO_MODE === 'true'` AND `!isAuthed`

**Wired up in:** `src/app/page.tsx` line 257

#### 3. Demo Notification Engine
**Purpose:** Generates demo notifications (AI trades, co-op events, member payments).

**Location:** `src/lib/demo/demoNotificationEngine.ts`

**Behavior:**
- Generates notifications with map coordinates, amounts, and actors
- Triggers FAB highlights for important trades (>R150)
- Can trigger map panning and card animations (currently stubbed)

**Timing (Lively Mode):**
- Initial delay: 8s
- Interval: 8-15s (random)
- Rate limit: Max 2 per 30s window

**Configuration:** `src/lib/demo/demoConfig.ts` → `DEMO_NOTIFICATION_CONFIG.lively`

**Gating:**
- Only runs when `NEXT_PUBLIC_DEMO_MODE === 'true'` AND `!isAuthed`
- Stops in `src/store/auth.ts` → `completeAuth()` function

---

## Configuration System

### Centralized Config: `src/lib/demo/demoConfig.ts`

All animation timing is controlled by this file, which provides:
- `getDemoConfig(isAuthed)` → returns `'lively'` or `'calm'`
- `DEMO_NOTIFICATION_CONFIG` → notification timing
- `AI_ACTION_CONFIG` → AI action cycle timing
- `RANDOM_FLIP_CONFIG` → random card flip timing

**Key Principle:** Pre-sign-in uses "lively" config, post-sign-in uses "calm" config.

### Environment Variables

**Required for Demo Mode:**
- `NEXT_PUBLIC_DEMO_MODE='true'` - Enables demo mode
- `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS='1'` - Enables random card flips

**Optional Overrides (for calm mode):**
- `NEXT_PUBLIC_RANDOM_FLIP_QUIET_MS`
- `NEXT_PUBLIC_RANDOM_FLIP_MIN_MS`
- `NEXT_PUBLIC_RANDOM_FLIP_MAX_MS`
- `NEXT_PUBLIC_RANDOM_FLIP_MIN_COUNT`
- `NEXT_PUBLIC_RANDOM_FLIP_MAX_COUNT`
- `NEXT_PUBLIC_RANDOM_FLIP_BURST_STEP_MS`

**Debug:**
- `NEXT_PUBLIC_DEBUG_MAP='true'` - Enables debug logging

---

## State Management

### Zustand Stores

**Authentication (`src/store/auth.ts`):**
- `isAuthed: boolean` - Main auth state flag
- `completeAuth()` - Stops all demo animations and clears notifications
- Used throughout to gate demo behavior

**Notifications (`src/store/notifications.ts`):**
- `notifications: NotificationItem[]` - Array of notification items
- `pushNotification()` - Adds new notification
- `clearNotifications()` - Clears all notifications (called on auth)

**Portfolio (`src/store/portfolio.ts`):**
- `holdings` - Portfolio holdings (CASH, ETH, PEPE)
- `setHoldingsBulk()` - Atomic update of all holdings
- Used by AI action cycle for balance updates

**Wallet Allocation (`src/state/walletAlloc.tsx`):**
- Stores wallet balances in ZAR cents
- Used for slot counter animations
- Updated by AI action cycle

---

## Key Components

### CardStack (`src/components/CardStack.tsx`)
**Purpose:** Main card deck component that displays wallet cards.

**Key Features:**
- Exposes `CardStackHandle` ref with:
  - `cycleNext()` - Cycles to next card
  - `flipToCard(cardType, direction)` - Flips to specific card
- Handles touch/swipe gestures
- Manages card order and animation state
- Flash animations for balance changes

**Animation:** CSS transitions (300ms ease) for transform, opacity, box-shadow, width, height, left, top

### MapboxMap (`src/components/MapboxMap.tsx`)
**Purpose:** Mapbox GL JS integration for displaying locations and markers.

**Key Features:**
- SADC-wide view on load (pre-sign-in)
- User-centered view after sign-in
- Marker animations and highlights
- Avatar markers for members/agents

**Important:** Do not modify map behavior unless explicitly requested.

### Main Page (`src/app/page.tsx`)
**Purpose:** Main landing/dashboard page.

**Key Responsibilities:**
- Initializes all three animation systems
- Manages `cardStackRef` for card animations
- Gates animations based on `isAuthed` state
- Wires up demo notification engine

**Critical Code Sections:**
- Lines 242-253: `useAiActionCycle` hook
- Line 257: `useRandomCardFlips` hook
- Lines 255-287: Demo notification engine initialization

---

## Important Patterns & Conventions

### Animation Timing
- All timing values are in milliseconds
- Use constants from `demoConfig.ts` instead of hardcoding
- Pre-sign-in = "lively", post-sign-in = "calm"

### State Gating
- Always check `isAuthed` before running demo animations
- Always check `NEXT_PUBLIC_DEMO_MODE === 'true'` for demo features
- Stop animations immediately when `isAuthed === true`

### Ref Management
- Use `useRef` for timers and mutable state
- Always clear timers in cleanup functions
- Check refs before accessing (e.g., `cardStackRef.current`)

### Async/Await Patterns
- Animation sequences use `async/await` with `sleep()` helper
- Always check conditions before proceeding in async callbacks
- Use `isProcessingRef` to prevent overlapping actions

---

## Known Issues & Constraints

### Current State (Commit 1a80111)
- **AI Action Cycle:** First action fires at 23-35s (5s delay + 18-30s interval)
  - This preserves the quiet period but may not be the desired behavior
  - Previous attempts to fire at 5s caused continuous firing issues

### Important Constraints
- **Do NOT modify map behavior** unless explicitly requested
- **Do NOT change geolocation logic**
- **Keep changes scoped** to card/notification demo logic
- **Maintain backward compatibility** except for intensity tuning

### Debugging Tips
- Check browser console for `[AI_ACTION_CYCLE]` and `[RandomFlip]` logs
- Verify `NEXT_PUBLIC_DEMO_MODE` and `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS` are set
- Check `isAuthed` state in Zustand devtools
- Monitor timer cleanup in React DevTools

---

## Development Workflow

### Running Locally
```bash
pnpm install
pnpm dev  # Starts on port 5173
```

### Building
```bash
pnpm build
pnpm start  # Starts production server on port 4173
```

### Git Workflow
- **Current branch:** `feature/isolate-user-marker`
- **Baseline commit:** `beae98f` (known-good state)
- Always test builds before pushing
- Use descriptive commit messages

### Testing Animation Changes
1. Set `NEXT_PUBLIC_DEMO_MODE='true'` in `.env.local`
2. Set `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS='1'` in `.env.local`
3. Load page in browser (not authenticated)
4. Observe console logs for timing
5. Verify animations fire at expected intervals

---

## Documentation Files

- `ANIMATION_FREQUENCY_CHANGES.md` - History of animation timing changes
- `docs/card-notification-audit.md` - Complete audit of card/notification system
- `docs/production-map-implementation-guide.md` - Mapbox implementation details
- `docs/animations/card-flip.md` - Card flip animation documentation

---

## Next Steps for New Agent

When picking up this project:

1. **Read the current state:**
   - Review `src/lib/animations/useAiActionCycle.ts` (current commit 1a80111)
   - Review `src/lib/demo/demoConfig.ts` for configuration values
   - Review `src/app/page.tsx` for how systems are wired

2. **Understand the goal:**
   - User wants AI action cycle to start earlier (at ~5s)
   - But previous attempts caused continuous firing
   - Need to preserve quiet period while starting earlier

3. **Check for issues:**
   - Verify timers are properly cleared
   - Check for multiple `start()` calls
   - Ensure `useEffect` dependencies are correct

4. **Test thoroughly:**
   - Build must succeed
   - No linter errors
   - Verify timing in browser console
   - Check that animations stop on sign-in

---

## Key Files to Review

**Animation System:**
- `src/lib/animations/useAiActionCycle.ts` - AI action cycle (main focus)
- `src/lib/animations/useRandomCardFlips.ts` - Random card flips
- `src/lib/demo/demoNotificationEngine.ts` - Demo notifications
- `src/lib/demo/demoConfig.ts` - Configuration

**Integration:**
- `src/app/page.tsx` - Main page (wires up all systems)
- `src/store/auth.ts` - Auth state (gates animations)
- `src/components/CardStack.tsx` - Card component

**Documentation:**
- `ANIMATION_FREQUENCY_CHANGES.md` - History
- `docs/card-notification-audit.md` - System audit

---

This prompt should provide enough context for a new agent to understand the project structure, current state, and continue development effectively.


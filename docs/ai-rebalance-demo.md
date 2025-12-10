# AI Rebalance Demo

## Overview

The AI rebalance feature demonstrates autonomous wallet management by automatically rebalancing funds between cards (Cash, ETH, PEPE) based on health conditions and market conditions.

## How It Works

### Sequence Flow

When an AI action is triggered:

1. **Pause ambient flips** - Random card flips are paused during the sequence
2. **Flip to target card** - The card stack flips to show the target card (where funds are being moved to)
3. **Roll target amount** - The target card's balance animates (slot-machine style) from old value to new value
4. **Update allocation pill** - The percentage allocation updates for the target card
5. **Flip back to Cash** - The stack flips back to show the Cash card
6. **Roll Cash amount** - Cash balance animates to its new (compensating) value
7. **Update allocation pill** - Cash percentage updates
8. **Cooldown** - Wait 6-9 seconds before resuming ambient flips

### Timing

- **Flip duration**: 300ms (existing CSS transition)
- **Number roll duration**: 400ms
- **Flip buffer**: +50ms after each flip
- **AI action interval**: 8-15 seconds (randomized)
- **Cooldown after sequence**: 6-9 seconds (randomized)

### AI Action Rules

- **If PEPE health is fragile** and allocation > 5%: Move 2-6% of total to Cash
- **Occasionally** (30% chance): Move 1-3% from Cash to ETH or PEPE

### State Management

- **Centralized store**: `src/state/walletAlloc.tsx`
- **Persistence**: All balances stored in cents to avoid float drift
- **Total funds**: Always constant (rebalancing doesn't change total)
- **Allocation percentages**: Calculated dynamically from balances

## Components

### NumberRoll

Slot-machine style number animation component:
- Props: `valueCents`, `currency`, `durationMs`, `className`
- Formats with `Intl.NumberFormat`
- Animates each digit column vertically
- Respects `prefers-reduced-motion` (instant swap)

### CardStack

Enhanced with:
- `flipToCard(cardType)` - Programmatically flip to a specific card
- AI action sequence handling
- Automatic pause/resume of ambient flips
- Action queueing (FIFO) for multiple rapid actions

### useAiRebalance

AI action generator hook:
- Emits actions every 8-15 seconds
- Uses health-based logic to determine actions
- Exports: `onAction(callback)`, `start()`, `stop()`, `nextAction()`

## Configuration

### Environment Variables

- `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS=1` - Enable ambient card flips
- `NEXT_PUBLIC_RANDOM_FLIP_QUIET_MS` - Initial quiet period (default: 30000ms)
- `NEXT_PUBLIC_RANDOM_FLIP_MIN_MS` - Min interval between bursts (default: 3000ms)
- `NEXT_PUBLIC_RANDOM_FLIP_MAX_MS` - Max interval between bursts (default: 180000ms)
- `NEXT_PUBLIC_RANDOM_FLIP_BURST_STEP_MS` - Delay between flips in burst (default: 350ms)

### Adjusting Intervals

To change AI action frequency, edit `src/lib/aiActions/useAiRebalance.ts`:

```typescript
const delay = 8000 + Math.random() * 7000 // 8-15s randomized
```

To change cooldown, edit `src/components/CardStack.tsx`:

```typescript
const COOLDOWN_MIN_MS = 6000
const COOLDOWN_MAX_MS = 9000
```

## Testing

1. Enable random flips: Set `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS=1`
2. Wait 8-15 seconds for first AI action
3. Observe the sequence:
   - Card flips to target
   - Numbers roll
   - Card flips back to Cash
   - Cash numbers roll
   - Ambient flips resume after cooldown

## Notes

- "Funds available" always shows `totalCents / 100` (never changes during rebalance)
- Allocation pills update automatically when balances change
- Multiple rapid actions are queued and processed sequentially
- No color changes are made (as per requirements)


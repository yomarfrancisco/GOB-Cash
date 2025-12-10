# Card Flip-Up Animation

## Overview

The card flip-up animation is a CSS-based animation that powers the card stack cycling behavior on the home dashboard. When a user clicks or swipes up on the top card, it slides up and fades out while the middle and back cards smoothly transition to their new positions.

## Location

### Files

- **Animation Definition**: `src/app/globals.css` (lines 251-308)
- **Component Usage**: `src/components/CardStack.tsx` (lines 135-165, 175-220)
- **Centralized Styles**: `src/styles/card-flip.css` (new)
- **Class Name Exports**: `src/lib/animations/cardFlipClassNames.ts` (new)

## Animation Details

### Library

**CSS Transitions** (not Framer Motion)

### Current Props

- **Duration**: 300ms
- **Easing**: `ease`
- **Properties Animated**:
  - `transform` (translateY)
  - `opacity`
  - `box-shadow`
  - `width`
  - `height`
  - `left`
  - `top`

### CSS Classes

1. **`.card`** (base class)
   - Transition: `transform 300ms ease, opacity 300ms ease, box-shadow 300ms ease, width 300ms ease, height 300ms ease, left 300ms ease, top 300ms ease`
   - `will-change: transform, left, top, width, height`

2. **`.pos-top`** (top card position)
   - `z-index: 3`
   - `left: 0; top: 0`
   - `width: 100%; max-width: 398px`
   - `height: 238px`

3. **`.pos-mid`** (middle card position)
   - `z-index: 2`
   - `left: 16px; top: 50px`
   - `width: calc(100% - 32px); max-width: 366px`
   - `height: 213px`

4. **`.pos-back`** (back card position)
   - `z-index: 1`
   - `left: 32px; top: 100px`
   - `width: calc(100% - 64px); max-width: 334px`
   - `height: 193px`

5. **`.cycling-out`** (exit animation)
   - `transform: translateY(-120%)`
   - `opacity: 0`

6. **`.card:hover:not(.no-hover)`** (hover effect)
   - `transform: translateY(-4px)`

### Components Using It

- `CardStack.tsx` - Main component that applies the animation classes

## How to Disable

### Option 1: Quick Disable (CSS)

In `src/styles/card-flip.css`, comment out or remove the transition property:

```css
.card {
  /* transition: transform 300ms ease, opacity 300ms ease, box-shadow 300ms ease, width 300ms ease, height 300ms ease, left 300ms ease, top 300ms ease; */
  transition: none;
}
```

### Option 2: Remove Animation Classes

In `src/components/CardStack.tsx`, modify `getCardClasses()` to return static classes without position transitions:

```typescript
const getCardClasses = (index: number) => {
  // Return static classes only, no position classes
  return 'card'
}
```

### Option 3: Disable via Environment Variable

Set `NEXT_PUBLIC_DISABLE_CARD_ANIMATION=1` in your `.env.local` and update `CardStack.tsx` to check this flag.

## Dependencies

- No external animation libraries required
- CSS transitions are native browser features
- No global CSS requirements beyond the styles in `card-flip.css`

## Accessibility

The animation respects `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
}
```

## Behavior

1. User clicks or swipes up on top card
2. Top card gets `.cycling-out` class → slides up and fades out
3. Middle card transitions from `.pos-mid` to `.pos-top`
4. Back card transitions from `.pos-back` to `.pos-mid`
5. After 300ms, order array rotates: `[a, b, c] → [b, c, a]`
6. Old top card reappears at back position with `.pos-back` class

## Random Flips (Experimental)

An experimental, opt-in automation feature that randomly flips the CardStack at variable intervals.

### Feature Flag

Controlled by `NEXT_PUBLIC_ENABLE_RANDOM_CARD_FLIPS` environment variable:
- Set to `'1'` to enable random flips
- Default: disabled (no change to current behavior)

### Configuration

All timings are configurable via environment variables:

- `NEXT_PUBLIC_RANDOM_FLIP_QUIET_MS` - Initial quiet period before first flip (default: 10000ms / 10s)
- `NEXT_PUBLIC_RANDOM_FLIP_MIN_MS` - Minimum interval between flip bursts (default: 1000ms / 1s)
- `NEXT_PUBLIC_RANDOM_FLIP_MAX_MS` - Maximum interval between flip bursts (default: 60000ms / 60s)
- `NEXT_PUBLIC_RANDOM_FLIP_MIN_COUNT` - Minimum flips per burst (default: 1)
- `NEXT_PUBLIC_RANDOM_FLIP_MAX_COUNT` - Maximum flips per burst (default: 3)
- `NEXT_PUBLIC_RANDOM_FLIP_BURST_STEP_MS` - Per-flip delay inside a burst (default: 350ms, must be >= CSS transition ~300ms)

### Behavior

- No flips for the first 10s after mount (configurable via `QUIET_MS`)
- After quiet period, random flip bursts occur:
  - Interval between bursts: random between `MIN_MS` and `MAX_MS`
  - Each burst does 1-3 flips (random), spaced `BURST_STEP_MS` apart (default 350ms)
  - Bursts never overlap (guarded by `bursting` state)
- Flips pause when tab is hidden; resume when visible
- Manual/hover flip behavior is preserved

### Implementation

- Hook: `src/lib/animations/useRandomCardFlips.ts`
- Wired in: `src/app/page.tsx`
- Uses `CardStackHandle.cycleNext()` to trigger flips

### Removal

To remove random flips:
1. Delete the `useRandomCardFlips` import and call from `src/app/page.tsx`
2. Optionally remove `src/lib/animations/useRandomCardFlips.ts`
3. The `CardStackHandle` ref can remain for future automation needs


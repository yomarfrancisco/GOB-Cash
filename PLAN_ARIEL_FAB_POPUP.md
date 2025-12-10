# Plan: Support $ariel Avatar in FAB Pop-up Animation

## Goal
Enable the FAB highlight animation to show $ariel's avatar for high-volume $ariel notifications (R45,000+), while maintaining $ama's avatar for AI trades.

## Current State
- FAB animation is hardcoded to show $ama's avatar (`/assets/Brics-girl-blue.png`)
- Only AI trades from `useAiActionCycle` trigger the FAB highlight (R150+ threshold)
- $ariel notifications exist but don't trigger FAB highlight

## Implementation Plan

### Step 1: Update State to Store Avatar
**File**: `src/state/aiFabHighlight.ts`

**Changes**:
1. Add `lastAvatar?: string` to `AiFabHighlightState` type
2. Update `triggerAiFabHighlight` to accept optional `avatar` parameter
3. Store avatar in state when triggered

```typescript
export type AiFabHighlightState = {
  isHighlighted: boolean
  lastReason?: string
  lastAmountZar?: number
  lastAvatar?: string // NEW: Avatar path for the actor that triggered the highlight
  triggerAiFabHighlight: (meta?: { 
    reason?: string
    amountZar?: number
    avatar?: string // NEW: Optional avatar parameter
  }) => void
}

// In store implementation:
triggerAiFabHighlight: (meta) => {
  set({
    isHighlighted: true,
    lastReason: meta?.reason,
    lastAmountZar: meta?.amountZar,
    lastAvatar: meta?.avatar, // NEW: Store avatar
  })
  // ... auto-reset logic
}
```

---

### Step 2: Add Helper Function for $ariel FAB Highlight
**File**: `src/state/aiFabHighlight.ts`

**New Function**:
```typescript
/**
 * Helper to determine if a $ariel notification should trigger the FAB highlight
 * Triggers for high-volume transactions (R45,000+)
 */
export function shouldHighlightArielFab(
  actor?: { name?: string; type?: string },
  amountZar?: number
): boolean {
  // Must be $ariel
  if (!actor || actor.name !== '$ariel') {
    return false
  }
  
  // High volume threshold: R45,000+
  if (amountZar && Math.abs(amountZar) >= 45000) {
    return true
  }
  
  return false
}
```

---

### Step 3: Update BottomGlassBar to Use Stored Avatar
**File**: `src/components/BottomGlassBar.tsx`

**Changes**:
1. Read `lastAvatar` from store (with fallback to $ama's avatar)
2. Use stored avatar instead of hardcoded path

```typescript
// Line 22: Update to read avatar
const { isHighlighted, lastAvatar } = useAiFabHighlightStore((state) => ({
  isHighlighted: state.isHighlighted,
  lastAvatar: state.lastAvatar,
}))

// Line 88: Update Image src to use stored avatar
<Image 
  src={lastAvatar || '/assets/Brics-girl-blue.png'} // Use stored avatar, fallback to $ama
  alt="AI Manager" 
  width={72} 
  height={72} 
  className="fab-avatar-image"
  unoptimized 
/>
```

---

### Step 4: Update AI Action Cycle to Pass $ama's Avatar
**File**: `src/lib/animations/useAiActionCycle.ts`

**Changes**:
1. Import `CHARACTERS` from `@/lib/demo/templates/characters`
2. Pass $ama's avatar when triggering FAB highlight

```typescript
// Add import
import { CHARACTERS } from '@/lib/demo/templates/characters'

// In processAction function, around line 299:
if (shouldHighlightAiFab(zarAmount)) {
  triggerAiFabHighlight({
    reason: shortWhyString,
    amountZar: zarAmount,
    avatar: CHARACTERS.ama.avatar, // Pass $ama's avatar: '/assets/Brics-girl-blue.png'
  })
}
```

---

### Step 5: Update Demo Notification Engine to Check for $ariel
**File**: `src/lib/demo/demoNotificationEngine.ts`

**Changes**:
1. Import `shouldHighlightArielFab` and `CHARACTERS`
2. Check for $ariel notifications with R45k+ threshold
3. Trigger FAB highlight with $ariel's avatar

```typescript
// Add imports
import { 
  useAiFabHighlightStore, 
  shouldHighlightAiFab,
  shouldHighlightArielFab // NEW
} from '@/state/aiFabHighlight'
import { CHARACTERS } from '@/lib/demo/templates/characters' // NEW

// In the notification generation loop (around line 320-340):
// After event is generated and before pushNotification:

// Check if $ariel notification should trigger FAB highlight
if (shouldHighlightArielFab(event.actor, event.amount?.value)) {
  const triggerAiFabHighlight = useAiFabHighlightStore.getState().triggerAiFabHighlight
  triggerAiFabHighlight({
    reason: 'ariel-high-volume',
    amountZar: event.amount?.value,
    avatar: CHARACTERS.ariel.avatar, // Pass $ariel's avatar: '/assets/avatar - profile (3).png'
  })
}

// Then push the notification as normal
pushNotification(event)
```

---

### Step 6: Update Wallet Mode (if needed)
**File**: `src/state/walletMode.tsx`

**Changes**:
1. Pass $ama's avatar for wallet mode changes (since $ama manages autonomous mode)

```typescript
// Around line 70:
if (newMode === 'autonomous' && oldMode === 'manual') {
  triggerAiFabHighlight({
    reason: 'Community wallet enabled',
    amountZar: undefined,
    avatar: CHARACTERS.ama.avatar, // Pass $ama's avatar
  })
}
```

---

## Testing Checklist

- [ ] $ama AI trades (R150+) → Shows $ama's avatar pop-up
- [ ] $ariel notifications (R45,000+) → Shows $ariel's avatar pop-up
- [ ] $ariel notifications (< R45,000) → No FAB highlight
- [ ] Wallet mode changes → Shows $ama's avatar pop-up
- [ ] Animation duration is 3.5 seconds for both
- [ ] Avatar correctly switches between $ama and $ariel based on trigger

---

## Files to Modify

1. `src/state/aiFabHighlight.ts` - Add avatar tracking and helper function
2. `src/components/BottomGlassBar.tsx` - Use stored avatar
3. `src/lib/animations/useAiActionCycle.ts` - Pass $ama's avatar
4. `src/lib/demo/demoNotificationEngine.ts` - Check for $ariel and trigger with avatar
5. `src/state/walletMode.tsx` - Pass $ama's avatar (optional, for consistency)

---

## Avatar Paths Reference

- **$ama**: `/assets/Brics-girl-blue.png`
- **$ariel**: `/assets/avatar - profile (3).png` (from `CHARACTERS.ariel.avatar`)

---

## Notes

- Threshold for $ariel is R45,000 (lower than previous R80,000 mentioned in some code)
- Same 3.5 second animation duration for both avatars
- Fallback to $ama's avatar if no avatar is stored (backward compatibility)
- Uses `CHARACTERS` constant for avatar paths (single source of truth)


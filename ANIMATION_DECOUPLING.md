# Animation Decoupling from Balance Mutations - Step 4

## Summary

Decoupled animations from balance mutations to allow non-balance animations (card flips, UI shine) to run post-auth while preventing any demo balance writes.

## Key Principle

**Animations can run post-auth, but balance mutations cannot.**

- **Visual animations** (card flips, UI transitions): ✅ Allowed post-auth
- **Balance mutations** (setCash, setEth, setZwd): ❌ Blocked post-auth via gates

## Implementation

### 1. `useRandomCardFlips` - Visual Animation Only ✅

**Status**: Now allowed post-auth

**Why**: This animation only calls `cycleNext()` which is a visual effect (card rotation). It does NOT mutate any balances.

**Changes**:
- Removed `!isAuthed` check from `shouldEnable`
- Removed authState check after quiet period
- Removed transition detection (no need to clear on auth transition)
- Animation now runs regardless of auth state (as long as demo mode is enabled)

**Code**:
```typescript
// DECOUPLED: Card flips are visual-only (no balance mutations), so allow them post-auth
const shouldEnable = ENABLED && isDemoMode // Removed !isAuthed check
```

### 2. `useAiActionCycle` - Balance-Mutating Animation ❌

**Status**: Remains disabled post-auth

**Why**: This animation is specifically designed to mutate balances (`setCash`, `setEth`). While the gates prevent mutations, the animation logic is tightly coupled to balance changes, so it's safer to disable it entirely.

**Current State**:
- Disabled via `enabled` flag: `authState === 'unauthed'`
- Gates in `setCash`/`setEth`/`setZwd` provide defense-in-depth
- Animation includes card flips, but they're part of a balance-mutating sequence

**Note**: The card flips in `useAiActionCycle` are part of a sequence that includes balance mutations, so they're disabled along with the balance mutations. The standalone `useRandomCardFlips` provides visual-only card flips.

### 3. Balance Mutation Gates (Defense-in-Depth) 🛡️

**Status**: Already implemented in Step 2

**Why**: Even if an animation tries to mutate balances, the gates prevent it.

**Gates**:
- `setCash`, `setEth`, `setZwd`: Early return if `authState !== 'unauthed'`
- `setWallets`: Forces balances to zero if `authState !== 'unauthed'`

## Animation Types

### ✅ Allowed Post-Auth (Visual Only)

1. **Card Flips** (`useRandomCardFlips`)
   - Visual effect only
   - No balance mutations
   - Safe to run post-auth

2. **UI Transitions** (if any)
   - Visual effects
   - No balance mutations
   - Safe to run post-auth

### ❌ Disabled Post-Auth (Balance Mutations)

1. **AI Action Cycle** (`useAiActionCycle`)
   - Mutates balances via `setCash`, `setEth`
   - Disabled post-auth
   - Gates provide defense-in-depth

## Flow

### Post-Auth User Experience

1. **Visual Animations**: ✅ Continue running
   - Card flips via `useRandomCardFlips`
   - UI transitions and shine effects

2. **Balance Mutations**: ❌ Blocked
   - `useAiActionCycle` disabled
   - Gates prevent any balance mutations
   - UI reads from Firestore wallets

### Pre-Auth User Experience

1. **Visual Animations**: ✅ Running
   - Card flips via `useRandomCardFlips`
   - AI action cycle (includes card flips + balance mutations)

2. **Balance Mutations**: ✅ Allowed
   - Demo balances can mutate
   - `useAiActionCycle` runs normally

## Files Modified

1. **`src/lib/animations/useRandomCardFlips.ts`**
   - Removed `!isAuthed` check from `shouldEnable`
   - Removed authState check after quiet period
   - Removed transition detection
   - Added comments explaining decoupling

## Defense-in-Depth

Even if an animation tries to mutate balances post-auth:

1. **First Line**: `useAiActionCycle` is disabled (`enabled = false`)
2. **Second Line**: Gates in `setCash`/`setEth`/`setZwd` early return
3. **Third Line**: `setWallets` forces balances to zero

## Key Guarantees

1. **Visual animations can run post-auth**: Card flips and UI effects continue
2. **Balance mutations are blocked**: Multiple layers of protection
3. **No demo balances post-auth**: Gates prevent any mutations
4. **UI reads from real store**: Firestore wallets are source of truth

## Next Steps

- Step 5: Verification and testing


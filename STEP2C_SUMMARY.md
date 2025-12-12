# Step 2c: Optimize Remaining Assets + Add Ariel Avatar

## Summary

Completed optimization of remaining high-impact assets and added Ariel avatar to avatar pools.

---

## A) Optimized Remaining High-Impact Assets

### A1) TopGlassBar Assets ✅
**File**: `src/components/TopGlassBar.tsx`

**Changes**:
- Glass shard (729x713px): Removed `unoptimized`, added `quality={92}`, `sizes="729px"`
- Spraypaint effect (300x120px): Removed `unoptimized`, added `quality={92}`, `sizes="300px"`
- Logo (198x59px / 220x65px for Activity): Removed `unoptimized`, added `quality={92}`, `sizes="198px"` / `sizes="220px"`

**Impact**: Faster load on iOS, no layout shifts, pixel-perfect placement maintained

### A2) Bottom Nav Dollar Sign / FAB Button ✅
**File**: `src/components/BottomGlassBar.tsx`

**Changes**:
- Dollar sign button (60x60px): Removed `unoptimized`, added `quality={92}`, `sizes="60px"`, `priority`

**Impact**: Faster load, always visible in bottom nav

### A3) Card Stack Images ✅
**File**: `src/components/CardStackCard.tsx`

**Changes**:
- Card images: Removed `unoptimized`, added `quality={92}`
- Kept `priority={isTop}` for top card only (lazy loading for rest)
- Container has stable dimensions (no reflow)

**Impact**: Faster load for top card, lazy loading for others

### A4) Remaining Unoptimized Images
**Status**: Other `unoptimized` flags found in:
- Sheet components (modals, dialogs) - lower priority, below-the-fold
- Profile components - conditional rendering
- Map components - error fallbacks only

**Decision**: Left as-is for now (not high-impact for first paint)

---

## B) Added Ariel Avatar ✅

### Asset Location
- **File**: `public/assets/avatar-ariel.png` (already exists)

### Integration Points

#### 1. Commercial Section Footers ✅
**File**: `src/components/HomeStreamSection.tsx`

**Changes**:
- Added `/assets/avatar-ariel.png` to `COMMERCIAL_AGENT_AVATARS` array
- Ariel will appear in stacked avatars (max 4) in commercial card footers
- Rotates deterministically based on card index

#### 2. Notification Rotation ✅
**File**: `src/lib/demo/templates/agentRegistry.ts`

**Changes**:
- Added Ariel agent profile to `AGENT_REGISTRY`:
  - ID: `'ariel'`
  - Name: `'@ariel'`
  - City: `'Johannesburg'`
  - Country: `'South Africa'`
  - Avatar: `'/assets/avatar-ariel.png'`
  - Productivity: `93`
  - Specialties: `['high-performer', 'reliable']`

**Impact**: Ariel will appear in demo notifications when agents are randomly selected via `notificationSelection.ts`

---

## Files Modified

1. `src/components/TopGlassBar.tsx` - Optimized 3 images
2. `src/components/BottomGlassBar.tsx` - Optimized dollar sign button
3. `src/components/CardStackCard.tsx` - Optimized card images
4. `src/components/HomeStreamSection.tsx` - Added Ariel to commercial avatars
5. `src/lib/demo/templates/agentRegistry.ts` - Added Ariel agent profile

---

## Verification Checklist ✅

### Build & Quality
- ✅ Build passes locally
- ✅ No linter errors
- ✅ All images use `quality={92}` (high quality)
- ✅ Proper `sizes` attributes (no layout shifts)

### iOS Safari Testing (To Verify)
- [ ] Top bar loads with fewer "blank" moments
- [ ] No layout shifts on top bar or card stack
- [ ] Dollar/FAB image appears fast
- [ ] Avatars:
  - [ ] Ariel appears in notifications sometimes
  - [ ] Ariel appears in commercial footer rotation sometimes
  - [ ] Never more than 4 stacked avatars

---

## Commits

1. `7f70fda` - `perf: optimize top bar + fab + card stack images (next/image)`
2. (Ariel changes included in same commit)

---

## Performance Impact

### Optimized Assets:
- ✅ TopGlassBar images (3 images, above-the-fold)
- ✅ Dollar sign button (always visible)
- ✅ Card stack images (top card prioritized)

### Expected Improvements:
- **Faster first paint**: Top bar images load faster
- **Better perceived performance**: Lazy loading for cards 2+
- **Maintained quality**: All images at quality 92
- **No layout shifts**: Proper sizing prevents CLS

### Remaining Unoptimized (Low Priority):
- Sheet/modal images (below-the-fold)
- Profile images (conditional)
- Map fallback (error only)

---

## Next Steps

- Verify on iOS Safari
- Proceed to Step 4 (shimmer effects) if verification passes
- Or optimize remaining low-priority assets if needed


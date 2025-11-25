# Mapbox Map Casing Regression Analysis

**Date:** 2025-01-25  
**Branch:** `feature/isolate-user-marker`  
**Commit:** `9775dbf` (feat(map): add Union.svg casing to non-user avatar markers)

## Executive Summary

Adding the `createAvatarWithCasing()` helper function introduced two regressions:

1. **User character marker** is offset from the correct location (while "You are here" bubble remains correct)
2. **Non-user avatars** (dealers, members, co-ops, demo agents) appear randomly dispersed instead of at their correct SADC coordinates

## What Changed

### Code Diff Summary

The casing commit (`9775dbf`) made the following changes:

1. **Added `createAvatarWithCasing()` helper function** (lines 18-62):
   - Creates a 56px container with `className="gb-map-marker"`
   - Adds Union.svg casing as background layer (z-index: 1)
   - Adds avatar image as foreground layer (z-index: 2)
   - Uses `position: absolute` with `transform: translate(-50%, -50%)` for avatar centering

2. **Replaced inline marker creation with helper**:
   - **Dealers** (line ~549): Changed from 48px div with `backgroundImage` to `createAvatarWithCasing()`
   - **Members/co-ops** (line ~575): Changed from 40px div with nested `<img>` to `createAvatarWithCasing()`
   - **Demo agents** (line ~659): Changed from 40px div with nested `<img>` to `createAvatarWithCasing()`

3. **User marker logic**: **UNCHANGED** - still uses `styles.userMarker` and `styles.userImg` from CSS module

### Key Differences: Before vs After

#### Before (Production - `main` branch)

**Dealers:**
```typescript
const el = document.createElement('div')
el.style.width = '48px'
el.style.height = '48px'
el.style.borderRadius = '50%'
el.style.overflow = 'hidden'
el.style.border = '2px solid white'
el.style.backgroundImage = `url("${m.avatar || '/assets/avatar_agent5.png'}")`
el.style.backgroundSize = 'cover'
el.style.backgroundPosition = 'center'
el.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)'
```

**Members/co-ops:**
```typescript
const el = document.createElement('div')
el.className = 'map-avatar-marker'
el.style.width = '40px'
el.style.height = '40px'
el.style.borderRadius = '50%'
el.style.overflow = 'hidden'
el.style.background = '#ffffff'
// ... nested <img> with 100% width/height
```

#### After (Casing commit)

**All non-user markers:**
```typescript
const el = createAvatarWithCasing(m.avatar)
// Returns 56px container with:
// - Union.svg casing (absolute, inset: 0, z-index: 1)
// - Avatar img (absolute, top: 50%, left: 50%, transform: translate(-50%, -50%), z-index: 2)
```

## Root Cause Analysis

### Issue 1: User Character Marker Offset

**Observation:**
- "You are here" bubble is at correct location
- Character PNG is offset/wrong position

**Hypothesis:**

The user marker creation logic is **unchanged** in the code, but there may be a CSS conflict or DOM structure issue:

1. **CSS Class Conflict**: The new `createAvatarWithCasing()` function uses `className="gb-map-marker"` on the container. If there's global CSS for `.gb-map-marker` that applies transforms, margins, or positioning, it could affect other markers.

2. **User Marker CSS**: The user marker uses `styles.userMarker` from `MapboxMap.module.css`:
   ```css
   .userMarker {
     position: relative;
     width: 108px;
     height: 108px;
     transform: translate(-50%, -50%); /* center on lngLat */
   }
   ```
   This transform is **intentional** and should center the marker. However, if the Mapbox `anchor: 'center'` is also applied, there might be a double-transform issue.

3. **Mapbox Anchor Behavior**: The user marker uses:
   ```typescript
   new mapboxgl.Marker({
     element: el,
     anchor: 'center', // This should center the marker at the coordinate
   })
   ```
   Combined with CSS `transform: translate(-50%, -50%)`, this should work correctly. But if something changed in how Mapbox calculates the anchor point for elements with nested absolute positioning, it could cause offset.

**Code Reference:**
- User marker creation: `src/components/MapboxMap.tsx` lines 272-305
- User marker CSS: `src/components/MapboxMap.module.css` lines 48-56

### Issue 2: Non-User Avatars Randomly Dispersed

**Observation:**
- Avatars appear scattered randomly across the globe
- Before casing commit, they were correctly positioned in SADC region

**Hypothesis:**

The most likely cause is a **coordinate swap or transformation issue**:

1. **Coordinate Order**: Mapbox uses `[lng, lat]` (longitude first, latitude second). If the `createAvatarWithCasing()` helper or its usage somehow swapped or mutated coordinates, markers would appear in wrong locations.

2. **Size Change Impact**: The container size changed:
   - **Dealers**: 48px → 56px
   - **Members/co-ops**: 40px → 56px
   - **Demo agents**: 40px → 56px
   
   However, size changes should **not** affect geographic positioning if `anchor: 'center'` is used correctly.

3. **DOM Structure Change**: The new structure uses:
   ```html
   <div class="gb-map-marker" style="position: relative; width: 56px; height: 56px;">
     <img class="gb-marker-casing" style="position: absolute; inset: 0;" />
     <img class="gb-marker-avatar" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);" />
   </div>
   ```
   
   The nested absolute positioning with transforms should not affect Mapbox's coordinate anchoring, but if there's a CSS rule for `.gb-map-marker` that adds transforms or offsets, it could shift markers.

4. **Coordinate Mutation**: If coordinates are being mutated somewhere (e.g., swapped lng/lat, or transformed), the markers would appear in wrong locations. The logging we added will help verify this.

**Code Reference:**
- Dealer marker: `src/components/MapboxMap.tsx` line ~549
- Member/co-op marker: `src/components/MapboxMap.tsx` line ~575
- Demo agent marker: `src/components/MapboxMap.tsx` line ~659

## Verification Steps

### Temporary Logging Added

We've added `console.debug()` logs to verify coordinates:

1. **User marker**: Logs `{ lng, lat }` when `upsertUserMarker()` is called
2. **Dealer markers**: Logs `{ id, kind, lng, lat }` for each dealer
3. **Member/co-op markers**: Logs `{ id, kind, lng, lat }` for each member/co-op
4. **Demo agents**: Logs `{ id, lng, lat }` for each demo agent

### Comparison Plan

1. **Compare logs between branches**:
   - Run preview (with casing) and check console for coordinate values
   - Run production (no casing) and check console for coordinate values
   - Verify that `lng` and `lat` values are **identical** between branches

2. **If coordinates are identical but positions differ**:
   - This points to a **DOM/anchor/transform issue**, not a coordinate problem
   - Check for CSS conflicts with `.gb-map-marker` class
   - Verify Mapbox anchor behavior with the new DOM structure

3. **If coordinates differ**:
   - This points to a **coordinate mutation/swap issue**
   - Check if `createAvatarWithCasing()` or its call sites are mutating coordinates
   - Verify that `setLngLat([m.lng, m.lat])` is using the correct order

## Potential CSS Conflicts

### Check for Global CSS Rules

We need to verify if there are any global CSS rules for:
- `.gb-map-marker`
- `.gb-marker-casing`
- `.gb-marker-avatar`

These classes are new and may conflict with existing styles or be affected by global CSS resets.

### User Marker CSS Isolation

The user marker uses `styles.userMarker` (CSS module), which should be isolated. However, if there's a global CSS rule that affects elements with `position: relative` and `transform`, it could cause issues.

## Minimal Fix Plan

### Step 1: Verify Coordinates (Current)

- ✅ Added logging to all marker creation paths
- ⏳ Compare logs between production and preview
- ⏳ Confirm if coordinates are identical or mutated

### Step 2: Fix Based on Root Cause

**If coordinates are identical (DOM/anchor issue):**

1. **Check for CSS conflicts**:
   - Search for any global CSS rules affecting `.gb-map-marker`
   - Verify that user marker CSS (`styles.userMarker`) is not affected

2. **Verify Mapbox anchor behavior**:
   - Test if `anchor: 'center'` works correctly with the new 56px container
   - Consider using `anchor: 'bottom'` or explicit `offset` if needed

3. **Isolate user marker**:
   - Ensure user marker DOM structure remains unchanged
   - Verify that `styles.userMarker` CSS is not being overridden

**If coordinates are mutated (data issue):**

1. **Check coordinate order**:
   - Verify that `setLngLat([m.lng, m.lat])` uses correct order
   - Check if `createAvatarWithCasing()` or its call sites swap coordinates

2. **Verify marker data**:
   - Check that `m.lng` and `m.lat` are correct before calling `createAvatarWithCasing()`
   - Verify that demo agents' coordinates are correct

### Step 3: Restore Correct Positions

Once root cause is identified:

1. **Fix the issue** (CSS conflict, anchor behavior, or coordinate mutation)
2. **Keep the casing** (do not revert `createAvatarWithCasing()`)
3. **Verify all markers**:
   - User marker at correct location
   - All avatars at correct SADC coordinates
   - Casing visible on all non-user markers

## Files to Inspect

1. `src/components/MapboxMap.tsx` - Main map component
2. `src/components/MapboxMap.module.css` - User marker CSS
3. `src/app/globals.css` - Global CSS (check for `.gb-map-marker` rules)
4. `src/lib/demo/demoAgents.ts` - Demo agent coordinates

## Next Steps

1. ✅ Add logging (done)
2. ⏳ Compare console logs between production and preview
3. ⏳ Identify root cause (DOM/anchor vs coordinate mutation)
4. ⏳ Implement minimal fix
5. ⏳ Verify all markers are correctly positioned with casing

---

**Note:** This analysis is based on code inspection. The logging will provide concrete evidence of whether coordinates are correct or mutated, which will guide the fix.


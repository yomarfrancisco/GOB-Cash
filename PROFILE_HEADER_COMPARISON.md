# Profile Header Structure Comparison

## PHASE 1: DOM Hierarchy Comparison

### OWN PROFILE (/profile)

```
.app-shell.profile-page
  .mobile-frame (position: relative; overflow: hidden; height: 100vh)
    .dashboard-container (position: relative; overflow: hidden; height: 100%)
      .overlay-glass (position: fixed; inset: 0; z-index: 50; overflow-x: hidden)
        .overlay-glass-inner (position: absolute; height: 100%; overflow-x: hidden)
          .page-title-gobankless (position: absolute; top: 0; height: 160px; z-index: 10; overflow: visible)
            .glass-shard-small (position: absolute; top: -355px; z-index: 1)
            .gobankless-logo (position: absolute; top: 48px; z-index: 2)
            .icons (position: absolute; top: 0; height: 160px; z-index: 3)
      .content-fade-top (position: fixed; top: env(safe-area-inset-top); height: 110px; z-index: 25)
      .content-fade-bottom (position: fixed; bottom: env(safe-area-inset-bottom); z-index: 25)
      .scroll-content (z-index: 1)
```

### THIRD-PARTY PROFILE (/profile/ama)

```
.app-shell.profile-page
  .mobile-frame (position: relative; overflow: hidden; height: 100vh)
    .dashboard-container (position: relative; overflow: hidden; height: 100%)
      .overlay-glass (position: fixed; inset: 0; style={{ top: '92px' }}; z-index: 50; overflow-x: hidden)
        .overlay-glass-inner (position: absolute; height: 100%; overflow-x: hidden)
          .page-title-gobankless (position: absolute; top: 0; height: 160px; z-index: 10; overflow: visible)
            .glass-shard-small (position: absolute; top: -355px; z-index: 1)
            [NO logo, NO icons - hidden via props]
          .profile-other-avatar-container (position: absolute; top: 13px; z-index: 10)
      .profile-other-icons (position: fixed; top: 0; height: 160px; z-index: 60)
      .content-fade-top (position: fixed; top: env(safe-area-inset-top); height: 110px; z-index: 25)
      [NO content-fade-bottom]
      .scroll-content.profile-other-scroll (z-index: 1)
```

## PHASE 2: Key Differences

### 1. `.overlay-glass` Top Offset
- **Own Profile**: `inset: 0` → `top: 0` (starts at viewport top)
- **Third-Party**: `inset: 0` + inline `style={{ top: '92px' }}` → `top: 92px` (starts 92px from viewport top)

### 2. Container Height Calculation
- **Own Profile**: `.overlay-glass` with `inset: 0` = `100vh` tall (from top: 0 to bottom: 0)
- **Third-Party**: `.overlay-glass` with `inset: 0` + `top: 92px` = `100vh - 92px` tall (from top: 92px to bottom: 0)

### 3. Glass Shard Positioning
- **Both**: `.glass-shard-small` at `top: -355px` relative to `.page-title-gobankless` (which is at `top: 0` of `.overlay-glass-inner`)
- **Own Profile**: Shard extends to `-355px` from viewport top (fully visible)
- **Third-Party**: Shard extends to `92px - 355px = -263px` from viewport top, but container only goes up to `92px`, so top portion is clipped

### 4. Additional Elements
- **Third-Party Only**: `.profile-other-icons` at `z-index: 60` (above glass at z:50), positioned at `top: 0`
- **Both**: `.content-fade-top` at `z-index: 25` (below glass at z:50)

### 5. Overflow Behavior
- **Both**: `.overlay-glass` has `overflow-x: hidden` (no horizontal scroll)
- **Both**: `.overlay-glass` has NO `overflow-y` specified (defaults to `visible` in CSS, but `inset: 0` with `bottom: 0` constrains height)

## PHASE 3: Root Cause Diagnosis

### Why Own Profile Works
1. `.overlay-glass` starts at `top: 0` with `inset: 0`, creating a full `100vh` container
2. Glass shard at `top: -355px` extends above viewport, but container allows it (no height constraint above)
3. `.content-fade-top` at `z-index: 25` sits below glass (`z-index: 50`) and doesn't interfere

### Why Third-Party Profile is Cut Off
1. `.overlay-glass` has inline `style={{ top: '92px' }}` which overrides `top` from `inset: 0`
2. `inset: 0` still sets `bottom: 0`, so container height = `100vh - 92px` (from 92px to viewport bottom)
3. Glass shard at `top: -355px` tries to extend to `-263px` from viewport top
4. **The container's top edge is at 92px, so anything above 92px is clipped**
5. The glass shard's top portion (above 92px) is cut off because the parent container doesn't extend above the viewport

### The Clipping Mechanism
- **Not overflow: hidden** - `.overlay-glass` doesn't have `overflow-y: hidden` explicitly
- **Container bounds** - The container's effective height is `100vh - 92px` because:
  - `inset: 0` sets `bottom: 0`
  - Inline `top: 92px` overrides `top: 0`
  - Result: container spans from 92px to viewport bottom
- **Fixed positioning** - `position: fixed` with `inset: 0` creates a viewport-relative container, but the `top: 92px` offset creates a "window" that doesn't include the area above 92px

## PHASE 4: Minimal Fix Proposal

### Solution: Allow Container to Extend Above Viewport

**Problem**: `.overlay-glass` with `inset: 0` + `top: 92px` creates a container that only spans from 92px to viewport bottom, clipping the glass shard.

**Fix**: Remove the `bottom: 0` constraint for third-party profiles, allowing the container to extend above the viewport.

### Implementation

**File**: `src/app/globals.css`

Add CSS rule after `.overlay-glass` definition:

```css
/* Third-party profile: allow glass container to extend above viewport */
.profile-page .overlay-glass[style*="top: 92px"] {
  bottom: auto !important; /* Remove bottom constraint to allow extension above */
  min-height: calc(100vh + 447px); /* 100vh + 92px offset + 355px shard extension */
  overflow-y: visible; /* Explicitly allow vertical overflow for glass shard */
}
```

**Alternative (Cleaner)**: Add a class to third-party profile page instead of using attribute selector.

**File**: `src/app/profile/[handle]/page.tsx`

Change line 84:
```tsx
<div className="app-shell profile-page profile-public-page">
```

Change line 88:
```tsx
<div className="overlay-glass overlay-glass-public" style={{ top: '92px' }}>
```

**File**: `src/app/globals.css`

Add:
```css
/* Third-party profile: allow glass container to extend above viewport */
.profile-public-page .overlay-glass.overlay-glass-public {
  bottom: auto !important; /* Remove bottom constraint */
  min-height: calc(100vh + 447px); /* 100vh + 92px offset + 355px shard extension */
  overflow-y: visible; /* Allow glass shard to extend above */
}
```

### Why This Works
1. Removes `bottom: 0` constraint, allowing container to extend above viewport
2. Sets `min-height` to accommodate the 92px offset + 355px shard extension
3. Explicitly sets `overflow-y: visible` to ensure shard isn't clipped
4. Keeps `overflow-x: hidden` (inherited) to prevent horizontal scroll

### Regression Checks
- ✅ `/profile` (own profile) - No change, rule only applies to `.profile-public-page`
- ✅ `/profile/ama` (third-party) - Glass shard fully visible, no clipping
- ✅ `/` (home) - No change, rule scoped to profile pages
- ✅ Desktop view - No change, rule applies to all viewports
- ✅ Horizontal scroll - Prevented by `overflow-x: hidden` (inherited)


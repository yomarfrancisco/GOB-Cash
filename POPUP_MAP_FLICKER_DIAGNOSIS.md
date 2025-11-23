# Popup Map Flicker Diagnosis

## Problem
The popup map (CashMapPopup) is flickering after SADC changes were implemented. The changes were intended to only affect the landing map, but they're impacting the popup map.

## Root Causes Identified

### 1. **`canMoveCamera()` Function Doesn't Check Variant** ⚠️ CRITICAL
**Location:** `src/components/MapboxMap.tsx:493-500`

```typescript
const canMoveCamera = () => {
  // If static lock is still active, prevent movement
  if (Date.now() < staticLockUntilRef.current) return false
  // If authenticated, prevent movement
  if (isAuthedRef.current) return false
  // Otherwise, allow movement if animations are enabled
  return landingAnimationsEnabledRef.current
}
```

**Issue:** This function checks `staticLockUntilRef.current` but doesn't check if `variant === 'popup'`. If the landing map has set `staticLockUntilRef.current` to a future timestamp (during its 10-second lock), and then the popup map mounts, the ref might still have that value, causing `canMoveCamera()` to incorrectly return `false` for popup maps.

**Impact:** Popup maps might be blocked from camera movements even though they should always allow movement.

---

### 2. **Shared Component-Level Refs Between Landing and Popup Maps** ⚠️ CRITICAL
**Location:** `src/components/MapboxMap.tsx:82-92`

```typescript
const landingAnimationsEnabledRef = useRef(landingAnimationsEnabled)
const isAuthedRef = useRef(isAuthed)
const staticLockUntilRef = useRef<number>(0)
```

**Issue:** These refs are component-level, meaning they're shared across all instances of `MapboxMap`. If both landing and popup maps are rendered simultaneously (or one unmounts and another mounts), these refs can have stale values from the other map instance.

**Scenario:**
1. Landing map mounts → sets `staticLockUntilRef.current = Date.now() + 10000`
2. Popup map mounts → reads `staticLockUntilRef.current` which still has the landing map's timestamp
3. Popup map's `canMoveCamera()` returns `false` incorrectly

**Impact:** Popup maps inherit state from landing maps, causing flicker/blocking.

---

### 3. **`landingAnimationsEnabled` State Initialization Race Condition** ⚠️ MEDIUM
**Location:** `src/components/MapboxMap.tsx:78-82`

```typescript
const [landingAnimationsEnabled, setLandingAnimationsEnabled] = useState(
  variant !== 'landing' // animations always on for non-landing variants
)
const landingAnimationsEnabledRef = useRef(landingAnimationsEnabled)
```

**Issue:** For popup variant, `landingAnimationsEnabled` is initialized as `true`. However, if the landing map has set this to `false` and updated the ref, and then the popup map mounts, there's a brief moment where the ref might have the wrong value before the popup map's effect (line 484-486) syncs it.

**Impact:** Brief flicker during initial render as refs sync.

---

### 4. **Main Initialization Effect Re-runs on Variant Change** ⚠️ MEDIUM
**Location:** `src/components/MapboxMap.tsx:454`

```typescript
}, [styleUrl, containerId, showDebug, variant, initialCenter, initialZoom])
```

**Issue:** The main map initialization effect includes `variant` in its dependency array. This means if `variant` changes (e.g., from 'landing' to 'popup'), the entire map gets re-initialized, which could cause flicker.

**Note:** This might be intentional (different variants need different setup), but it could cause flicker if the variant prop changes during the component's lifecycle.

**Impact:** Map re-initialization when variant changes, causing visible flicker.

---

### 5. **Effects That Check `canMoveCamera()` Without Variant Guard** ⚠️ LOW
**Location:** `src/components/MapboxMap.tsx:735, 829`

```typescript
// Line 735 (highlight effect)
if (variant === 'landing' && !canMoveCamera()) return

// Line 829 (auto-zoom effect)
if (variant === 'landing' && !canMoveCamera()) return
```

**Issue:** These effects check `variant === 'landing'` first, which is good. However, they still call `canMoveCamera()` which doesn't check variant. If `canMoveCamera()` has side effects or if the refs have stale values, it could still cause issues.

**Note:** This is less critical since the effects return early for popup variant, but it's still a code smell.

**Impact:** Low - effects are properly gated, but `canMoveCamera()` could still be called unnecessarily.

---

## Summary of Conflicts

| Issue | Severity | Impact on Popup Map |
|-------|----------|---------------------|
| `canMoveCamera()` doesn't check variant | **CRITICAL** | Blocks camera movement incorrectly |
| Shared refs between map instances | **CRITICAL** | Inherits landing map's lock state |
| State initialization race condition | **MEDIUM** | Brief flicker on mount |
| Map re-initialization on variant change | **MEDIUM** | Visible flicker during remount |
| Effects calling `canMoveCamera()` unnecessarily | **LOW** | Minor performance impact |

## Recommended Fixes

### Fix 1: Add Variant Check to `canMoveCamera()`
```typescript
const canMoveCamera = () => {
  // Popup maps always allow camera movement
  if (variant === 'popup') return true
  // If static lock is still active, prevent movement
  if (Date.now() < staticLockUntilRef.current) return false
  // If authenticated, prevent movement
  if (isAuthedRef.current) return false
  // Otherwise, allow movement if animations are enabled
  return landingAnimationsEnabledRef.current
}
```

### Fix 2: Initialize Refs Per Variant
```typescript
// Initialize refs based on variant
const staticLockUntilRef = useRef<number>(0)
const landingAnimationsEnabledRef = useRef(variant !== 'landing')
const isAuthedRef = useRef(isAuthed)

// Reset refs when variant changes
useEffect(() => {
  if (variant === 'popup') {
    staticLockUntilRef.current = 0
    landingAnimationsEnabledRef.current = true
  }
}, [variant])
```

### Fix 3: Guard All Camera Movement Checks
Ensure all places that check camera movement also check variant:
- Line 317 (geolocate handler)
- Line 735 (highlight effect) - already guarded
- Line 829 (auto-zoom effect) - already guarded

### Fix 4: Consider Instance-Scoped Refs
If both maps can exist simultaneously, consider using instance-scoped refs (e.g., via a WeakMap keyed by containerId) instead of component-level refs.

---

## Testing Checklist

After fixes:
- [ ] Popup map opens without flicker
- [ ] Popup map allows camera movement (fitBounds, route updates)
- [ ] Landing map still respects 10-second lock
- [ ] Landing map still respects auth state
- [ ] Both maps can exist simultaneously without interference
- [ ] No console errors or warnings


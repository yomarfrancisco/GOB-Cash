# Popup Map Jitter Diagnosis: Comparing 4d23672 vs Current

## Key Differences Found

### 1. **Ref Reset Effect Running Too Frequently** ⚠️ CRITICAL
**Current Code (Lines 483-498):**
```typescript
useEffect(() => {
  if (variant === 'popup') {
    staticLockUntilRef.current = 0
    landingAnimationsEnabledRef.current = true
    isAuthedRef.current = false
  } else {
    landingAnimationsEnabledRef.current = landingAnimationsEnabled
    isAuthedRef.current = isAuthed
  }
}, [variant, landingAnimationsEnabled, isAuthed]) // ❌ Runs on EVERY state change
```

**Working Commit 4d23672:**
- **NO such effect existed** - refs were initialized once and never reset

**Problem:** This effect runs every time `landingAnimationsEnabled` or `isAuthed` changes, causing unnecessary re-renders and potential jitter.

---

### 2. **Multiple Ref Sync Effects** ⚠️ MEDIUM
**Current Code (Lines 500-511):**
- Three separate effects syncing refs on state changes
- Each runs independently when dependencies change

**Working Commit 4d23672:**
- **NO ref sync effects** - refs didn't exist, only state

**Problem:** Multiple effects running on state changes can cause cascading re-renders.

---

### 3. **Geolocate Handler Complexity** ⚠️ LOW
**Current Code (Line 317):**
```typescript
const shouldCenter = fitToMarkers || variant !== 'landing' || (variant === 'landing' && canMoveCamera())
```

**Working Commit 4d23672:**
```typescript
if (fitToMarkers || variant !== 'landing') {
  map.setCenter([lng, lat])
}
```

**Problem:** Calling `canMoveCamera()` in the geolocate handler adds complexity, though this is only for landing maps.

---

### 4. **Dependency Array Changes** ⚠️ LOW
**Current Code:**
```typescript
}, [styleUrl, containerId, showDebug, initialCenter, initialZoom]) // variant excluded
```

**Working Commit 4d23672:**
```typescript
}, [styleUrl, containerId, showDebug, variant]) // variant included
```

**Note:** This shouldn't cause jitter since the map initialization has a guard preventing double init.

---

## Root Cause

The **ref reset effect (lines 483-498)** is the primary culprit:
- It runs on `[variant, landingAnimationsEnabled, isAuthed]`
- Every time `landingAnimationsEnabled` or `isAuthed` changes, it re-runs
- This causes unnecessary effect executions and potential re-renders
- For popup maps, this is especially problematic since they shouldn't care about these state changes

## Fix Strategy

1. **Initialize refs once based on variant** - don't reset on every state change
2. **Only sync refs when absolutely necessary** - reduce effect frequency
3. **Simplify geolocate handler** - match working commit's simplicity for popup maps
4. **Keep `canMoveCamera()` bypass for popup** - but don't call it unnecessarily

## Applied Fixes

1. ✅ Changed ref reset effect to only run on `[variant]` - not on state changes
2. ✅ Simplified geolocate handler to match working commit pattern
3. ✅ Kept ref sync effects but made them more targeted
4. ✅ Maintained `canMoveCamera()` bypass for popup maps


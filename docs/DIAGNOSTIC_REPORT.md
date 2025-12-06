# Diagnostic Report: Question-Mark Help Icons & Map Rendering Issue

## 1. Question-Mark Icon Comparison

### Map Pop-up Header Icon (ConvertCashSection)
**Location:** `src/components/ConvertCashSection.tsx` (line 25-32)
**CSS Class:** `.helpBtn` in `src/components/ConvertCashSection.module.css`

**Typography:**
- Font family: Inherited (default system font, likely `system-ui` or `-apple-system`)
- Font size: `14px`
- Font weight: `600` (semi-bold)
- Color: `rgba(10, 10, 10, 0.7)` (70% opacity black)

**Sizing:**
- Width: `28px`
- Height: `28px`
- Border radius: `999px` (fully rounded)

**Styling:**
- Border: `1px solid #e2e2e2` (light gray)
- Background: `#fff` (white)
- Display: `flex` with `align-items: center` and `justify-content: center`

**Positioning:**
- Container: `.headerRow` with `display: flex`, `justify-content: space-between`
- Alignment: Right-aligned in header row
- Gap: `12px` between title and icon

---

### Card Help Icon (Wallet Section)
**Location:** `src/app/page.tsx` (line 338-359)
**CSS Class:** `.help-icon` in `src/app/globals.css`

**Typography:**
- Font family: Inherited (default system font)
- Font size: `14px`
- Font weight: `600` (semi-bold)
- Color: `#007AFF` (iOS blue)

**Sizing:**
- Width: `20px`
- Height: `20px`
- Border radius: `50%` (fully rounded)

**Styling:**
- Border: `2px solid #007AFF` (iOS blue, thicker border)
- Background: Transparent (inherits from parent)
- Display: `flex` with `align-items: center` and `justify-content: center`

**Positioning:**
- Container: `.wallet-header` with `display: flex`, `justify-content: space-between`
- Alignment: Right-aligned in header row
- Gap: `20px` between title and icon

**Interactive States:**
- Hover: Background becomes `#007AFF`, text becomes white, `transform: scale(1.1)`
- Active: `transform: scale(0.95)`

---

## 2. Comparison Table

| Property | Map Pop-up Icon (`.helpBtn`) | Card Icon (`.help-icon`) | Difference |
|----------|------------------------------|--------------------------|------------|
| **Width** | 28px | 20px | **8px larger** |
| **Height** | 28px | 20px | **8px larger** |
| **Border** | 1px solid #e2e2e2 | 2px solid #007AFF | **Different color & thickness** |
| **Background** | #fff (white) | Transparent | **Different** |
| **Color** | rgba(10, 10, 10, 0.7) | #007AFF | **Different (gray vs blue)** |
| **Font Size** | 14px | 14px | **Same** |
| **Font Weight** | 600 | 600 | **Same** |
| **Border Radius** | 999px | 50% | **Same effect** |
| **Hover Effect** | None | Background + scale | **Card has hover, map doesn't** |
| **Container Gap** | 12px | 20px | **8px difference** |

---

## 3. Root Cause Analysis

### Why Inconsistencies Exist:

1. **Different Design Systems:**
   - Map icon uses a **neutral gray design** (white background, gray border, gray text)
   - Card icon uses an **iOS-style blue design** (transparent background, blue border, blue text)

2. **Different CSS Approaches:**
   - Map icon: **CSS Module** (`ConvertCashSection.module.css`) - scoped styling
   - Card icon: **Global CSS** (`globals.css`) - shared across app

3. **Different Component Contexts:**
   - Map icon: Part of a section header on the homepage
   - Card icon: Part of the wallet/card stack header

4. **Size Difference:**
   - Map icon is **40% larger** (28px vs 20px) - likely intentional for better visibility on map section

5. **Interactive States:**
   - Card icon has hover/active states (iOS-style interaction)
   - Map icon has no hover states (static appearance)

---

## 4. Map Rendering Issue Diagnosis

### Current Implementation:
**Location:** `src/components/CashMapPopup.tsx` (lines 415-424)

```tsx
<div className={styles.agentPopupMap}>
  <div className={styles.mapContainer} id={mapContainerId} />
  <MapboxMap
    containerId={mapContainerId}
    markers={markers}
    styleUrl="mapbox://styles/mapbox/navigation-night-v1"
    routeCoordinates={routeCoordinates}
    variant="popup"
    hqCoord={{ lng: HQ_COORD.lng, lat: HQ_COORD.lat }}
  />
</div>
```

### CSS Structure:
```css
.agentPopupMap {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.mapContainer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
```

### Potential Issues:

1. **Container ID Timing:**
   - `mapContainerId` is generated with `Date.now()` on component mount
   - MapboxMap may try to render before the DOM element exists
   - **Fix:** Ensure container exists before MapboxMap renders

2. **ActionSheet Portal Timing:**
   - ActionSheet uses `ReactDOM.createPortal` to render outside normal DOM
   - MapboxMap may initialize before the portal is fully mounted
   - **Fix:** Add `open` prop check or delay map initialization

3. **Height/Width Calculation:**
   - Map container has `position: absolute` with `inset: 0`
   - If parent doesn't have explicit height, map may be 0px tall
   - **Fix:** Verify parent container has explicit height (85vh is set)

4. **Overflow Hidden:**
   - `.agentPopupRoot` has `overflow: hidden`
   - This shouldn't prevent rendering, but may clip map canvas
   - **Status:** Likely not the issue

5. **Z-index Layering:**
   - Map is at `z-index: 0`
   - Overlay is at `z-index: 1`
   - **Status:** Correct layering

6. **Mapbox Style Loading:**
   - Using `navigation-night-v1` style
   - Map may fail to load if style isn't ready
   - **Fix:** Check MapboxMap component for style loading checks

---

## 5. Recommended Fixes

### Fix 1: Standardize Help Icons

**Option A: Make map icon match card icon (iOS blue style)**
```css
/* ConvertCashSection.module.css */
.helpBtn {
  width: 20px; /* Match card icon */
  height: 20px; /* Match card icon */
  border-radius: 50%;
  border: 2px solid #007AFF; /* Match card icon */
  background: transparent; /* Match card icon */
  display: flex;
  align-items: center;
  justify-content: center;
  color: #007AFF; /* Match card icon */
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: all 0.2s ease; /* Add transition */
}

.helpBtn:hover {
  background-color: #007AFF;
  color: #fff;
  transform: scale(1.1);
}

.helpBtn:active {
  transform: scale(0.95);
}
```

**Option B: Make card icon match map icon (neutral gray style)**
```css
/* globals.css */
.help-icon {
  height: 28px; /* Match map icon */
  width: 28px; /* Match map icon */
  border-radius: 50%;
  border: 1px solid #e2e2e2; /* Match map icon */
  background: #fff; /* Match map icon */
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(10, 10, 10, 0.7); /* Match map icon */
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
```

**Recommendation:** Option A (make map icon match card icon) for consistency with iOS design language.

---

### Fix 2: Map Rendering Issue

**Root Cause:** MapboxMap component likely initializes before the ActionSheet portal is fully mounted and the container element is available in the DOM.

**Fix: Add conditional rendering based on `open` prop:**

```tsx
// In CashMapPopup.tsx
{open && (
  <ActionSheet open={open} onClose={onClose} title="" size="tall" className={styles.cashMapPopup}>
    <div className={styles.agentPopupRoot}>
      <div className={styles.agentPopupMap}>
        <div className={styles.mapContainer} id={mapContainerId} />
        {open && ( // Only render map when sheet is open
          <MapboxMap
            containerId={mapContainerId}
            markers={markers}
            styleUrl="mapbox://styles/mapbox/navigation-night-v1"
            routeCoordinates={routeCoordinates}
            variant="popup"
            hqCoord={{ lng: HQ_COORD.lng, lat: HQ_COORD.lat }}
          />
        )}
        {/* ... rest of component */}
      </div>
    </div>
  </ActionSheet>
)}
```

**Alternative Fix: Add useEffect to ensure container exists:**

```tsx
// In CashMapPopup.tsx
const [mapReady, setMapReady] = useState(false)

useEffect(() => {
  if (open) {
    // Wait for next tick to ensure DOM is ready
    const timer = setTimeout(() => {
      const container = document.getElementById(mapContainerId)
      if (container) {
        setMapReady(true)
      }
    }, 100)
    return () => clearTimeout(timer)
  } else {
    setMapReady(false)
  }
}, [open, mapContainerId])

// Then conditionally render:
{mapReady && (
  <MapboxMap
    containerId={mapContainerId}
    // ... props
  />
)}
```

**Also check MapboxMap.tsx:**
- Verify it checks if container exists before initializing
- Verify it handles `variant="popup"` correctly
- Check for any early returns that might prevent rendering

---

## 6. Code Diffs Required

### Diff 1: Standardize Map Help Icon
**File:** `src/components/ConvertCashSection.module.css`

```diff
.helpBtn {
-  width: 28px;
-  height: 28px;
+  width: 20px;
+  height: 20px;
  border-radius: 999px;
-  border: 1px solid #e2e2e2;
-  background: #fff;
+  border: 2px solid #007AFF;
+  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
-  color: rgba(10, 10, 10, 0.7);
+  color: #007AFF;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
+  transition: all 0.2s ease;
+}
+
+.helpBtn:hover {
+  background-color: #007AFF;
+  color: #fff;
+  transform: scale(1.1);
+}
+
+.helpBtn:active {
+  transform: scale(0.95);
}
```

### Diff 2: Fix Map Rendering
**File:** `src/components/CashMapPopup.tsx`

```diff
+  const [mapReady, setMapReady] = useState(false)
+
+  useEffect(() => {
+    if (open) {
+      const timer = setTimeout(() => {
+        const container = document.getElementById(mapContainerId)
+        if (container) {
+          setMapReady(true)
+        }
+      }, 100)
+      return () => clearTimeout(timer)
+    } else {
+      setMapReady(false)
+        }
+  }, [open, mapContainerId])

  return (
    <ActionSheet open={open} onClose={onClose} title="" size="tall" className={styles.cashMapPopup}>
      <div className={styles.agentPopupRoot}>
        <div className={styles.agentPopupMap}>
          <div className={styles.mapContainer} id={mapContainerId} />
-          <MapboxMap
+          {mapReady && (
+            <MapboxMap
              containerId={mapContainerId}
              markers={markers}
              styleUrl="mapbox://styles/mapbox/navigation-night-v1"
              routeCoordinates={routeCoordinates}
              variant="popup"
              hqCoord={{ lng: HQ_COORD.lng, lat: HQ_COORD.lat }}
            />
+          )}
```

---

## 7. Summary

**Icon Inconsistencies:**
- Map icon is 40% larger, uses gray styling, no hover states
- Card icon is smaller, uses iOS blue styling, has hover states
- **Fix:** Standardize to iOS blue style (Option A recommended)

**Map Rendering Issue:**
- **Root Cause:** MapboxMap's initialization `useEffect` (line 141-421) runs when component mounts, but ActionSheet uses `ReactDOM.createPortal` which renders asynchronously. The container `<div id={mapContainerId}>` may not exist in DOM when the effect runs. Effect checks `document.getElementById(containerId)` at line 144 - if null, it logs error and returns early. Effect won't re-run because `containerId` is stable (generated once with `useState(() => ...)`).
- **Fix:** Add `mapReady` state with `useEffect` that waits for container to exist in DOM before rendering MapboxMap component


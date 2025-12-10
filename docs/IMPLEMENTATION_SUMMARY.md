# Implementation Summary: Map Help Icon Alignment + Map Rendering Fix

## ✅ Changes Applied

### 1. Map Help Icon Alignment (`ConvertCashSection.module.css`)

**Before:**
- Size: 28px × 28px
- Border: 1px solid #e2e2e2 (gray)
- Background: #fff (white)
- Color: rgba(10, 10, 10, 0.7) (gray)
- Gap: 12px
- No hover/active states

**After:**
- Size: **20px × 20px** (matches card icon)
- Border: **2px solid #007AFF** (iOS blue)
- Background: **transparent** (matches card icon)
- Color: **#007AFF** (iOS blue)
- Gap: **20px** (matches wallet-header)
- **Added hover/active states:**
  - Hover: Background becomes #007AFF, text white, scale(1.1)
  - Active: scale(0.95)

**Result:** Map help icon now visually identical to card help icon.

---

### 2. Map Header Text Alignment (`ConvertCashSection.module.css`)

**Before:**
- Font: Figtree, system-ui
- Font-size: 22px
- Font-weight: 300
- Letter-spacing: 0.08px
- Color: #0a0a0a

**After:**
- Font: **Default font stack** (matches wallet-title)
- Font-size: **22px** (same)
- Font-weight: **300** (same)
- Letter-spacing: **0.08px** (same)
- Color: **#000** (matches wallet-title exactly)

**Result:** Map header text now matches wallet-title styling exactly.

---

### 3. Helicopter Icon Replacement (`MapHelperSheet.tsx`)

**Before:**
```tsx
import { MessageSquare, Package, Plane } from 'lucide-react'
// ...
<Plane size={32} strokeWidth={2} className={styles.icon} />
```

**After:**
```tsx
import { MessageSquare, Package, Plane, Helicopter } from 'lucide-react'
// ...
<Helicopter size={32} strokeWidth={2} className={styles.icon} />
```

**Result:** Plane icon replaced with Helicopter icon in "Request cash courier services" tile.

**Note:** Both icons are available in lucide-react. If you want to revert to Plane, simply change `Helicopter` back to `Plane` in the import and usage.

---

### 4. Map Rendering Fix (`CashMapPopup.tsx`)

**Root Cause:**
- MapboxMap's initialization effect runs before ActionSheet portal mounts the container element
- `document.getElementById(mapContainerId)` returns null on first attempt
- Effect doesn't retry because `containerId` is stable

**Fix Applied:**
1. Added `mapReady` state to track when container exists in DOM
2. Added `useEffect` that waits for container to be available:
   - Initial check after 100ms delay
   - Retry after 200ms if container not found
   - Proper cleanup of all timers
3. Conditionally render MapboxMap only when `mapReady === true`
4. Reset `mapReady` to false when popup closes

**Code Changes:**
```tsx
const [mapReady, setMapReady] = useState(false)

useEffect(() => {
  if (!open) {
    setMapReady(false)
    return
  }

  let retryTimer: NodeJS.Timeout | null = null
  const timer = setTimeout(() => {
    const container = document.getElementById(mapContainerId)
    if (container) {
      setMapReady(true)
    } else {
      retryTimer = setTimeout(() => {
        const retryContainer = document.getElementById(mapContainerId)
        if (retryContainer) {
          setMapReady(true)
        }
      }, 200)
    }
  }, 100)

  return () => {
    clearTimeout(timer)
    if (retryTimer) {
      clearTimeout(retryTimer)
    }
  }
}, [open, mapContainerId])

// In JSX:
{mapReady && (
  <MapboxMap
    containerId={mapContainerId}
    // ... props
  />
)}
```

**Result:** Map now waits for container to exist before initializing, preventing "container not found" errors.

---

## 📋 Files Modified

1. **`src/components/ConvertCashSection.module.css`**
   - Updated `.helpBtn` to match `.help-icon` exactly
   - Updated `.headerRow` gap from 12px to 20px
   - Updated `.mapHeaderTitle` to match `.wallet-title` styling

2. **`src/components/CashMapPopup.tsx`**
   - Added `mapReady` state
   - Added `useEffect` to wait for container DOM element
   - Conditionally render MapboxMap based on `mapReady`
   - Reset `mapReady` on popup close

3. **`src/components/MapHelperSheet.tsx`**
   - Added `Helicopter` to imports
   - Replaced `Plane` with `Helicopter` in Tile 4

---

## ✅ Verification Checklist

- [x] Map help icon matches card help icon (20px, iOS blue, hover states)
- [x] Map header text matches wallet-title styling
- [x] Header gap matches wallet-header gap (20px)
- [x] Helicopter icon replaces Plane icon
- [x] Map rendering fix implemented with proper cleanup
- [x] Build passes without errors
- [x] No linter errors

---

## 🧪 Testing Recommendations

1. **Icon Alignment:**
   - Open homepage and compare map help icon with card help icon
   - Verify both are same size, color, and have hover effects
   - Check spacing between title and icon matches

2. **Map Rendering:**
   - Trigger cash conversion flow to open map popup
   - Verify map renders correctly (not blank)
   - Check console for any "container not found" errors
   - Verify map markers and route line appear

3. **Helicopter Icon:**
   - Open map helper sheet
   - Verify "Request cash courier services" tile shows helicopter icon
   - Check icon size, color, and alignment match other icons

---

## 🔄 Reverting Helicopter to Plane

If you want to revert to Plane icon:

```tsx
// In MapHelperSheet.tsx
import { MessageSquare, Package, Plane } from 'lucide-react'
// Remove Helicopter from import

// In Tile 4:
<Plane size={32} strokeWidth={2} className={styles.icon} />
```


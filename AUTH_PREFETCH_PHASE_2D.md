# Auth Background Prefetch Strategy (Phase 2d)

## Goal
Keep landing page fast by only loading auth-heavy assets when needed, while ensuring auth opens smoothly.

## Implementation

### 1. Prefetch Utility (`src/lib/prefetchAuthImages.ts`)
- Lightweight utility that uses browser's native `link rel="prefetch"` API
- Prefetches both auth background images:
  - `/assets/sign up - first contact.png`
  - `/assets/sign_up - phone2.png`
- Only prefetches once per session (idempotent)
- Next.js automatically serves optimized AVIF/WebP versions

### 2. Auth Store Integration (`src/store/auth.ts`)
Prefetch is triggered automatically when auth is about to open:
- `openAuth()` - Opens auth entry sheet
- `openAuthEntry()` - Opens entry sheet in signup mode
- `openAuthEntryLogin()` - Opens entry sheet in login mode
- `openAuthEntrySignup()` - Opens entry sheet in signup mode
- `requireAuth()` - Guard function that opens auth if not authenticated

### 3. Button Hover/Touch Handlers (`src/components/BottomGlassBar.tsx`)
Prefetch on user interaction with buttons that may trigger auth:
- **Dollar FAB button**: Prefetch on `onMouseEnter` and `onTouchStart` (only if not authed)
- **Profile link**: Prefetch on `onMouseEnter` and `onTouchStart` (only if not authed)

This ensures images are already loading by the time the user clicks.

### 4. Auth Background Images (No Priority)
Confirmed that auth background images do NOT have `priority` prop:
- ✅ `AuthEntrySheet.tsx` - No priority
- ✅ `AuthModal.tsx` - No priority
- ✅ `PhoneSignupSheet.tsx` - No priority

This ensures auth backgrounds don't block landing page load.

## Benefits

1. **Landing Page Performance**: Auth backgrounds are not loaded on first paint
2. **Perceived Speed**: Images start loading on hover/touch, so they're ready when auth opens
3. **Network Efficiency**: Prefetch uses browser's low-priority prefetch queue
4. **No Regressions**: Auth open/close behavior unchanged

## How It Works

1. **User hovers/touches** dollar button or profile link (if not authed)
   → Prefetch starts loading auth backgrounds in background

2. **User clicks** button/link
   → Auth store action calls `prefetchAuthImages()` again (idempotent)
   → Auth modal opens
   → Images are already loading or cached

3. **Auth modal renders**
   → Next.js Image component uses prefetched images
   → Smooth, fast appearance

## Verification

### To Verify Prefetch is Working:
1. Open DevTools → Network tab
2. Filter by "Img" or "Image"
3. Hover over dollar button or profile link (if not authed)
4. Check Network tab - should see prefetch requests for auth backgrounds
5. Click to open auth
6. Images should load quickly (already prefetched)

### Expected Behavior:
- ✅ Landing page loads fast (no auth images on first paint)
- ✅ Auth opens smoothly (images prefetched)
- ✅ No console spam
- ✅ No UI changes
- ✅ Auth open/close behavior unchanged

## Files Modified

1. `src/lib/prefetchAuthImages.ts` (new) - Prefetch utility
2. `src/store/auth.ts` - Added prefetch to auth store actions
3. `src/components/BottomGlassBar.tsx` - Added hover/touch handlers

## Notes

- Prefetch is idempotent (only runs once per session)
- Uses browser's native prefetch API (lightweight, non-blocking)
- Next.js automatically serves optimized AVIF/WebP versions
- Prefetch only happens when user is not authed (optimization)


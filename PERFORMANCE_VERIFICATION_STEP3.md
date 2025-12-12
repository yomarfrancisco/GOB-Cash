# Step 3 — iOS First Paint Verification

## Changes Made (Steps 1-2)

### Step 1: Production Console Spam Elimination
**Commit**: `f225371` - `perf: dev-gate noisy logs (prod quiet)`

**What Changed**:
- Created `src/lib/logger.ts` with dev-gated logging utilities
- Replaced all noisy `console.log/debug/warn` calls with `devLog/devWarn/devDebug`
- Affected modules: ContactSync, GraphEdges, GhostQuality, RankContacts, useUserContactsForUI
- **Impact**: Reduced JavaScript execution time in production (no console overhead)

**Files Modified**:
- `src/lib/logger.ts` (new)
- `src/config/contactSync.ts`
- `src/lib/contacts.ts`
- `src/lib/contacts/rankContacts.ts`
- `src/lib/google/contacts.ts`
- `src/hooks/useUserContactsForUI.ts`
- `src/hooks/useSyncContacts.ts`
- `src/lib/socialGraph.ts`
- `src/lib/ghostQuality.ts`

### Step 2a: AMR Avatar Optimization
**Commits**: `775c746`, `2354907`, `a1f95ba` - `perf: next/image for AMR avatar (no UI change, quality 92)`

**What Changed**:
- Removed `unoptimized` flag from AMR avatar (`/assets/Brics-girl-blue.png`) across all components
- Added `quality={92}` and proper `sizes` attributes
- **Impact**: Faster image delivery via Next.js Image optimization (WebP conversion, responsive sizing)

**Files Modified**:
- `src/components/notifications/TopNotifications.tsx` (38px, quality 92)
- `src/components/ConvertNotificationBanner.tsx` (38px, quality 92)
- `src/components/ChatAvatarButton.tsx` (56px, quality 92)
- `src/components/Inbox/FinancialInboxSheet.tsx` (38px, 31px, quality 92)
- `src/components/BabyCdoChatSheet.tsx` (32px, 24px, quality 92)

### Step 2b: Commercial Cards Optimization
**Commit**: `ec0df5f` - `perf: next/image for commercial cards (quality 92, no shimmer)`

**What Changed**:
- Added `quality={92}` to all commercial card poster images
- Added proper `sizes` attribute: `(max-width: 768px) 100vw, 398px`
- Added `placeholder="empty"` (no shimmer effect yet)
- Limited `priority` to first 1-2 cards only (index < 2) - lazy loading for rest
- Optimized header avatars (40px) and footer avatars (31px) with quality 92
- **Impact**: Faster image delivery, reduced initial load (only first 2 cards prioritized)

**Files Modified**:
- `src/components/HomeStreamSection.tsx` (poster images, header avatars, footer avatars)

---

## iOS Verification Checklist

### ✅ What to Test on iPhone Safari / iOS Chrome:

1. **First Paint Speed**
   - [ ] App loads quickly (no long blank screen)
   - [ ] Initial content appears within 1-2 seconds on 4G
   - [ ] No obvious delays before UI becomes interactive

2. **Visual Quality**
   - [ ] AMR avatars appear sharp (not pixelated)
   - [ ] Commercial card images appear sharp and clear
   - [ ] No quality degradation compared to before
   - [ ] Cards and other images maintain visual quality

3. **Layout Stability**
   - [ ] No layout shifts when images load
   - [ ] No jumping/reflow of content
   - [ ] Smooth transitions between states

4. **Performance Metrics** (if possible)
   - [ ] Lighthouse Performance score (target: >70 on mobile)
   - [ ] First Contentful Paint (FCP) < 2.5s
   - [ ] Largest Contentful Paint (LCP) < 4.0s
   - [ ] Cumulative Layout Shift (CLS) < 0.1

---

## Confirmation Status

### ✅ Expected Improvements:
- **Console overhead removed**: Faster JS execution in production (no console spam)
- **AMR avatar optimized**: Faster image delivery (WebP, responsive sizes) - 5 components
- **Commercial cards optimized**: Faster poster image delivery, lazy loading for cards 3+
- **No quality loss**: Quality 92 maintains visual fidelity across all optimized images
- **No layout shifts**: Dimensions preserved, proper `sizes` attributes
- **Reduced initial load**: Only first 2 commercial cards prioritized, rest lazy-loaded

### ⚠️ Remaining Slow-Loading Assets (Not Yet Optimized):

#### High Priority (Above-the-fold, Always Visible):
1. **TopGlassBar images** (`src/components/TopGlassBar.tsx`):
   - Glass shard: `/assets/core/glass-top-4.png` (729x713px) - `unoptimized`, `priority`
   - Spraypaint: `/assets/core/spraypaint-2.png` (300x120px) - `unoptimized`, `priority`
   - Logo: `/assets/core/goBankless_logo4x.png` (198x59px) - `unoptimized`, `priority`
   - **Impact**: These are above-the-fold and affect first paint

2. **Dollar Sign Button** (`src/components/BottomGlassBar.tsx`):
   - `/assets/core/dollar-sign2.png` (60x60px) - `unoptimized`
   - **Impact**: Always visible in bottom nav

#### Medium Priority (Visible on Home Page):
3. **Card Stack Images** (`src/components/CardStackCard.tsx`):
   - Card images (savings, yield, etc.) - `unoptimized`, `priority={isTop}` only
   - **Impact**: Top card is above-the-fold

4. **Commercial Cards** (`src/components/HomeStreamSection.tsx`):
   - ✅ **OPTIMIZED** - Poster images now have `quality={92}`, `sizes`, `placeholder="empty"`
   - ✅ **OPTIMIZED** - Header and footer avatars optimized
   - ✅ **OPTIMIZED** - Priority limited to first 1-2 cards only

#### Low Priority (Below-the-fold or Conditional):
5. **Map fallback image** (`src/components/MapboxMap.tsx`):
   - `/assets/map.png` - No optimization props
   - **Impact**: Only shown on error

---

## Next Steps (After Verification)

If Step 3 verification passes:
- **Step 4**: Add shimmer/placeholder effects for perceived loading speed
- **Future**: Optimize remaining assets (TopGlassBar, dollar sign, cards)

If issues found:
- Investigate specific problem areas
- Roll back if quality/layout issues detected
- Fix before proceeding to Step 4

---

## Notes

- All changes are **reversible** (no structural changes)
- Quality set to 92 (high quality, visually identical to original)
- No global config changes that might affect other images
- Incremental approach: one asset type at a time


# Asset Consolidation Audit

## Directory Structure

```
/public/assets/
  core/
    - gobankless-logo.png ✓
    - glass-top-1.png ✓
    - glass-bottom-1.png ✓
    - dollar-sign.png ✓
    - scan.svg ✓
    - export.svg ✓
    - spraypaint-2.png ✗ MISSING (commented out in code)
  nav/
    - home.svg ✓
    - user-outlined.svg ✓
  cards/
    - card-pepe.jpg ✓
    - card-savings.jpg ✓
    - card-yield.jpg ✓
  profile/
    - headshot.jpg ✗ MISSING (needs to be moved from /public/profile-headshot.jpg)
    - sandton.jpg ✗ MISSING (needs to be moved from /public/sandton-bg.jpg)
    - verified.svg ✓
    - email_outlined.svg ✓
    - instagram.svg ✓
    - linkedin.svg ✓
    - tik_tok.svg ✓
    - link.svg ✓
    - poi_outlined.svg ✓
    - add_circle_outlined.svg ✓
    - calendar_month.svg ✓
    - call.svg ✓
    - chevron_right.svg ✓
    - credit_cards.svg ✓
    - incognito.svg ✓
    - group_equal_outline.svg ✓ (renamed from "group_equal outline.svg")
    - location-pin.svg ✓
    - location.svg ✓
    - mail.svg ✓
    - calendar.svg ✓
    - star.svg ✓
    - dot.svg ✓
```

## Missing Assets

1. **`/public/assets/core/spraypaint-2.png`** - Referenced in `TopGlassBar.tsx` but commented out. Currently missing.
2. **`/public/assets/profile/headshot.jpg`** - Expected location: `/public/profile-headshot.jpg` → `/public/assets/profile/headshot.jpg`
3. **`/public/assets/profile/sandton.jpg`** - Expected location: `/public/sandton-bg.jpg` → `/public/assets/profile/sandton.jpg`

## Unused Files (in root `/public/assets/`)

These files are not referenced in the codebase:
- `b4e7524a428dcab78d60770288cfebc8d2cc09cf (3).png`
- `f258ad332dd69be5afc6d12bea1010db3be66ff6.png`
- `glass-top-2.png`

## Path Updates

All asset paths have been updated to use the new directory structure:
- Core assets: `/assets/core/...`
- Navigation assets: `/assets/nav/...`
- Card assets: `/assets/cards/...`
- Profile assets: `/assets/profile/...`

## Build Status

✅ Lint: Passed
✅ Build: Passed
✅ All referenced assets (except missing ones) are in correct locations


# ActionSheet Icons

This directory contains optimized icons for the ActionSheet components.

## Required Icons

1. **usdt-icon.webp** (64×64 or 96×96, <20KB)
   - USDT/Tether icon for the "Share USDT address" row
   - WebP format preferred for optimal compression
   - Fallback: `/assets/Tether.png`

2. **profile-icon.webp** (64×64 or 96×96, <20KB) - Optional
   - Profile icon for the "Share profile" row
   - Currently using Avatar component, but can be replaced with static icon if needed

## Optimization Guidelines

- **Size**: 64×64 or 96×96 pixels
- **Format**: WebP preferred, PNG as fallback
- **File size**: <20KB per icon
- **Background**: Transparent or white

## Current Status

Icons are preloaded at page load via:
- `<link rel="preload">` in `src/app/layout.tsx`
- `prefetchActionSheetIcons()` called in `src/app/page.tsx`

The `ActionSheetIcon` component handles:
- WebP → PNG fallback
- Letter placeholder while loading
- Grey circle background until image loads


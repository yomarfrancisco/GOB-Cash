# Avatar Casing & Verified Badge Positioning Guide

## Overview

This guide explains how to position the casing (Union.svg) and verified badge (verified.svg) relative to an avatar image in a way that maintains proportional relationships regardless of the avatar size.

---

## Component Structure

The verified marker consists of three layers stacked in a container:

```
Container (base size)
├── Casing Layer (Union.svg) - background
├── Avatar Layer (circular image) - middle
└── Verified Badge Layer (verified.svg) - foreground
```

---

## 1. Container Size (Base Reference)

**The container is the base unit for all proportional calculations.**

- **Current implementation:** 56px × 56px
- **Variable name suggestion:** `CONTAINER_SIZE` or `MARKER_SIZE`

**All other dimensions and positions are calculated relative to this container size.**

---

## 2. Casing (Union.svg) Positioning

### Size
- **Proportional relationship:** 100% of container (1:1 ratio)
- **Formula:** `casingSize = containerSize × 1.0`
- **Current:** 56px × 56px

### Position
- **Base position:** `position: absolute; inset: 0;` (fills container exactly)
- **Offset:** Apply a small offset to fine-tune alignment
  - **Horizontal offset:** `1px` to the right (or `containerSize × 0.0179` ≈ 1.8%)
  - **Vertical offset:** `1px` down (or `containerSize × 0.0179` ≈ 1.8%)
- **Implementation:** `transform: translate(1px, 1px);` or `transform: translate(containerSize × 0.0179, containerSize × 0.0179);`

**Note:** The offset is minimal and can be adjusted based on visual alignment needs. For a 56px container, 1px ≈ 1.79% of container size.

---

## 3. Avatar Positioning

### Size
- **Proportional relationship:** 64.29% of container (9:14 ratio)
- **Formula:** `avatarSize = containerSize × 0.6429`
- **Current:** 36px × 36px (56px × 0.6429 = 36px)

### Position
- **Centering method:** Use absolute positioning with transform
- **Horizontal:** `left: 50%; transform: translateX(-50%);`
- **Vertical:** `top: 50%; transform: translateY(-55%);` (slightly above center)
- **Combined:** `top: 50%; left: 50%; transform: translate(-50%, -55%);`

**Key insight:** The `-55%` vertical offset (instead of `-50%`) moves the avatar slightly upward within the casing. This is approximately `containerSize × 0.0893` (5px for a 56px container).

### Shape
- **Border radius:** 50% (perfect circle)
- **Overflow:** `hidden` (clips to circle)

---

## 4. Verified Badge Positioning

### Size
- **Proportional relationship to container:** 19.29% of container
- **Proportional relationship to avatar:** 30% of avatar size
- **Formula (using avatar):** `badgeSize = avatarSize × 0.3`
- **Formula (using container):** `badgeSize = containerSize × 0.1929`
- **Current:** 10.8px × 10.8px (36px × 0.3 = 10.8px)

**Recommendation:** Use avatar-based calculation for better visual relationship: `badgeSize = avatarSize × 0.3`

### Position
- **Positioning method:** Absolute positioning from top-right corner
- **Horizontal offset from right edge:**
  - **Proportional:** `right = containerSize × 0.0804` (≈ 8.04%)
  - **Current:** 4.5px (56px × 0.0804 = 4.5px)
- **Vertical offset from top edge:**
  - **Proportional:** `top = containerSize × 0.0536` (≈ 5.36%)
  - **Current:** 3px (56px × 0.0536 = 3px)

**Implementation:**
```css
.verifiedBadgeWrapper {
  position: absolute;
  top: containerSize × 0.0536;  /* 3px for 56px container */
  right: containerSize × 0.0804; /* 4.5px for 56px container */
  width: avatarSize × 0.3;       /* 10.8px for 36px avatar */
  height: avatarSize × 0.3;
  z-index: 3; /* Above all other layers */
}
```

---

## 5. Proportional Relationships Summary

### Size Ratios

| Element | Ratio to Container | Ratio to Avatar | Current (56px container) |
|---------|-------------------|-----------------|-------------------------|
| **Container** | 1.0 (100%) | - | 56px |
| **Casing** | 1.0 (100%) | 1.556× | 56px |
| **Avatar** | 0.6429 (64.29%) | 1.0 (100%) | 36px |
| **Badge** | 0.1929 (19.29%) | 0.3 (30%) | 10.8px |

### Position Offsets (as percentage of container)

| Element | Horizontal | Vertical | Current (56px container) |
|---------|-----------|---------|-------------------------|
| **Casing offset** | +1.79% | +1.79% | +1px, +1px |
| **Avatar vertical offset** | 0% (centered) | -8.93% | -5px (via -55% transform) |
| **Badge from top-right** | -8.04% (from right) | +5.36% (from top) | right: 4.5px, top: 3px |

---

## 6. Implementation Formula (Scalable)

For any container size `C`, calculate dimensions as follows:

```javascript
// Base container size
const containerSize = C; // e.g., 56px

// Casing (Union.svg)
const casingSize = containerSize; // 100% of container
const casingOffsetX = containerSize * 0.0179; // 1px for 56px
const casingOffsetY = containerSize * 0.0179; // 1px for 56px

// Avatar
const avatarSize = containerSize * 0.6429; // 64.29% of container
const avatarOffsetY = containerSize * 0.0893; // -5px for 56px (via -55% transform)

// Verified Badge
const badgeSize = avatarSize * 0.3; // 30% of avatar (or containerSize * 0.1929)
const badgeRight = containerSize * 0.0804; // 4.5px for 56px
const badgeTop = containerSize * 0.0536; // 3px for 56px
```

---

## 7. CSS Implementation Example

```css
/* Container */
.verifiedMarker {
  position: relative;
  width: var(--container-size, 56px);
  height: var(--container-size, 56px);
}

/* Casing */
.markerBackground {
  position: absolute;
  inset: 0;
  transform: translate(
    calc(var(--container-size, 56px) * 0.0179),
    calc(var(--container-size, 56px) * 0.0179)
  );
  z-index: 1;
}

/* Avatar */
.avatarWrapper {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -55%);
  width: calc(var(--container-size, 56px) * 0.6429);
  height: calc(var(--container-size, 56px) * 0.6429);
  border-radius: 50%;
  overflow: hidden;
  z-index: 2;
}

/* Verified Badge */
.verifiedBadgeWrapper {
  position: absolute;
  top: calc(var(--container-size, 56px) * 0.0536);
  right: calc(var(--container-size, 56px) * 0.0804);
  width: calc(var(--container-size, 56px) * 0.6429 * 0.3);
  height: calc(var(--container-size, 56px) * 0.6429 * 0.3);
  z-index: 3;
}
```

---

## 8. Key Principles

1. **Container is the base unit:** All calculations start from the container size
2. **Avatar is 64.29% of container:** This maintains the visual balance
3. **Badge is 30% of avatar:** This keeps the badge proportional to the avatar, not the container
4. **Casing fills container:** 100% size with minimal offset for fine-tuning
5. **Badge sits in top-right:** Positioned as a percentage from the top-right corner
6. **Avatar is slightly above center:** The -55% vertical offset creates better visual balance

---

## 9. Testing Different Sizes

To test with a different container size (e.g., 48px for unverified markers):

```javascript
const testContainerSize = 48;

// Results:
// Casing: 48px × 48px
// Avatar: 48 × 0.6429 = 30.86px (round to 31px)
// Badge: 30.86 × 0.3 = 9.26px (round to 9.3px)
// Badge position: top: 2.57px, right: 3.86px
```

**Note:** For pixel-perfect rendering, you may need to round to whole pixels or use sub-pixel values depending on browser support.

---

## 10. Current Implementation Values (Reference)

Based on the current 56px container implementation:

- **Container:** 56px × 56px
- **Casing:** 56px × 56px, offset: `translate(1px, 1px)`
- **Avatar:** 36px × 36px, centered with `translate(-50%, -55%)`
- **Badge:** 10.8px × 10.8px, positioned at `top: 3px; right: 4.5px;`

These values maintain the proportional relationships described above.

---

## End of Guide

This guide provides all the proportional relationships needed to recreate the avatar casing and verified badge positioning at any scale while maintaining visual consistency.


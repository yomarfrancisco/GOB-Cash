# Helper Card and Map Teasers — Reuse Documentation

This document describes how the helper sheet components (`WalletHelperSheet` and `MapHelperSheet`) render their card and map visuals, and provides a recipe for reusing these visuals inside other components (e.g., chat message bubbles).

---

## 1. Component Locations

### Map Helper Sheet
- **Component:** `src/components/MapHelperSheet.tsx`
- **Styles:** `src/components/MapHelperSheet.module.css`
- **Purpose:** Shows "Discover dealers around you" map preview tile and other map-related helper tiles

### Wallet Helper Sheet (Card Helper)
- **Component:** `src/components/WalletHelperSheet.tsx`
- **Styles:** `src/components/WalletHelperSheet.module.css`
- **Purpose:** Shows wallet card previews (PEPE, ZAR, ETH, MZN, BTC) with cropped card art and APY information

---

## 2. Map Helper Visual — "Discover dealers around you" Tile

### Component Tree

```
<div className={styles.tile}>
  <div className={styles.mapPreview}>
    <Image
      src="/assets/map2.png"
      alt="Map preview"
      fill
      className={styles.mapImage}
      sizes="100%"
      priority
      unoptimized
    />
  </div>
  <h3 className={styles.mapTitle}>Discover dealers around you</h3>
  <p className={styles.mapSubtext}>Use the map to see who is near you</p>
</div>
```

### Image Rendering Details

**Container (`.mapPreview`):**
- `position: relative` (required for `fill` Image)
- `width: 100%`
- `height: 140px` (fixed height)
- `border-radius: 24px`
- `overflow: hidden` (enforces cropping)
- `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15)`
- `background: #e5e5ea` (fallback while loading)

**Image (`.mapImage`):**
- Next.js `Image` component with `fill` prop
- `position: absolute` (via `fill`)
- `inset: 0` (via `fill`)
- `width: 100%`
- `height: 100%`
- `object-fit: cover`
- `object-position: center`
- `sizes="100%"` (responsive sizing hint)
- `priority` (preloads image)
- `unoptimized` (bypasses Next.js optimization)

### Layout & Spacing

**Tile Container (`.tile`):**
- `width: 100%`
- `border-radius: 24px`
- `background: #f2f2f7`
- `padding: 24px 20px`
- `display: flex`
- `flex-direction: column`
- `align-items: center`
- `text-align: center`
- `gap: 8px` (vertical spacing between children)

**Map Preview Container:**
- `margin-bottom: 16px` (spacing below map image)

**Text Elements:**
- `.mapTitle`: `font-size: 16px`, `font-weight: 600`, `margin: 8px 0 0 0`
- `.mapSubtext`: `font-size: 14px`, `font-weight: 400`, `color: rgba(10, 10, 10, 0.6)`, `margin: 0`

### Visual Effects

- **Border Radius:** 24px on tile, 24px on map preview
- **Box Shadow:** `0 4px 12px rgba(0, 0, 0, 0.15)` on map preview
- **No gradients or overlays** on the map preview tile

### Animations

- **None** — static tile, no animations or transitions

---

## 3. Card Helper Visual — Wallet Card Preview Tile

### Component Tree

```
<div className={styles.tile}>
  <div className={styles.cardPreviewContainer}>
    {/* APY Pill (optional overlay) */}
    <div className={styles.apyPill}>
      <span className={styles.apyPercentage}>9.38%</span>
      <span className={styles.apyLabel}>annual yield</span>
    </div>
    {/* Card Preview */}
    <div className={styles.cardPreview}>
      <Image
        src={cardImage}  // e.g., "/assets/cards/card-pepe.jpg"
        alt={title}     // e.g., "PEPE wallet"
        fill
        className={styles.cardImage}
        sizes="204px"
        unoptimized
      />
    </div>
  </div>
  <h3 className={styles.apyHeading}>Earn 9% annually on your deposits</h3>
  <p className={styles.apySubtext}>Compounded monthly</p>
</div>
```

### Image Rendering Details

**Outer Container (`.cardPreviewContainer`):**
- `position: relative` (for absolute positioning of APY pill)
- `width: 100%`
- `display: flex`
- `justify-content: center`
- `align-items: center`
- `margin-bottom: 8px`

**Card Preview Container (`.cardPreview`):**
- `width: 204px` (fixed width)
- `height: 85px` (fixed height — crops card to show top third/half)
- `border-radius: 17px`
- `overflow: hidden` (enforces cropping)
- `position: relative` (required for `fill` Image)
- `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15)`
- `background: #fff` (fallback)

**Card Image (`.cardImage`):**
- Next.js `Image` component with `fill` prop
- `position: absolute` (via `fill`)
- `top: 0`
- `left: 0`
- `width: 100%`
- `height: 170px` (full card height, but container crops to 85px)
- `object-fit: cover`
- `object-position: top center` (shows top portion of card)
- `sizes="204px"` (responsive sizing hint)
- `unoptimized` (bypasses Next.js optimization)

**APY Pill (`.apyPill`) — Optional Overlay:**
- `position: absolute`
- `top: -12px` (positioned above card)
- `left: 50%`
- `transform: translateX(-50%)` (centered horizontally)
- `z-index: 2` (above card image)
- `display: inline-flex`
- `align-items: center`
- `gap: 4px`
- `padding: 6px 12px`
- `border-radius: 20px`
- `background: rgba(0, 0, 0, 0.75)`
- `backdrop-filter: blur(8px)`
- `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2)`

### Layout & Spacing

**Tile Container (`.tile`):**
- Same as map helper tile (see above)

**Card Preview Container:**
- `margin-bottom: 8px` (spacing below card)

**Text Elements:**
- `.apyHeading`: `font-size: 16px`, `font-weight: 600`, `margin: 8px 0 0 0`
- `.apySubtext`: `font-size: 14px`, `font-weight: 400`, `color: rgba(10, 10, 10, 0.6)`, `margin: 0`

### Visual Effects

- **Border Radius:** 24px on tile, 17px on card preview
- **Box Shadow:** `0 4px 12px rgba(0, 0, 0, 0.15)` on card preview
- **APY Pill:** Dark semi-transparent background with blur effect

### Animations

- **None** — static tile, no animations or transitions

### Card Image Sources

The component uses a mapping of wallet keys to card images:

```typescript
const cardImages: Record<WalletKey, string> = {
  savings: '/assets/cards/card-savings.jpg',
  pepe: '/assets/cards/card-pepe.jpg',
  yield: '/assets/cards/card-ETH.jpg',
  mzn: '/assets/cards/card-MZN.jpg',
  btc: '/assets/cards/card-BTC.jpg',
}
```

---

## 4. Reuse Recipe — Embedding Helper Tiles in Chat Messages

### Minimal JSX for Card Helper Tile (without APY pill)

If you want to embed a card preview tile inside a chat message bubble, use this minimal structure:

```tsx
import Image from 'next/image'
import styles from '@/components/WalletHelperSheet.module.css'

// Inside your chat message component:
<div className={styles.tile}>
  <div className={styles.cardPreviewContainer}>
    <div className={styles.cardPreview}>
      <Image
        src="/assets/cards/card-pepe.jpg"  // or any card image
        alt="PEPE wallet"
        fill
        className={styles.cardImage}
        sizes="204px"
        unoptimized
      />
    </div>
  </div>
  <h3 className={styles.apyHeading}>Your card title</h3>
  <p className={styles.apySubtext}>Your subtitle</p>
</div>
```

### Minimal JSX for Map Helper Tile

```tsx
import Image from 'next/image'
import styles from '@/components/MapHelperSheet.module.css'

// Inside your chat message component:
<div className={styles.tile}>
  <div className={styles.mapPreview}>
    <Image
      src="/assets/map2.png"
      alt="Map preview"
      fill
      className={styles.mapImage}
      sizes="100%"
      priority
      unoptimized
    />
  </div>
  <h3 className={styles.mapTitle}>Discover dealers around you</h3>
  <p className={styles.mapSubtext}>Use the map to see who is near you</p>
</div>
```

### Required CSS Imports

You must import the CSS module from the helper sheet component:

```tsx
// For card helper:
import styles from '@/components/WalletHelperSheet.module.css'

// For map helper:
import styles from '@/components/MapHelperSheet.module.css'
```

### Constraints & Requirements

1. **Parent Container:**
   - Should be `display: block` or `display: flex` (not inline)
   - Should have sufficient width (tiles are `width: 100%` of parent)
   - No specific min-width required, but tiles look best at ~280px+ width

2. **Image Requirements:**
   - Parent of Image component with `fill` must have `position: relative`
   - Container must have fixed `height` (140px for map, 85px for card)
   - Container must have `overflow: hidden` to enforce cropping

3. **Spacing Considerations:**
   - Tiles have `padding: 24px 20px` internally
   - If embedding in a chat bubble, ensure bubble padding doesn't conflict
   - Tiles stack vertically with `gap: 20px` when multiple tiles are in a flex column

4. **Responsive Behavior:**
   - Tiles are designed for mobile-first (full-width within parent)
   - No specific breakpoints or responsive rules in the tile CSS
   - Works well in constrained widths (e.g., chat bubbles)

5. **No Animations:**
   - Tiles are static — no scroll-in, hover, or motion effects
   - Safe to embed in scrollable containers without animation conflicts

### Example: Embedding in Chat Message Bubble

```tsx
// In your chat message component:
<div className={chatStyles.messageBubble}>
  <p>Here's your PEPE wallet card:</p>
  
  {/* Embedded card helper tile */}
  <div className={walletHelperStyles.tile} style={{ marginTop: '12px' }}>
    <div className={walletHelperStyles.cardPreviewContainer}>
      <div className={walletHelperStyles.cardPreview}>
        <Image
          src="/assets/cards/card-pepe.jpg"
          alt="PEPE wallet"
          fill
          className={walletHelperStyles.cardImage}
          sizes="204px"
          unoptimized
        />
      </div>
    </div>
    <h3 className={walletHelperStyles.apyHeading}>PEPE wallet</h3>
    <p className={walletHelperStyles.apySubtext}>Your crypto wallet</p>
  </div>
</div>
```

**Note:** You may need to adjust the chat bubble's padding or add a wrapper to prevent overflow issues.

---

## 5. Sanity Summary

### Recommended Component for Ama's Intro Message

**Recommendation: Use the Card Helper Tile (Wallet Helper Sheet visual)**

**Reasoning:**
1. **More compact:** Card preview is 85px tall vs. map preview's 140px — better fits in chat bubble
2. **More relevant:** Ama is an Investment Manager, so showing a wallet card (e.g., PEPE or ZAR) is contextually appropriate
3. **Cleaner visual:** Card preview with optional APY pill is a polished, self-contained visual
4. **Better aspect ratio:** 204px × 85px fits well in typical chat message widths

**Specific Recommendation:**
- Use the **PEPE wallet card** tile (or ZAR/savings card) as it's visually distinctive and commonly shown in the demo
- Include the APY pill overlay for added visual interest
- Keep the text minimal ("PEPE wallet" or similar) to match chat context

### Potential Gotchas & Risks

1. **Overflow in Chat Bubble:**
   - Chat bubbles may have padding that conflicts with tile padding
   - **Solution:** Wrap tile in a container with negative margin or adjust bubble padding

2. **Image Loading:**
   - Card images are `unoptimized` and may take time to load
   - **Solution:** Use `priority` prop if tile is above the fold, or preload images

3. **Width Constraints:**
   - Tiles are `width: 100%` — ensure chat bubble has sufficient width
   - **Solution:** Set a min-width on chat bubble or use a constrained tile width variant

4. **Z-index Conflicts:**
   - APY pill uses `z-index: 2` — ensure no chat UI elements overlap
   - **Solution:** Check z-index stacking context in chat component

5. **CSS Module Scoping:**
   - Importing styles from helper sheet may cause class name collisions
   - **Solution:** Use CSS module aliases or create a shared styles file if needed

6. **Scroll Behavior:**
   - If chat messages are scrollable, ensure tiles don't cause layout shifts
   - **Solution:** Reserve space for tile height or use `aspect-ratio` fallback

### Self-Containment Assessment

✅ **Both helper components are self-contained enough to be embedded:**

- **Card Helper:** ✅ Fully self-contained — JSX + CSS module can be copied into any component
- **Map Helper:** ✅ Fully self-contained — JSX + CSS module can be copied into any component

**No external dependencies beyond:**
- Next.js `Image` component
- CSS module imports
- Image assets (`/assets/cards/*.jpg`, `/assets/map2.png`)

**No shared state, context, or complex logic** — pure presentational components.

---

## 6. File Reference Summary

### Map Helper
- **Component:** `src/components/MapHelperSheet.tsx` (lines 25-40)
- **Styles:** `src/components/MapHelperSheet.module.css`
  - `.tile` (lines 33-43)
  - `.mapPreview` (lines 46-55)
  - `.mapImage` (lines 58-66)
  - `.mapTitle` (lines 144-151)
  - `.mapSubtext` (lines 154-161)

### Card Helper
- **Component:** `src/components/WalletHelperSheet.tsx` (lines 44-66)
- **Styles:** `src/components/WalletHelperSheet.module.css`
  - `.tile` (lines 22-32)
  - `.cardPreviewContainer` (lines 35-42)
  - `.cardPreview` (lines 76-84)
  - `.cardImage` (lines 87-95)
  - `.apyPill` (lines 44-58) — optional
  - `.apyHeading` (lines 97-104)
  - `.apySubtext` (lines 106-113)

---

**Last Updated:** 2024-12-19
**Status:** Ready for implementation — components are documented and reuse recipe is complete.


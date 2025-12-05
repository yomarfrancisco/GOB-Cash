# Wallet Helper Sheet Design Specification

Complete design specification for the card helper popup (WalletHelperSheet) that appears when users tap the "?" icon next to wallet titles on the home page.

---

## 1. Base Component Structure

### ActionSheet Component
The helper sheet uses the `ActionSheet` component as its base container.

**Component Props:**
```typescript
<ActionSheet
  open={!!walletKey}
  onClose={onClose}
  title={walletTitleMap[walletKey]}  // e.g., "ZAR wallet", "ETH wallet"
  size="tall"  // Uses tall variant (85vh max-height)
>
  {/* Content */}
</ActionSheet>
```

**Sheet Container (`.as-sheet.as-sheet-tall`):**
- **Position:** `absolute`
- **Horizontal:** `left: 50%`, `right: 0`, `transform: translateX(-50%)`
- **Vertical:** `bottom: 0`
- **Width:** `100%`, `max-width: 430px`
- **Height:** `max-height: 85vh` (tall variant)
- **Background:** `#fff` (white)
- **Border Radius:** `32px 32px 0 0` (rounded top corners only)
- **Box Shadow:**
  - `0 -4px 100px rgba(0, 0, 0, 0.25)`
  - `0 20px 60px rgba(0, 0, 0, 0.35)`
- **Outline:** `1px solid rgba(255, 255, 255, 0.06)`
- **Padding Bottom:** `calc(env(safe-area-inset-bottom) + 16px)`
- **Animation:** `slideUp 600ms cubic-bezier(0.4, 0, 0.2, 1)`
- **Z-index:** `10000` (via `.as-root`)

**Overlay (`.as-overlay`):**
- **Position:** `absolute`, `inset: 0`
- **Background:** `rgba(0, 0, 0, 0.35)`
- **Backdrop Filter:** `saturate(110%) blur(1px)`
- **Transition:** `opacity 600ms cubic-bezier(0.4, 0, 0.2, 1)`

---

## 2. Header Section

**Container (`.as-header`):**
- **Position:** `relative`
- **Padding:** `var(--sheet-header-offset, 64px) 24px 0 24px`
- **Flex:** `flex-shrink: 0`

**Title (`.as-title`):**
- **Font Family:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Font Size:** `22px`
- **Font Weight:** `300` (light)
- **Line Height:** `1.2`
- **Letter Spacing:** `-0.22px`
- **Color:** `#0a0a0a` (near black)
- **Text Align:** `left`
- **Margin:** `0`

**Close Button (`.as-close`):**
- **Position:** `absolute`
- **Top:** `16px`
- **Right:** `16px`
- **Size:** `32px × 32px`
- **Border Radius:** `50%` (circular)
- **Background:** `rgba(0, 0, 0, 0.05)`
- **Display:** `flex`, `align-items: center`, `justify-content: center`
- **Cursor:** `pointer`
- **Transition:** `background 200ms ease`
- **Hover Background:** `#D1D1D6`
- **Active Background:** `#C7C7CC`

**Close Icon:**
- **Source:** `/assets/clear.svg`
- **Size:** `18px × 18px`
- **Color:** Inherited (black)

---

## 3. Body Container

**Container (`.as-body`):**
- **Overflow:** `overflow-y: auto`, `overflow-x: hidden`
- **Padding:** `0 24px` (default, but WalletHelperSheet overrides with custom padding)
- **Scroll:** `-webkit-overflow-scrolling: touch`
- **Overscroll:** `overscroll-behavior: contain`

**Content Wrapper (`.content` from WalletHelperSheet.module.css):**
- **Padding:** `24px 20px 32px`
- **Display:** `flex`, `flex-direction: column`
- **Gap:** `20px` (vertical spacing between tiles)
- **Max Height:** `calc(85vh - 100px)` (accounts for header)
- **Overflow:** `overflow-y: auto`
- **Scroll:** `-webkit-overflow-scrolling: touch`

---

## 4. Description Text

**Element:** `<p className={styles.description}>`

**Typography:**
- **Font Family:** `'Inter', system-ui, -apple-system, sans-serif`
- **Font Size:** `16px`
- **Font Weight:** `400` (regular)
- **Line Height:** `1.5`
- **Color:** `rgba(10, 10, 10, 0.7)` (70% opacity black)
- **Margin:** `0 0 4px 0`

**Content Example:**
"A savings account that earns interest on your deposits while enabling you to make direct payments on the app"

---

## 5. Tile Components

All tiles share a base structure with consistent styling.

### Base Tile Styles (`.tile`)

**Container:**
- **Width:** `100%`
- **Border Radius:** `24px`
- **Background:** `#f2f2f7` (light gray)
- **Padding:** `24px 20px`
- **Display:** `flex`, `flex-direction: column`
- **Align Items:** `center`
- **Text Align:** `center`
- **Gap:** `8px` (vertical spacing between elements)

---

## 6. Tile 1: Card Preview + APY

### Card Preview Container (`.cardPreviewContainer`)

**Container:**
- **Position:** `relative`
- **Width:** `100%`
- **Display:** `flex`, `justify-content: center`, `align-items: center`
- **Margin Bottom:** `8px`

### APY Pill (`.apyPill`)

**Positioning:**
- **Position:** `absolute`
- **Top:** `-12px` (overlaps card preview)
- **Left:** `50%`
- **Transform:** `translateX(-50%)` (centered)
- **Z-index:** `2` (above card image)

**Styling:**
- **Display:** `inline-flex`, `align-items: center`
- **Gap:** `4px` (between percentage and label)
- **Padding:** `6px 12px`
- **Border Radius:** `20px` (pill-shaped)
- **Background:** `rgba(0, 0, 0, 0.75)` (75% opacity black)
- **Backdrop Filter:** `blur(8px)`
- **Box Shadow:** `0 2px 8px rgba(0, 0, 0, 0.2)`

**APY Percentage (`.apyPercentage`):**
- **Font Family:** `'Inter', system-ui, -apple-system, sans-serif`
- **Font Size:** `14px`
- **Font Weight:** `700` (bold)
- **Color:** `#fff` (white)
- **Letter Spacing:** `-0.1px`

**APY Label (`.apyLabel`):**
- **Font Family:** `'Inter', system-ui, -apple-system, sans-serif`
- **Font Size:** `12px`
- **Font Weight:** `400` (regular)
- **Color:** `rgba(255, 255, 255, 0.9)` (90% opacity white)
- **Letter Spacing:** `0.1px`

**Content Example:**
- Percentage: "9.38%"
- Label: "annual yield"

### Card Preview Image (`.cardPreview`)

**Container:**
- **Width:** `204px`
- **Height:** `85px` (shows only top third/half of card)
- **Border Radius:** `17px`
- **Overflow:** `hidden`
- **Position:** `relative`
- **Box Shadow:** `0 4px 12px rgba(0, 0, 0, 0.15)`
- **Background:** `#fff` (fallback)

**Image (`.cardImage`):**
- **Object Fit:** `cover`
- **Object Position:** `top center` (shows top portion)
- **Width:** `100%`
- **Height:** `170px` (full card height, but container crops it)
- **Position:** `absolute`, `top: 0`, `left: 0`

**Card Image Sources (by wallet type):**
- **ZAR wallet (savings):** `/assets/cards/card-savings.jpg`
- **MZN wallet:** `/assets/cards/card-MZN.jpg`
- **ZWD wallet:** `/assets/cards/card-ZIM5.jpg`
- **ETH wallet (yield):** `/assets/cards/card-ETH.jpg`
- **BTC wallet:** `/assets/cards/card-BTC.jpg`
- **Agent Earnings (yieldSurprise):** `/assets/cards/card-$GOB4.jpg`

### APY Heading (`.apyHeading`)

**Typography:**
- **Font Family:** `'Inter', system-ui, -apple-system, sans-serif`
- **Font Size:** `16px`
- **Font Weight:** `600` (semi-bold)
- **Color:** `#0a0a0a` (near black)
- **Margin:** `8px 0 0 0`
- **Text Align:** `center`

**Content Example:**
"Earn 9% annually on your deposits"

### APY Subtext (`.apySubtext`)

**Typography:**
- **Font Family:** `'Inter', system-ui, -apple-system, sans-serif`
- **Font Size:** `14px`
- **Font Weight:** `400` (regular)
- **Color:** `rgba(10, 10, 10, 0.6)` (60% opacity black)
- **Margin:** `0`
- **Text Align:** `center`

**Content Example:**
"Compounded monthly"

---

## 7. Tile 2: Anytime Access

**Structure:** Same base tile (`.tile`)

**Title (`.tileTitle`):**
- **Font Family:** `'Inter', system-ui, -apple-system, sans-serif`
- **Font Size:** `24px`
- **Font Weight:** `500` (medium)
- **Color:** `#0a0a0a` (near black)
- **Margin:** `0`
- **Text Align:** `center`

**Content:** "Anytime"

**Line 1 (`.tileLine1`):**
- **Font Family:** `'Inter', system-ui, -apple-system, sans-serif`
- **Font Size:** `16px`
- **Font Weight:** `400` (regular)
- **Color:** `rgba(10, 10, 10, 0.7)` (70% opacity black)
- **Margin:** `2px 0 0 0`
- **Text Align:** `center`

**Content:** "Access to funds"

**Line 2 (`.tileLine2`):**
- **Font Family:** `'Inter', system-ui, -apple-system, sans-serif`
- **Font Size:** `14px`
- **Font Weight:** `400` (regular)
- **Color:** `rgba(10, 10, 10, 0.6)` (60% opacity black)
- **Margin:** `2px 0 0 0`
- **Text Align:** `center`

**Content:** "Withdraw anytime at no additional cost"

---

## 8. Tile 3: 0% Tax

**Structure:** Same base tile (`.tile`)

**Title (`.tileTitle`):**
- Same styling as Tile 2 title
- **Content:** "0%"

**Line 1 (`.tileLine1`):**
- Same styling as Tile 2 Line 1
- **Content:** "Tax on interest earned"

**Line 2:** Not used in this tile

---

## 9. Tile 4: Zero Fees

**Structure:** Same base tile (`.tile`)

**Title (`.tileTitle`):**
- Same styling as Tile 2 title
- **Content:** "Zero"

**Line 1 (`.tileLine1`):**
- Same styling as Tile 2 Line 1
- **Content:** "Fees on payments"

**Line 2 (`.tileLine2`):**
- Same styling as Tile 2 Line 2
- **Content:** "Pay any Gobankless account for free"

---

## 10. Color Palette

**Primary Colors:**
- **White:** `#fff`
- **Near Black:** `#0a0a0a`
- **Light Gray Background:** `#f2f2f7`

**Text Colors:**
- **Primary Text:** `#0a0a0a` (near black)
- **Secondary Text:** `rgba(10, 10, 10, 0.7)` (70% opacity)
- **Tertiary Text:** `rgba(10, 10, 10, 0.6)` (60% opacity)
- **White Text (APY Pill):** `#fff` and `rgba(255, 255, 255, 0.9)`

**Background Colors:**
- **Sheet Background:** `#fff`
- **Tile Background:** `#f2f2f7`
- **APY Pill Background:** `rgba(0, 0, 0, 0.75)`
- **Overlay Background:** `rgba(0, 0, 0, 0.35)`
- **Close Button Background:** `rgba(0, 0, 0, 0.05)`
- **Close Button Hover:** `#D1D1D6`
- **Close Button Active:** `#C7C7CC`

---

## 11. Typography System

**Font Stack:**
- Primary: `'Inter'`
- Fallback: `system-ui, -apple-system, sans-serif`

**Font Weights Used:**
- `300` - Light (title)
- `400` - Regular (body text, descriptions)
- `500` - Medium (tile titles)
- `600` - Semi-bold (APY heading)
- `700` - Bold (APY percentage)

**Font Sizes:**
- `22px` - Sheet title
- `24px` - Tile titles
- `16px` - Description, tile line 1, APY heading
- `14px` - APY subtext, tile line 2, APY percentage
- `12px` - APY label

**Letter Spacing:**
- Title: `-0.22px`
- APY Percentage: `-0.1px`
- APY Label: `0.1px`

---

## 12. Spacing System

**Container Padding:**
- Content wrapper: `24px 20px 32px` (top, horizontal, bottom)
- Header: `64px 24px 0 24px` (top offset, horizontal)
- Body default: `0 24px` (horizontal only)

**Gaps:**
- Between tiles: `20px`
- Within tile: `8px` (between elements)
- APY pill gap: `4px` (between percentage and label)

**Margins:**
- Description: `0 0 4px 0`
- APY heading: `8px 0 0 0`
- Tile line 1: `2px 0 0 0`
- Tile line 2: `2px 0 0 0`
- Card preview container: `0 0 8px 0`

**Close Button:**
- Position: `16px` from top and right edges

---

## 13. Border Radius

- **Sheet:** `32px 32px 0 0` (top corners only)
- **Tiles:** `24px` (all corners)
- **Card Preview:** `17px` (all corners)
- **APY Pill:** `20px` (pill-shaped)
- **Close Button:** `50%` (circular)

---

## 14. Shadows

**Sheet Shadow:**
- `0 -4px 100px rgba(0, 0, 0, 0.25)`
- `0 20px 60px rgba(0, 0, 0, 0.35)`

**Card Preview Shadow:**
- `0 4px 12px rgba(0, 0, 0, 0.15)`

**APY Pill Shadow:**
- `0 2px 8px rgba(0, 0, 0, 0.2)`

---

## 15. Animations

**Sheet Entrance:**
- **Animation:** `slideUp`
- **Duration:** `600ms`
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)`
- **From:** `translateY(100%)` (off-screen below)
- **To:** `translateY(0)` (on-screen)

**Sheet Exit:**
- **Animation:** `slideDown`
- **Duration:** `600ms`
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)`
- **From:** `translateY(0)` (on-screen)
- **To:** `translateY(100%)` (off-screen below)

**Overlay Fade:**
- **Transition:** `opacity 600ms cubic-bezier(0.4, 0, 0.2, 1)`
- **Closing:** `opacity: 0`

**Close Button Hover:**
- **Transition:** `background 200ms ease`

---

## 16. Images & Illustrations

**Card Images:**
- Format: JPG
- Dimensions: Varies by card (typically 342×213px or 310×193px)
- Display: Cropped to show top third/half (85px height)
- Object fit: `cover`
- Object position: `top center`

**Close Icon:**
- Format: SVG
- Source: `/assets/clear.svg`
- Size: `18px × 18px`
- Color: Black (inherited)

---

## 17. Responsive Behavior

**Max Width:**
- Sheet: `430px` (centered on larger screens)

**Height:**
- Max height: `85vh` (tall variant)
- Content max height: `calc(85vh - 100px)` (accounts for header)

**Safe Area:**
- Bottom padding: `calc(env(safe-area-inset-bottom) + 16px)`

**Scrolling:**
- Content wrapper: `overflow-y: auto`
- Smooth scrolling: `-webkit-overflow-scrolling: touch`
- Overscroll: `overscroll-behavior: contain`

---

## 18. Interaction States

**Close Button:**
- Default: `rgba(0, 0, 0, 0.05)` background
- Hover: `#D1D1D6` background
- Active: `#C7C7CC` background
- Cursor: `pointer`

**Overlay:**
- Clickable: Closes sheet
- Cursor: `pointer`
- Tap highlight: `transparent`

---

## 19. Accessibility

**ARIA:**
- Sheet: `aria-modal="true"`, `role="dialog"`
- Close button: `aria-label="Close"`
- Overlay: `aria-label="Close"`

**Keyboard:**
- ESC key: Closes sheet

**Focus:**
- Close button is focusable
- Tab order: Close button → content

---

## 20. Component File Structure

**Component:** `src/components/WalletHelperSheet.tsx`
**Styles:** `src/components/WalletHelperSheet.module.css`
**Base Component:** `src/components/ActionSheet.tsx`
**Base Styles:** `src/styles/action-sheet.css`

---

## 21. Wallet Type Mapping

**Title Mapping:**
- `savings` → "ZAR wallet"
- `mzn` → "MZN wallet"
- `zwd` → "ZWD wallet"
- `yield` → "ETH wallet"
- `btc` → "BTC wallet"
- `yieldSurprise` → "ETH wallet" (reuses yield title)

**Card Image Mapping:**
- `savings` → `/assets/cards/card-savings.jpg`
- `mzn` → `/assets/cards/card-MZN.jpg`
- `zwd` → `/assets/cards/card-ZIM5.jpg`
- `yield` → `/assets/cards/card-ETH.jpg`
- `btc` → `/assets/cards/card-BTC.jpg`
- `yieldSurprise` → `/assets/cards/card-$GOB4.jpg`

---

## Summary for Third-Party Redesign

This helper sheet is a **tall modal popup** (85vh max height) that slides up from the bottom of the screen. It contains:

1. **Header** with wallet title (e.g., "ZAR wallet") and close button
2. **Description paragraph** explaining the wallet type
3. **Four information tiles** in a vertical stack:
   - **Tile 1:** Card preview image with APY pill overlay + heading + subtext
   - **Tile 2:** "Anytime" access information
   - **Tile 3:** "0%" tax information
   - **Tile 4:** "Zero" fees information

All tiles use a **light gray background** (`#f2f2f7`) with **24px border radius**, centered text, and consistent typography hierarchy. The card preview shows only the top portion of the actual card image with an APY percentage pill overlaid at the top center.

The design uses **Inter font family** with a light, modern aesthetic, subtle shadows, and smooth slide-up/down animations.


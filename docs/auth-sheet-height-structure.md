# Sign Up/In Pop-Up Sheet Height & Structure Specification

## Overview

This document describes the exact height, structure, and styling of the authentication (sign up/sign in) pop-up sheets. These specifications can be reused for other full-bleed background image sheets that require the same visual treatment.

---

## Base Component Configuration

### ActionSheet Props

All authentication sheets use the `ActionSheet` component with these specific props:

```typescript
<ActionSheet
  open={isOpen}
  onClose={handleClose}
  title=""                    // Empty string = no title header
  size="tall"                 // Uses tall variant (85vh)
  className="handAuthSheet"   // Custom class for auth-specific styling
>
  {/* Content */}
</ActionSheet>
```

**Key Props:**
- `title=""` - Empty string removes the default header, leaving only the close button
- `size="tall"` - Sets max-height to 85vh
- `className="handAuthSheet"` - Applies auth-specific styling overrides

---

## Height Specifications

### Sheet Container Height

**CSS Class:** `.as-sheet.handAuthSheet`

**Height Values:**
- `height: 85vh` - Fixed height at 85% of viewport height
- `max-height: 85vh` - Maximum height constraint
- `padding-bottom: 0` - No bottom padding (flush with bottom)

**Location:** `src/styles/action-sheet.css` (lines 95-100)

```css
.as-sheet.handAuthSheet {
  border-radius: 32px 32px 0 0;
  height: 85vh;
  max-height: 85vh;
  padding-bottom: 0; /* Remove default bottom padding */
}
```

### Body Container

**CSS Class:** `.as-sheet.handAuthSheet .as-body`

**Styling:**
- `padding: 0` - Removes default 24px padding
- `height: 100%` - Fills parent container
- `overflow: hidden` - Prevents content overflow
- `margin: 0` - No margin

**Location:** `src/styles/action-sheet.css` (lines 88-93)

```css
.as-sheet.handAuthSheet .as-body {
  padding: 0;
  height: 100%;
  overflow: hidden;
  margin: 0;
}
```

---

## Border Radius

**Value:** `32px 32px 0 0`

**Application:**
- Top-left corner: 32px
- Top-right corner: 32px
- Bottom corners: 0 (sharp corners, flush with bottom)

**Applied to:**
- `.as-sheet.handAuthSheet` (sheet container)
- `.handAuthRoot` (background image container)

---

## Structure Hierarchy

### Component Structure

```
ActionSheet (handAuthSheet class)
└── div.handAuthWrapper (relative positioning, 100% width/height)
    ├── div.handAuthRoot (background image, absolute fill)
    └── div.content (form overlay, absolute positioning)
        └── form.form (centered form content)
            ├── Logo/Header (optional, absolute positioned)
            ├── Input fields
            ├── Buttons
            └── Legal text
```

### CSS Classes Breakdown

1. **`.handAuthWrapper`** - Outer container
   - `position: relative`
   - `width: 100%`
   - `height: 100%`
   - `padding: 0`
   - `margin: 0`

2. **`.handAuthRoot`** - Background image container
   - `width: 100%`
   - `height: 100%`
   - `border-radius: 32px 32px 0 0`
   - `overflow: hidden`
   - `background-image: url('/assets/sign up - first contact.png')`
   - `background-size: cover`
   - `background-position: center 15%` (for hand image)
   - `background-repeat: no-repeat`

3. **`.content`** - Form overlay container
   - `position: absolute`
   - `top: calc(50% - 110px)` (centered, slightly lower)
   - `left: 0`
   - `right: 0`
   - `display: flex`
   - `justify-content: center`
   - `pointer-events: none` (allows clicks through to background)
   - `overflow-y: auto`
   - `max-height: calc(100% - 40px)`
   - `padding: 20px 0`

4. **`.form`** - Form content
   - `width: 344px`
   - `max-width: calc(100% - 48px)`
   - `display: flex`
   - `flex-direction: column`
   - `gap: 24px` (or `16px` for entry sheet)
   - `align-items: center`
   - `pointer-events: auto` (enables interaction)

---

## Variants

### 1. Auth Entry Sheet (Sign-in Method Selection)

**Component:** `src/components/AuthEntrySheet.tsx`

**Differences:**
- Uses same `handAuthSheet` class
- Content positioned at `top: 232px` (`.authEntryContent`)
- Logo in top-left corner (`.authEntryHeader`)
- Form gap: `16px` (`.authEntryForm`)

**Background Image:** Same as password sheet (`/assets/sign up - first contact.png`)

### 2. Password Sheet (Password Entry)

**Component:** `src/components/AuthModal.tsx`

**Differences:**
- Content positioned at `top: calc(50% - 110px)` (standard)
- Logo centered at top (`.passwordLogoWrapper`)
- Back button in top-left (`.passwordBackButton`)
- Form gap: `24px` (standard)

**Background Image:** `/assets/sign up - first contact.png`

### 3. Phone Sign-up Sheet

**Component:** `src/components/PhoneSignupSheet.tsx`

**Differences:**
- Uses `handAuthSheet phoneSignupSheet` classes
- Different background image: `/assets/sign_up - phone.png`
- Content positioned at `top: calc(50% - 160px)` (`.phoneSignupContent`)
- Form gap: `16px` (`.phoneSignupForm`)
- Back button in top-left (`.phoneBackButton`)

**Background Image:** `/assets/sign_up - phone.png`

---

## Close Button

### No Title Header

When `title=""` is provided, ActionSheet renders a close-only button:

**CSS Class:** `.as-close-only`

**Positioning:**
- `position: absolute`
- `top: 16px`
- `right: 16px`
- `z-index: 10`

**Styling:**
- `background: rgba(255, 255, 255, 0.9)` (semi-transparent white)
- `border-radius: 50%` (circular)
- `width: 32px`
- `height: 32px`
- `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1)`

**Location:** `src/styles/action-sheet.css` (lines 241-267)

---

## Background Image Positioning

### Hand Artwork Background

**Image:** `/assets/sign up - first contact.png`

**Positioning:**
- `background-position: center 15%`
- The `15%` value moves the image content down, showing more of the hand artwork in the viewport
- Adjust this value to change which part of the image is visible

### Phone Background

**Image:** `/assets/sign_up - phone.png`

**Positioning:**
- `background-position: center`
- Centered positioning for phone artwork

---

## Content Positioning

### Standard Content Position

**CSS Class:** `.content`

**Position:**
- `top: calc(50% - 110px)`
- This positions the form approximately 110px above the vertical center
- Creates space for logo/header elements above the form

### Entry Sheet Content Position

**CSS Class:** `.authEntryContent`

**Position:**
- `top: 232px !important`
- Fixed position from top (not relative to center)
- Moves content down further to accommodate logo in top-left

### Phone Sign-up Content Position

**CSS Class:** `.phoneSignupContent`

**Position:**
- `top: calc(50% - 160px) !important`
- Moved up from standard position to compensate for explanatory text

---

## Form Element Specifications

### Input Shell

**CSS Class:** `.inputShell`

**Dimensions:**
- `height: 56px` (standard form field height)
- `border-radius: 8px`
- `background-color: #fff`
- `padding: 0 16px`

### Primary Button

**CSS Class:** `.primaryButton`

**Dimensions:**
- `width: 320px`
- `max-width: 100%`
- `height: 56px`
- `border-radius: 42px` (pill-shaped)
- `background-color: #000`
- `color: #fff`

### Social Buttons (Entry Sheet)

**CSS Class:** `.authEntrySocialButton`

**Dimensions:**
- `width: 100%`
- `height: 56px`
- `border-radius: 42px`
- `background-color: #fff`
- `color: #000`

---

## Reusing This Structure

### Step-by-Step Implementation

1. **Import ActionSheet:**
   ```typescript
   import ActionSheet from './ActionSheet'
   ```

2. **Use tall size with handAuthSheet class:**
   ```typescript
   <ActionSheet
     open={isOpen}
     onClose={handleClose}
     title=""
     size="tall"
     className="handAuthSheet"
   >
   ```

3. **Create wrapper structure:**
   ```typescript
   <div className={styles.handAuthWrapper}>
     <div className={styles.handAuthRoot} />
     {/* Your content here */}
   </div>
   ```

4. **Position content overlay:**
   ```typescript
   <div className={styles.content}>
     <form className={styles.form}>
       {/* Form fields */}
     </form>
   </div>
   ```

5. **Import CSS module:**
   ```typescript
   import styles from './AuthModal.module.css'
   ```
   Or create your own CSS module with the same classes.

### Required CSS Classes

Copy these classes to your CSS module:

```css
/* Wrapper */
.handAuthWrapper {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
}

/* Background image */
.handAuthRoot {
  width: 100%;
  height: 100%;
  border-radius: 32px 32px 0 0;
  overflow: hidden;
  background-image: url('/assets/your-image.png');
  background-size: cover;
  background-position: center 15%; /* Adjust as needed */
  background-repeat: no-repeat;
}

/* Content overlay */
.content {
  position: absolute;
  top: calc(50% - 110px); /* Adjust as needed */
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  overflow-y: auto;
  max-height: calc(100% - 40px);
  padding: 20px 0;
}

/* Form */
.form {
  width: 344px;
  max-width: calc(100% - 48px);
  display: flex;
  flex-direction: column;
  gap: 24px; /* Adjust as needed */
  align-items: center;
  pointer-events: auto;
}
```

### Global ActionSheet Styles

The following styles are already defined in `src/styles/action-sheet.css` and apply automatically when using `className="handAuthSheet"`:

- Sheet height: `85vh`
- Border radius: `32px 32px 0 0`
- Body padding: `0`
- Body height: `100%`
- Body overflow: `hidden`

**No additional CSS needed for these base styles.**

---

## Key Design Tokens

### Heights
- **Sheet height:** `85vh` (85% of viewport height)
- **Input height:** `56px`
- **Button height:** `56px`
- **Border radius (sheet):** `32px` (top corners only)
- **Border radius (inputs):** `8px`
- **Border radius (buttons):** `42px` (pill-shaped)

### Spacing
- **Form gap:** `24px` (standard) or `16px` (compact)
- **Form width:** `344px`
- **Form max-width:** `calc(100% - 48px)` (24px padding on each side)
- **Content top offset:** `calc(50% - 110px)` (standard)

### Colors
- **Background (sheet):** `#fff`
- **Background (inputs):** `#fff`
- **Background (primary button):** `#000`
- **Background (social buttons):** `#fff`
- **Text (primary):** `#000`
- **Text (button):** `#fff` (on black) or `#000` (on white)

---

## Animation

### Sheet Entrance

**Animation:** `slideUp`

**Duration:** `600ms`

**Easing:** `cubic-bezier(0.4, 0, 0.2, 1)`

**Effect:** Slides up from bottom of screen

**Location:** `src/styles/action-sheet.css` (lines 153-160)

```css
@keyframes slideUp {
  from {
    transform: translateX(-50%) translateY(100%);
  }
  to {
    transform: translateX(-50%) translateY(0);
  }
}
```

---

## Safe Area Handling

### Bottom Safe Area

The ActionSheet automatically handles bottom safe area insets:

```css
padding-bottom: calc(env(safe-area-inset-bottom) + 16px);
```

However, for `handAuthSheet`, this is overridden:

```css
.as-sheet.handAuthSheet {
  padding-bottom: 0; /* Remove default bottom padding */
}
```

This ensures the sheet is flush with the bottom of the screen, including on devices with notches or home indicators.

---

## Examples in Codebase

### Auth Entry Sheet
- **File:** `src/components/AuthEntrySheet.tsx`
- **Usage:** Sign-in method selection (Google, Instagram, username/phone)

### Password Sheet
- **File:** `src/components/AuthModal.tsx`
- **Usage:** Password entry for authentication

### Phone Sign-up Sheet
- **File:** `src/components/PhoneSignupSheet.tsx`
- **Usage:** Phone number sign-up form

---

## Summary

To reuse the sign up/in pop-up sheet structure:

1. **Use ActionSheet with:**
   - `size="tall"`
   - `className="handAuthSheet"`
   - `title=""` (for no header)

2. **Height:** `85vh` (automatically applied)

3. **Structure:**
   - `handAuthWrapper` → `handAuthRoot` (background) + `content` (overlay)

4. **Border radius:** `32px 32px 0 0` (rounded top only)

5. **Content positioning:** Adjust `top` value in `.content` class based on your needs

6. **Form width:** `344px` with `max-width: calc(100% - 48px)`

This structure provides a consistent, full-bleed background image experience with centered form content overlay, matching the authentication sheets throughout the application.


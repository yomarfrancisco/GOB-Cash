# Auth Modal Popup - Complete Specification

## Overview
Full-screen authentication modal with a full-bleed background image and a centered password form overlay. The modal uses an ActionSheet component with specific styling to achieve the desired layout.

---

## Component Structure

### Base Component
- **Component:** `ActionSheet`
- **Props:**
  - `open={authOpen}` - controlled by auth store
  - `onClose={closeAuth}` - closes modal
  - `title=""` - empty string (no title header)
  - `size="tall"` - uses tall variant
  - `className="handAuthSheet"` - custom class for styling

### Container Hierarchy
```
ActionSheet (handAuthSheet class)
  └── div.handAuthWrapper
      ├── div.handAuthRoot (background image)
      └── div.content (form overlay)
          └── form.form
              ├── label.field
              │   └── div.inputShell
              │       ├── input.input
              │       └── button.eyeButton
              │           └── Image (hidden_outlined.svg)
              ├── p.errorText (conditional)
              ├── button.primaryButton
              └── p.legal
```

---

## Sheet Container Styling

### ActionSheet Base (action-sheet.css)
- **Class:** `.as-sheet.handAuthSheet`
- **Height:** `85vh`
- **Max-height:** `85vh`
- **Border-radius:** `32px 32px 0 0` (rounded top corners only)
- **Padding-bottom:** `0` (no bottom padding)

### ActionSheet Body (action-sheet.css)
- **Class:** `.as-sheet.handAuthSheet .as-body`
- **Padding:** `0` (removed default 24px padding)
- **Height:** `100%`
- **Overflow:** `hidden`
- **Margin:** `0`

---

## Background Image

### Container
- **Class:** `.handAuthWrapper`
- **Position:** `relative`
- **Width:** `100%`
- **Height:** `100%`
- **Padding:** `0`
- **Margin:** `0`

### Image Element
- **Class:** `.handAuthRoot`
- **Width:** `100%`
- **Height:** `100%`
- **Border-radius:** `32px 32px 0 0` (matches parent sheet)
- **Overflow:** `hidden`
- **Background-image:** `url('/assets/sign up - first contact.png')`
- **Background-size:** `cover`
- **Background-position:** `center 15%` ⚠️ **CRITICAL:** Lower percentage (15%) moves image DOWN in view
- **Background-repeat:** `no-repeat`

**Image Positioning Notes:**
- The `15%` vertical position shows more of the bottom portion of the image
- Lower percentages (e.g., 15% vs 35%) move the visible image content DOWN
- Higher percentages move it UP
- Horizontal is always centered

---

## Form Overlay Container

### Content Wrapper
- **Class:** `.content`
- **Position:** `absolute`
- **Top:** `calc(50% - 110px)` - positioned 110px above center (moves form down from exact center)
- **Left:** `0`
- **Right:** `0`
- **Display:** `flex`
- **Justify-content:** `center`
- **Pointer-events:** `none` (allows clicks to pass through to background, but form has `pointer-events: auto`)

### Form Container
- **Class:** `.form`
- **Width:** `344px`
- **Max-width:** `calc(100% - 48px)` (48px total horizontal padding on mobile)
- **Display:** `flex`
- **Flex-direction:** `column`
- **Gap:** `24px` (vertical spacing between form elements)
- **Align-items:** `center`
- **Pointer-events:** `auto` (enables form interaction)

---

## Password Input Field

### Field Label Container
- **Class:** `.field`
- **Width:** `100%`
- **Display:** `flex`
- **Flex-direction:** `column`
- **Gap:** `8px` (spacing between label and input)
- **Color:** `#000`
- **Font-size:** `14px`
- **Font-weight:** `500`
- **Font-family:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

### Input Shell (White Background Container)
- **Class:** `.inputShell`
- **Width:** `100%`
- **Height:** `56px` (standard form field height)
- **Border-radius:** `8px`
- **Background-color:** `#fff` (white)
- **Display:** `flex`
- **Align-items:** `center`
- **Justify-content:** `space-between`
- **Padding:** `0 16px` (16px horizontal padding)
- **Box-sizing:** `border-box`
- **Gap:** `16px` (space between input and eye button)

### Password Input
- **Class:** `.input`
- **Type:** `password` (or `text` when showPassword is true)
- **Flex:** `1` (takes remaining space)
- **Border:** `none`
- **Outline:** `none`
- **Background:** `transparent`
- **Font-size:** `16px`
- **Font-family:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Color:** `#000`
- **Placeholder:** `"Password"`
- **Placeholder styling:**
  - **Opacity:** `0.5`
  - **Font-weight:** `500`
  - **Letter-spacing:** `-0.23px`
  - **Color:** `#000`

### Eye Icon Button (Show/Hide Password)
- **Class:** `.eyeButton`
- **Type:** `button`
- **Border:** `none`
- **Background:** `transparent`
- **Padding:** `0`
- **Margin:** `0`
- **Display:** `flex`
- **Align-items:** `center`
- **Justify-content:** `center`
- **Cursor:** `pointer`
- **Transition:** `opacity 0.15s ease`
- **Hover:** `opacity: 0.7`
- **Active:** `opacity: 0.5`

### Eye Icon Image
- **Source:** `/assets/hidden_outlined.svg`
- **Width:** `24px`
- **Height:** `24px`
- **Class:** `.eyeIcon`

---

## Error Message

### Error Text
- **Class:** `.errorText`
- **Conditional:** Only shown when `error` state is not null
- **Width:** `100%`
- **Margin-top:** `8px`
- **Font-size:** `13px`
- **Color:** `#ff3b30` (red)
- **Font-family:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Text-align:** `left`
- **Margin-bottom:** `-8px` (compensates for spacing to avoid layout shift)
- **Content:** `"Incorrect member password"` (when validation fails)

---

## Primary Button (Log in)

### Button Styling
- **Class:** `.primaryButton` (with `.primaryButtonDisabled` when disabled)
- **Type:** `submit`
- **Width:** `320px`
- **Max-width:** `100%`
- **Height:** `56px`
- **Border-radius:** `42px` (fully rounded pill shape)
- **Background-color:** `#000` (black)
- **Color:** `#fff` (white text)
- **Display:** `flex`
- **Align-items:** `center`
- **Justify-content:** `center`
- **Font-weight:** `500`
- **Font-size:** `16px`
- **Letter-spacing:** `-0.32px`
- **Border:** `none`
- **Transition:** `opacity 0.15s ease, transform 0.1s ease`
- **Font-family:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Cursor:** `pointer`

### Button States
- **Hover (enabled):** `opacity: 0.9`
- **Active (enabled):** `transform: scale(0.98)`
- **Disabled:**
  - **Opacity:** `0.3`
  - **Pointer-events:** `none`
  - **Cursor:** `not-allowed`

### Button Text
- **Content:** `"Log in"`
- **Disabled when:** `password.trim().length === 0` OR `isSubmitting === true`

---

## Legal Disclaimer Text

### Legal Text
- **Class:** `.legal`
- **Width:** `283px`
- **Max-width:** `100%`
- **Text-align:** `center`
- **Font-size:** `13px`
- **Font-weight:** `300` (light)
- **Opacity:** `0.5`
- **Font-family:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Margin:** `0`
- **Line-height:** `1.4`

### Legal Text Content
```
"Gobankless is a service provider of the National Stokvel Association of
South Africa, an authorised Financial Services Provider (FSP 52815) and
Co-operative bank (Certificate no. CFI0024)."
```

---

## Close Button

### Close Button (ActionSheet Default)
- **Location:** Top-right corner (provided by ActionSheet component)
- **Icon:** `/assets/clear.svg`
- **Size:** `18px × 18px`
- **Class:** `.as-close-only` (since title is empty)
- **Styling:** Inherited from ActionSheet base styles

---

## Form Behavior & Validation

### Password Validation
- **Valid password:** `"brics2025"` (hardcoded constant `MEMBER_PASSWORD`)
- **Validation:** Client-side only
- **On incorrect password:** Shows error message "Incorrect member password"
- **On correct password:** Calls `completeAuth()` from auth store and closes modal

### Form Submission
- **Method:** `onSubmit` handler prevents default form submission
- **Disabled state:** Button disabled when password is empty or submitting
- **Error clearing:** Error message clears when user types in the input field

### State Management
- **Password value:** Controlled input via `password` state
- **Show password toggle:** `showPassword` state (boolean)
- **Error state:** `error` state (string | null)
- **Submitting state:** `isSubmitting` state (boolean)

---

## Z-Index & Layering

### Layer Order (bottom to top)
1. **Background image** (`.handAuthRoot`) - base layer
2. **Form overlay** (`.content`) - absolute positioned over image
3. **Close button** - top-right, highest z-index (from ActionSheet)

---

## Responsive Behavior

### Mobile Considerations
- Form width: `344px` with `max-width: calc(100% - 48px)` ensures 24px padding on each side
- Sheet height: `85vh` ensures it doesn't exceed viewport
- Safe area: ActionSheet handles safe area insets automatically

---

## Animation & Transitions

### Sheet Entrance
- **Animation:** `slideUp` (from ActionSheet base)
- **Duration:** `600ms`
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)`

### Button Interactions
- **Hover transition:** `opacity 0.15s ease`
- **Active transition:** `transform 0.1s ease`
- **Eye button:** `opacity 0.15s ease`

---

## Assets Required

1. **Background Image:**
   - **Path:** `/public/assets/sign up - first contact.png`
   - **Usage:** Full-bleed background

2. **Eye Icon:**
   - **Path:** `/public/assets/hidden_outlined.svg`
   - **Size:** `24px × 24px`
   - **Usage:** Show/hide password toggle

3. **Close Icon:**
   - **Path:** `/assets/clear.svg` (from ActionSheet)
   - **Size:** `18px × 18px`

---

## Key Implementation Notes

1. **Image Positioning:** The `background-position: center 15%` is critical - lower percentages move the image DOWN in the viewport (counterintuitive but correct for this use case)

2. **Form Positioning:** The form is positioned `calc(50% - 110px)` from top, which places it slightly below the visual center of the modal

3. **Pointer Events:** The `.content` wrapper has `pointer-events: none` but `.form` has `pointer-events: auto` to allow form interaction while blocking background clicks

4. **No Padding:** The ActionSheet body has `padding: 0` to allow the background image to fill the entire sheet area

5. **Border Radius:** The sheet and background image both use `32px 32px 0 0` to match iOS-style rounded top corners

6. **Height Constraint:** The sheet is fixed at `85vh` to ensure it's tall but not full-screen

---

## Complete CSS Classes Reference

### AuthModal.module.css Classes
- `.handAuthWrapper` - outer container
- `.handAuthRoot` - background image container
- `.content` - form overlay container
- `.form` - form element
- `.field` - label/field wrapper
- `.inputShell` - white input container
- `.input` - password input
- `.eyeButton` - show/hide password button
- `.eyeIcon` - eye icon image
- `.primaryButton` - submit button
- `.primaryButtonDisabled` - disabled button state
- `.errorText` - error message
- `.legal` - legal disclaimer text

### ActionSheet.css Classes (inherited)
- `.as-sheet.handAuthSheet` - sheet container
- `.as-sheet.handAuthSheet .as-body` - sheet body
- `.as-close-only` - close button

---

## Testing Checklist

- [ ] Background image displays correctly with `center 15%` positioning
- [ ] Form is centered horizontally and positioned slightly below center vertically
- [ ] Password input has white background, 56px height, 8px border-radius
- [ ] Eye icon toggles password visibility
- [ ] Button is disabled when password is empty
- [ ] Error message appears on incorrect password
- [ ] Error message clears when user types
- [ ] Legal text is centered, 13px, 300 weight, 0.5 opacity
- [ ] Close button appears in top-right
- [ ] Sheet height is 85vh
- [ ] Sheet has rounded top corners (32px)
- [ ] Form width is 344px on desktop, responsive on mobile


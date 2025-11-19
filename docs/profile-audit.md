# Profile Page Structure Audit

**Date**: Current  
**File**: `src/app/profile/page.tsx`  
**Branch**: `chore/audit-profile-layout`

---

## Layout Hierarchy

### Root Container
```
<div className="app-shell">
  <div className="mobile-frame">
    <div className="dashboard-container">
```

### Overlay Layer (Fixed/Sticky)
```
<div className="overlay-glass">
  <TopGlassBar />
  <BottomGlassBar currentPath="/profile" onDollarClick={openDirectPaymentSheet} />
</div>
```

**TopGlassBar** contains:
- Glass shard texture (rotated, positioned top-left)
- Spraypaint effect overlay
- GoBankless logo (top-left)
- Icons group (top-right):
  - Scan icon
  - Export/Share icon

**BottomGlassBar** contains:
- Glass bottom texture
- Navigation container:
  - Home icon (left)
  - Dollar sign button (center, FAB style) - triggers `openDirectPaymentSheet`
  - Profile icon (right, active state)

---

### Scrollable Content Area
```
<div className="scroll-content">
  <div className="content" style={{ background: '#fff' }}>
```

---

## Profile Content Sections

### 1. Profile Header (`profile-header`)
**Position**: Top of scrollable content, centered  
**Class**: `.profile-header`

**Elements** (stacked vertically, centered):
- **Avatar Image**
  - Source: `/assets/profile/headshot.png`
  - Size: 104×104px
  - Border-radius: 32px
  - Border: 2px solid rgba(255, 255, 255, 0.15)
  - Class: `.profile-avatar`

- **Name**
  - Text: "Samuel Akoyo"
  - Class: `.profile-name`
  - Font: 28px, weight 600, color #000

- **Handle**
  - Text: "$samakoyo"
  - Class: `.profile-handle`
  - Font: 16px, opacity 0.7, color #000

- **Bio**
  - Text: "A skilled entrepreneur experienced in manufacturing and construction across Africa. Let's do business, DMs are open."
  - Class: `.profile-bio`
  - Font: 14px, centered, max-width 360px, opacity 0.8

- **Meta Row** (`profile-meta`)
  - Layout: Horizontal flex, gap 8px
  - Elements:
    - Location item (`.meta-item`):
      - Icon: `/assets/profile/location-pin.svg` (12×12px)
      - Text: "South Africa"
    - Dot separator (`.meta-dot`): 4×4px circle, opacity 0.25
    - Join date item (`.meta-item`):
      - Icon: `/assets/profile/calendar_month.svg` (12×12px)
      - Text: "Joined Feb 2024"

---

### 2. Stats Card (`profile-stats-card`)
**Position**: Below header, centered  
**Class**: `.profile-stats-card`  
**Container**: 382px wide, rounded 32px, glassmorphism background

**Stats Row** (`.stats-row`):
- Layout: Horizontal flex, centered, gap 8px
- Three stat units (`.stat`), each 88px wide:

  1. **Rating Stat**
     - Top row (`.stat-top`):
       - Value: "4.8"
       - Icon: `/assets/profile/star.svg` (12×12px)
     - Sub: "(11.5K)"
     - Class: `.stat-value` (18px, weight 600), `.stat-sub` (15px, weight 300, opacity 0.5)

  2. **Suppliers Stat**
     - Value: "8,122"
     - Sub: "Suppliers"
     - Divider: `.stat-divider` (1px vertical line, 33px height)

  3. **Supplying Stat**
     - Value: "556"
     - Sub: "Supplying"

**Network Pill** (`.network-pill`):
- Layout: Vertical flex, centered, gap 6px
- Progress bar (`.network-track`):
  - Width: 112px, height: 12px
  - Background: rgba(120, 120, 128, 0.16)
  - Fill (`.network-fill`): 22.4% width, color #ff3b30 (red)
- Label: "Business network"
  - Font: 15px, weight 300, opacity 0.5

---

### 3. Social Row (`profile-social`)
**Position**: Below stats card  
**Class**: `.profile-social`  
**Layout**: Horizontal flex, centered, gap 16px

**Icons** (20×20px each):
- Email: `/assets/profile/email_outlined.svg`
- Dot separator: `/assets/profile/dot.svg` (3×3px)
- Instagram: `/assets/profile/instagram.svg`
- Dot separator: `/assets/profile/dot.svg` (3×3px)
- LinkedIn: `/assets/profile/linkedin.svg`

---

### 4. Action Buttons (`profile-actions`)
**Position**: Below social row  
**Class**: `.profile-actions`  
**Container**: 382px wide, horizontal flex, gap 8px

**Buttons** (each flex: 1, height 56px, border-radius 56px):

1. **Edit Profile Button**
   - Class: `.btn.profile-edit`
   - Text: "Edit profile"
   - Background: #48484a (dark gray)
   - Color: #fff
   - Hover: #5a5a5c
   - **Current functionality**: No onClick handler (placeholder)

2. **Inbox Button**
   - Class: `.btn.profile-inbox`
   - Text: "Inbox"
   - Background: #ff2d55 (pink/red)
   - Color: #fff
   - Hover: #ff1a42
   - **Current functionality**: No onClick handler (placeholder)

---

## Floating Action Button (FAB)

**Location**: BottomGlassBar (center)  
**Trigger**: `onDollarClick={openDirectPaymentSheet}`  
**Functionality**: Opens `DepositSheet` with `variant="direct-payment"`  
**Visual**: Dollar sign icon in black circular container (72×72px), positioned above bottom glass nav

---

## Modal/Sheet Components (Conditionally Rendered)

All sheets are controlled by state and rendered at the bottom of the component tree:

1. **DepositSheet** (Direct Payment)
   - Trigger: Dollar button click
   - Variant: `direct-payment`
   - Options: Email/Phone, External USDT Wallet, GoBankless Handle

2. **DepositSheet** (Deposit)
   - Variant: `deposit`
   - Options: Direct bank transfer, Debit or Credit, Crypto wallet

3. **WithdrawSheet**
   - Options: Bank account, External crypto wallet

4. **AmountSheet**
   - Mode: `deposit` | `withdraw` | `send`
   - Contains numeric keypad

5. **SendDetailsSheet**
   - For send flow (email/wallet/brics)

6. **SuccessSheet**
   - Shows payment success confirmation

---

## Conditional Logic

- **No conditional rendering** based on user ownership or permissions
- All buttons are always visible (Edit Profile, Inbox)
- All stats and content are static/hardcoded

---

## Reusable Elements for Future Features

### Easily Reusable Components:

1. **Stats Card Pattern** (`.profile-stats-card`)
   - Can be duplicated for "Transactions" section
   - Stats row pattern can show transaction counts, totals, etc.

2. **Action Buttons Row** (`.profile-actions`)
   - Pattern can be reused for "Autonomous mode" toggle
   - Can add more buttons (e.g., "Settings", "Transactions")

3. **Network Pill Pattern** (`.network-pill`)
   - Progress bar can be reused for other metrics
   - Can change colors/states for different indicators

4. **Meta Row Pattern** (`.profile-meta`)
   - Can be reused for additional metadata rows
   - Icon + text pattern is consistent

5. **Social Row Pattern** (`.profile-social`)
   - Can be extended with more social links
   - Icon spacing pattern is reusable

### Layout Containers:

- **`.profile-header`**: Centered, vertical stack - can wrap new header sections
- **`.content`**: Main scrollable container - can add new sections below existing ones
- **Glass bar overlay**: Already handles top/bottom navigation consistently

---

## Button Functionality & Routes

### Current State:
- **Edit Profile**: No handler (placeholder button)
- **Inbox**: No handler (placeholder button)
- **Dollar FAB**: Opens Direct Payment modal (fully functional)
- **Top icons** (Scan/Export): No handlers (visual only)

### Navigation:
- **Home icon**: Links to `/` (via BottomGlassBar)
- **Profile icon**: Links to `/profile` (via BottomGlassBar, currently active)

---

## Styling Notes

- **Color scheme**: Black text on white background
- **Glassmorphism**: Stats card uses backdrop-filter blur
- **Spacing**: Consistent 8-16px gaps between elements
- **Typography**: Inter font family, various weights (300, 400, 600)
- **Responsive**: Fixed width containers (382px) centered in mobile frame

---

## Additional Notes

- **ProfileDark.tsx** exists but is not currently used in the profile page
- All profile assets are in `/public/assets/profile/`
- The page uses the same glass bar overlay system as the home page
- All transaction flows (deposit/withdraw/send) are wired and functional via the dollar button

---

## Changes (Post-Audit)

### Inbox → Transactions Rename
- **Button label**: Changed from "Inbox" to "Transactions"
- **Class name**: Kept `.profile-inbox` for backward compatibility
- **Functionality**: Wired to navigate to `/transactions` page
- **Route**: Created `src/app/transactions/page.tsx` with transaction list view
- **Navigation**: BottomGlassBar highlights Profile icon when on `/transactions` route

### Autonomous Mode Pill
- **Placement**: Added below `.profile-handle`, above `.profile-bio` in `.profile-header`
- **Component**: `.autonomy-pill` with label "Autonomous mode" and value "100%"
- **Styling**: Compact pill (36px height, rounded, glassmorphism effect)
- **Accessibility**: `aria-label="Autonomous mode level"`, `aria-live="polite"` on value
- **State**: Visual only for now, TODO comment added for future state/hook integration
- **CSS**: Added to `src/app/globals.css` (`.autonomy-pill`, `.autonomy-label`, `.autonomy-value`)

### Transactions Page
- **Location**: `src/app/transactions/page.tsx`
- **Layout**: Reuses same glass bar overlay system
- **Content**: Simple list of transactions with amount, age, and note
- **Styling**: Neutral grayscale, dividers between items
- **Demo data**: 4 sample transactions showing autonomous mode actions


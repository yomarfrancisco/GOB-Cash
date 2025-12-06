# GoBankless Unauthenticated State Documentation

**Purpose**: Detailed documentation of functionality, structure, and text content for unauthenticated users across Home, Sign Up, Sign In, and Search pages. This document is for copy review and agent understanding.

**Date**: 2025-01-27

---

## 1. HOME PAGE (`/`) - Unauthenticated State

### Page Structure

The home page displays a mobile-first interface with scrollable content, glass navigation bars, and interactive card/map sections.

### Header Section

**Title Text**:
- **Main Heading**: `"Pay anyone anywhere"`
- **Subtitle**: `"Free, private, and bankless."`

**Functionality**:
- Title and subtitle are always visible at the top of the page
- Help icon (`?`) appears next to the title
- Clicking the help icon opens the Wallet Helper Sheet (explains the current wallet card)

### Card Stack Section

**Visual Elements**:
- Swipeable card carousel showing 6 wallet types:
  1. ZAR (savings) - Cash Card
  2. MZN - Cash Card
  3. ZWD - Cash Card
  4. ETH (yield) - Crypto Card
  5. BTC - Crypto Card
  6. Earnings (yieldSurprise) - Earnings Card

**Functionality**:
- Cards are swipeable horizontally
- Cards automatically flip/rotate in demo mode (when not authenticated)
- Cards show wallet balances, APY percentages, and wallet type labels
- **Card click behavior**: When unauthenticated, clicking a card triggers the auth flow (opens sign-up sheet)
- **Helper icon (`?`)**: Opens Wallet Helper Sheet explaining the currently visible wallet card

**Text Content on Cards**:
- Card type labels: "CASH CARD" (for ZAR, MZN, ZWD) or "CRYPTO CARD" (for ETH, BTC) or "EARNINGS" (for Earnings wallet)
- Balance amounts (e.g., "R 200,00")
- APY percentages (e.g., "9.38% APY")
- Status labels vary by card type

### Map Section

**Section Header**:
- **Title**: `"Send hard cash anywhere"`
- **Subtitle**: `"Vetted agents collect and deliver cash door-to-door globally."`
- **Help icon (`?`)**: Opens Map Helper Sheet explaining the agent network

**Map Component**:
- Interactive Mapbox map showing SADC region (Southern Africa)
- Displays branch markers and agent locations
- **Map click behavior**: When unauthenticated, clicking the map triggers the auth flow (opens sign-up sheet)
- Map shows default view centered on SADC region with zoom level 4.2

**Map Footer** (BranchManagerFooter):
- **Left side**:
  - Four agent avatar images (circular, overlapping)
  - Text: `"4 agents nearby"` (number is dynamic)
- **Right side**:
  - Helicopter icon button
  - **Helicopter click behavior**: When unauthenticated, triggers auth flow (opens sign-up sheet)

### Navigation Bars

**Top Glass Bar**:
- Scan QR code button (top-left)
- **Scan button behavior**: When unauthenticated, triggers auth flow
- Share/Export button (top-right)

**Bottom Glass Bar**:
- Navigation tabs: Home, $ (Pay/Request), Profile, Search
- **$ button behavior**: When unauthenticated, triggers auth flow (opens sign-up sheet)
- **Profile button behavior**: When unauthenticated, triggers auth flow
- **Search button**: Opens Search Sheet (works without auth)

### Demo Features (Unauthenticated Only)

**Auto-Play Behaviors**:
- Card animations: Cards automatically flip/rotate to show different wallets
- AI action cycle: Simulated wallet activity animations
- Demo notifications: System generates demo notifications about payments, trades, etc.
- Ama chat intro: After 30 seconds on page, Ama chat sheet automatically opens, stays open for 14 seconds, then closes

**Note**: All demo animations and notifications stop immediately when user authenticates.

### Interactive Elements Summary

**Requires Authentication** (triggers sign-up flow):
- Card clicks
- Map clicks
- Helicopter button
- $ (Pay/Request) button
- Scan QR button
- Profile button

**Works Without Authentication**:
- Search button (opens Search Sheet)
- Help icons (open helper sheets)
- Scrolling and card swiping (view-only)

---

## 2. SIGN UP PAGE (AuthEntrySheet - Signup Mode)

### Sheet Structure

Full-screen action sheet with hand artwork background image. Opens when user triggers any authenticated action or explicitly opens sign-up.

### Header

**Logo**:
- Image: `/assets/sign up black2.png`
- Alt text: "Sign Up"
- Position: Top-left corner
- Size: 120x120px

### Main Content

**Primary Sign-Up Options**:

1. **"Sign up with Google" Button**:
   - Text: `"Sign up with Google"`
   - Icon: Google logo (`/assets/Group.svg`)
   - **Functionality**: Currently logs to console "Google auth coming soon" (not yet implemented)
   - Styled as primary social button

2. **"Sign up with phone number" Button**:
   - Text: `"Sign up with phone number"`
   - Icon: Phone icon (`/assets/Phone-icon.svg`)
   - **Functionality**: 
     - Clicking transforms the button into a phone input field
     - Input placeholder: `"WhatsApp phone number"`
     - Submit button (arrow up icon) appears when text is entered
     - On submit, opens PhoneSignupSheet (password creation step)

**Switch to Login**:
- Text: `"Already have an account? Log in"`
- "Log in" is a clickable link
- **Functionality**: Switches sheet to login mode (same sheet, different content)

**Legal Text** (at bottom):
```
"Gobankless is a service provider of the National Stokvel Association of
South Africa, an authorised Financial Services Provider (FSP 52815) and
Co-operative bank (Certificate no. CFI0024)."
```

### Phone Sign-Up Flow (PhoneSignupSheet)

**Trigger**: After entering phone number in AuthEntrySheet and submitting.

**Sheet Structure**:
- Full-screen action sheet with phone background image
- Back button (chevron left) in top-left corner

**Form Content**:

1. **Password Input**:
   - Placeholder: `"Create a password"`
   - Type: Password field (masked)
   - Submit button (arrow up icon) always visible, disabled until password entered
   - **Functionality**: 
     - Button enables when password has text
     - On submit, creates account and shows success notification
     - Success notification text: `"Your GoBankless account has been created."`
     - After success, closes all auth sheets and returns to home page

2. **Switch to Login**:
   - Text: `"Already have an account? Log in"`
   - "Log in" is a clickable link
   - **Functionality**: Closes phone signup sheet and opens AuthEntrySheet in login mode

3. **Legal Text** (same as AuthEntrySheet):
```
"Gobankless is a service provider of the National Stokvel Association of
South Africa, an authorised Financial Services Provider (FSP 52815) and
Co-operative bank (Certificate no. CFI0024)."
```

---

## 3. SIGN IN PAGE (AuthEntrySheet - Login Mode)

### Sheet Structure

Same sheet as sign-up, but with different logo and content. Opens when user clicks "Log in" link or explicitly opens login.

### Header

**Logo**:
- Image: `/assets/bankless pink2.png`
- Alt text: "GoBankless"
- Position: Top-left corner
- Size: 120x120px

### Main Content

**Primary Sign-In Options**:

1. **"Continue with Google" Button**:
   - Text: `"Continue with Google"`
   - Icon: Google logo (`/assets/Group.svg`)
   - **Functionality**: Currently logs to console "Google auth coming soon" (not yet implemented)
   - Styled as primary social button

2. **Divider**:
   - Text: `"or"` (centered between two lines)

3. **Username/Phone Input**:
   - Placeholder: `"Username or phone number"`
   - Type: Text input (pill-shaped)
   - Submit button (arrow up icon) appears when text is entered
   - **Functionality**: 
     - On submit, saves identifier and opens password sheet (AuthModal)
     - Validates that input is not empty

**Switch to Sign Up**:
- Text: `"Don't have an account? Sign up"`
- "Sign up" is a clickable link
- **Functionality**: Switches sheet to signup mode

**Legal Text** (at bottom):
```
"Gobankless is a service provider of the National Stokvel Association of
South Africa, an authorised Financial Services Provider (FSP 52815) and
Co-operative bank (Certificate no. CFI0024)."
```

### Password Sign-In Flow (AuthModal)

**Trigger**: After entering username/phone in AuthEntrySheet (login mode) and submitting.

**Sheet Structure**:
- Full-screen action sheet with hand artwork background image
- Back button (chevron left) in top-left corner

**Form Content**:

1. **Password Input**:
   - Placeholder: `"Password"`
   - Type: Password field (masked)
   - Submit button (arrow up icon) always visible, disabled until password entered
   - **Functionality**: 
     - Button enables when password has text
     - Validates password against member password: `"brics2025"`
     - On incorrect password: Shows error message `"Incorrect member password"`
     - On correct password: Authenticates user, closes all auth sheets, returns to home page

2. **Error Display**:
   - Text: `"Incorrect member password"` (red text, appears below input)
   - Only shown when password validation fails

3. **Legal Text** (same as other auth sheets):
```
"Gobankless is a service provider of the National Stokvel Association of
South Africa, an authorised Financial Services Provider (FSP 52815) and
Co-operative bank (Certificate no. CFI0024)."
```

**Note**: No "switch to sign up" link on password sheet - user must use back button to return to login entry.

---

## 4. SEARCH PAGE (SearchSheet)

### Sheet Structure

Tall action sheet that slides up from bottom. Accessible via Search button in bottom navigation bar (works without authentication).

### Header

**Title**: `"Search"`

### Main Content

**Subtitle**:
- Text: `"Find cash agents and community members near you."`

**Divider**: Horizontal line separator

**Search Bar**:
- Search icon (magnifying glass) on left
- Input placeholder: `"Search cash agents"`
- **Functionality**: 
  - Text input for searching (currently no filtering implemented - shows default contacts)
  - Search query is stored but not used for filtering yet

**Default Contacts List**:

1. **Contact 1**:
   - Handle: `"$ama"`
   - Subtitle: `"Portfolio Manager"`
   - Avatar: `/assets/Brics-girl-blue.png`
   - **Click behavior (unauthenticated)**: 
     - Closes search sheet
     - Navigates to `/profile/ama?fromSearch=1` (full-page profile view)

2. **Contact 2**:
   - Handle: `"$ariel"`
   - Subtitle: `"Large Cash Payments Manager"`
   - Avatar: `/assets/avatar - profile (3).png`
   - **Click behavior (unauthenticated)**: 
     - Closes search sheet
     - Navigates to `/profile/ariel?fromSearch=1` (full-page profile view)

**Note**: When authenticated, clicking contacts opens profile in a sheet overlay instead of navigating to full page.

---

## Summary: Unauthenticated User Journey

### Entry Points to Auth Flow

Users are prompted to sign up when they attempt to:
1. Click any wallet card
2. Click the map
3. Click the helicopter button
4. Click the $ (Pay/Request) button
5. Click the Scan QR button
6. Click the Profile button

### Available Without Auth

1. **View home page**: See cards, map, read content
2. **Swipe cards**: Browse different wallet types
3. **View helper sheets**: Click `?` icons to learn about wallets and map
4. **Search**: Open search sheet and view default contacts
5. **View profiles**: Click search results to view public profiles

### Auth Flow Steps

**Sign Up**:
1. AuthEntrySheet (signup mode) → Choose Google or phone
2. If phone → Enter phone number → PhoneSignupSheet
3. PhoneSignupSheet → Create password → Account created → Return to home

**Sign In**:
1. AuthEntrySheet (login mode) → Choose Google or enter username/phone
2. If username/phone → AuthModal (password sheet)
3. AuthModal → Enter password → Authenticated → Return to home

### Key Copy Elements

**Home Page**:
- `"Pay anyone anywhere"` (title)
- `"Free, private, and bankless."` (subtitle)
- `"Send hard cash anywhere"` (map section title)
- `"Vetted agents collect and deliver cash door-to-door globally."` (map subtitle)
- `"4 agents nearby"` (map footer)

**Sign Up**:
- `"Sign up with Google"`
- `"Sign up with phone number"`
- `"WhatsApp phone number"` (phone input placeholder)
- `"Create a password"` (password input placeholder)
- `"Already have an account? Log in"`
- `"Your GoBankless account has been created."` (success notification)

**Sign In**:
- `"Continue with Google"`
- `"Username or phone number"` (input placeholder)
- `"Password"` (password input placeholder)
- `"Incorrect member password"` (error message)
- `"Don't have an account? Sign up"`

**Search**:
- `"Search"` (title)
- `"Find cash agents and community members near you."` (subtitle)
- `"Search cash agents"` (input placeholder)
- `"$ama"` / `"Portfolio Manager"` (contact 1)
- `"$ariel"` / `"Large Cash Payments Manager"` (contact 2)

**Legal Text** (appears on all auth sheets):
```
"Gobankless is a service provider of the National Stokvel Association of
South Africa, an authorised Financial Services Provider (FSP 52815) and
Co-operative bank (Certificate no. CFI0024)."
```

---

**End of Documentation**


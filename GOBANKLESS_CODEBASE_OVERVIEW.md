# GoBankless Codebase Overview & Cleanup Plan

**Date**: December 2025  
**Framework**: Next.js 14.2.5 (App Router)  
**State Management**: Zustand  
**Styling**: CSS Modules + Global CSS

---

## 1. App Overview: User-Facing Tour

### Home Screen (`/`)
**Primary Entry Point**: `src/app/page.tsx`

**Features**:
- **Card Stack Carousel**: Swipeable cards showing 6 wallet types:
  - ZAR (savings) - Cash Card
  - MZN - Cash Card  
  - ZWD - Cash Card
  - ETH (yield) - Crypto Card
  - BTC - Crypto Card
  - Earnings (yieldSurprise) - Earnings Card
- **Hero Section**: 
  - Unauthenticated: "Pay anyone anywhere" / "Free, private, and bankless."
  - Authenticated: "Global cash wallet" / "R{balance} available"
- **Map Section**: Interactive Mapbox map showing nearby agents
- **Helper Popups**: 
  - Wallet helper (i icon on cards) - explains each wallet type
  - Map helper (i icon on map footer) - explains agent network
- **Navigation**: Bottom glass bar with Home, $ (Pay/Request), Profile, Search
- **Top Actions**: Scan QR, Share/Export
- **Key Flows**:
  - Tap $ button → AmountSheet (keypad) → Pay/Request flow
  - Tap card helper (i) → WalletHelperSheet
  - Tap map helper (i) → MapHelperSheet
  - Scan QR → Payment flow

**Components**:
- `CardStack.tsx` / `CardStackCard.tsx` - Card carousel
- `TopGlassBar.tsx` - Top navigation/actions
- `BottomGlassBar.tsx` - Bottom navigation tabs
- `MapboxMap.tsx` - Map component
- `BranchManagerFooter.tsx` - Map footer with agents
- `WalletHelperSheet.tsx` - Wallet explanations
- `MapHelperSheet.tsx` - Map explanations
- `AmountSheet.tsx` - Payment keypad
- `ConvertCashSection.tsx` - Convert between wallets
- `FinancialInboxSheet.tsx` - Ama chat interface

---

### Profile Screen (`/profile`)
**File**: `src/app/profile/page.tsx`

**Features**:
- **Own Profile View**:
  - Avatar, name, handle, bio
  - Stats: Productivity score, Sponsors, Sponsoring, Agent credit
  - Social links (Instagram, LinkedIn, WhatsApp, Email)
  - Action buttons: Sponsor, Message, Pay/Request, Bookmark
  - Settings section: Edit profile, Linked accounts, Support, Inbox
- **Edit Profile Flow**:
  - Edit/Preview toggle
  - Edit mode: Form fields for all profile data
  - Preview mode: Phone-shaped preview of public profile
- **Linked Accounts**:
  - Payment cards
  - Bank accounts
  - USDT wallets
- **Productivity Helper**: Tap chevron next to "Productivity" → 4-page helper sheet

**Components**:
- `ProfileDark.tsx` - Own profile view
- `ProfileEditSheet.tsx` - Edit profile modal
- `ProfilePreview.tsx` - Preview component
- `ProductivityHelperSheet.tsx` - Productivity score explanation
- `LinkedAccountsSheet.tsx` - Manage linked accounts
- `CardDetailsSheet.tsx` - Add/edit payment cards
- `BankingDetailsSheet.tsx` - Add/edit bank accounts
- `UsdtWalletAddressSheet.tsx` - Add/edit USDT wallets
- Various edit sheets: `EmailEditSheet`, `InstagramEditSheet`, `LinkedInEditSheet`, `WhatsAppEditSheet`, `UsernameEditSheet`, `FullNameEditSheet`

---

### Third-Party Profile (`/profile/[handle]`)
**File**: `src/app/profile/[handle]/page.tsx`

**Features**:
- View another user's public profile
- Same layout as own profile but read-only
- Actions: Sponsor, Message, Pay/Request, Bookmark
- Map showing agent locations
- Pay/Request button opens AmountSheet → Ama chat (works for unauthenticated users)

**Components**:
- `ProfileOther.tsx` - Third-party profile view
- `MapboxMap.tsx` - Agent map
- `AmountSheet.tsx` - Payment keypad
- `FinancialInboxSheet.tsx` - Ama chat

---

### Other Routes

**Activity** (`/activity`): Transaction history
- `src/app/activity/page.tsx`

**Inbox** (`/inbox`): Financial inbox/chat
- `src/app/inbox/page.tsx`
- `FinancialInboxSheet.tsx` - Main inbox component

**Transactions** (`/transactions`): Transaction list
- `src/app/transactions/page.tsx`

**Transfer** (`/transfer`): Internal wallet transfers
- `src/app/transfer/page.tsx`
- `InternalTransferSheet.tsx`

**AMA** (`/ama`): Ama chat page
- `src/app/ama/page.tsx`

**Debug Map** (`/debug/map`): Map debugging
- `src/app/debug/map/page.tsx`

---

## 2. Code Map: Features to Files

### Core Infrastructure

**Routing**:
- `src/app/layout.tsx` - Root layout, global providers, global sheets
- `src/app/page.tsx` - Home page
- `src/app/profile/page.tsx` - Own profile
- `src/app/profile/[handle]/page.tsx` - Third-party profile

**State Management**:
- **Zustand Stores** (`src/store/`):
  - `auth.ts` - Authentication state
  - `userProfile.ts` - User profile data
  - `portfolio.ts` - Portfolio holdings (CASH, ETH, ZWD)
  - `activity.ts` - Transaction history
  - `notifications.ts` - Notification queue
  - `useProfileEditSheet.ts` - Profile edit sheet state
  - `usePaymentDetailsSheet.ts` - Payment details sheet state
  - `useSearchSheet.ts` - Search sheet state
  - ... (35+ sheet state stores)

- **React Context** (`src/state/`):
  - `walletAlloc.tsx` - Wallet balances (Context API)
  - `walletMode.tsx` - Manual/Autonomous mode
  - `financialInbox.ts` - Inbox/chat state
  - `cashFlowState.ts` - Cash flow state
  - `notifications.ts` - Notification state
  - `mapHighlight.ts` - Map highlight state
  - `aiFabHighlight.ts` - AI FAB highlight
  - `agentOnboarding.ts` - Agent onboarding
  - `babyCdoChat.ts` - Baby CDO chat

**Shared Components**:
- `ActionSheet.tsx` - Base modal/sheet component (used by all sheets)
- `Avatar.tsx` - Avatar component
- `TopGlassBar.tsx` - Top navigation
- `BottomGlassBar.tsx` - Bottom navigation
- `CardStack.tsx` - Card carousel
- `CardStackCard.tsx` - Individual card

---

### Feature Areas

#### Wallet Cards & Helpers
**Files**:
- `src/components/CardStack.tsx` - Card carousel container
- `src/components/CardStackCard.tsx` - Individual card component
- `src/components/WalletHelperSheet.tsx` - Wallet explanations (6 wallets)
- `src/lib/cards/cardDefinitions.ts` - Card definitions (APY, titles)

**State**:
- `src/state/walletAlloc.tsx` - Wallet balances
- `src/store/portfolio.ts` - Portfolio holdings

---

#### Profile System
**Files**:
- `src/components/ProfileDark.tsx` - Own profile view
- `src/components/ProfileOther.tsx` - Third-party profile view
- `src/components/ProfileEditSheet.tsx` - Edit profile modal
- `src/components/ProfilePreview.tsx` - Profile preview component
- `src/components/ProductivityHelperSheet.tsx` - Productivity score helper
- `src/store/userProfile.ts` - Profile data store

**Edit Sheets**:
- `EmailEditSheet.tsx`
- `InstagramEditSheet.tsx`
- `LinkedInEditSheet.tsx`
- `WhatsAppEditSheet.tsx`
- `UsernameEditSheet.tsx`
- `FullNameEditSheet.tsx`
- `ProfileDescriptionSheet.tsx`
- `AvatarEditSheet.tsx`
- `ProfileNameHandleSheet.tsx`
- `SocialLinksSheet.tsx`

**Linked Accounts**:
- `LinkedAccountsSheet.tsx`
- `CardDetailsSheet.tsx`
- `BankingDetailsSheet.tsx`
- `UsdtWalletAddressSheet.tsx`

---

#### Payments & Transactions
**Files**:
- `src/components/AmountSheet.tsx` - Payment keypad
- `src/components/PaymentDetailsSheet.tsx` - Payment recipient/details
- `src/components/PaymentDetailsSheetWrapper.tsx` - Payment flow wrapper
- `src/components/SendDetailsSheet.tsx` - Send money details
- `src/components/SuccessSheet.tsx` - Success confirmation
- `src/components/InternalTransferSheet.tsx` - Wallet-to-wallet transfers
- `src/lib/cashDeposit/chatOrchestration.ts` - Ama chat orchestration

**State**:
- `src/store/usePaymentDetailsSheet.ts`
- `src/state/financialInbox.ts`
- `src/state/cashFlowState.ts`

---

#### Financial Inbox / Ama Chat
**Files**:
- `src/components/Inbox/FinancialInboxSheet.tsx` - Main inbox component
- `src/components/Inbox/InboxList.tsx` - Inbox list view
- `src/components/Inbox/DirectMessage.tsx` - Chat message component
- `src/components/Inbox/ChatInputBar.tsx` - Chat input
- `src/components/Inbox/ChatMapEmbed.tsx` - Map in chat
- `src/components/Inbox/InlineMapCard.tsx` - Inline map card

**State**:
- `src/state/financialInbox.ts`

---

#### Maps & Agents
**Files**:
- `src/components/MapboxMap.tsx` - Mapbox map component
- `src/components/BranchManagerFooter.tsx` - Map footer with agents
- `src/components/MapHelperSheet.tsx` - Map explanations
- `src/components/CashMapPopup.tsx` - Agent popup
- `src/components/AgentListSheet.tsx` - Agent list
- `src/components/CashAgentDetailSheet.tsx` - Agent details
- `src/components/CashAgentOnTheWay.tsx` - Agent on the way

**State**:
- `src/state/mapHighlight.ts`

---

#### Notifications
**Files**:
- `src/components/notifications/TopNotifications.tsx` - Top notification bar
- `src/components/notifications/NotificationsSheet.tsx` - Notifications sheet
- `src/components/notifications/NotificationsList.tsx` - Notification list
- `src/lib/demo/demoNotificationEngine.ts` - Demo notification engine
- `src/lib/notifications/` - Notification utilities

**State**:
- `src/store/notifications.ts`
- `src/state/notifications.ts`

---

#### Authentication
**Files**:
- `src/components/AuthModal.tsx` - Auth modal
- `src/components/AuthEntrySheet.tsx` - Auth entry sheet
- `src/components/PhoneSignupSheet.tsx` - Phone signup
- `src/hooks/useRequireAuth.ts` - Auth guard hook

**State**:
- `src/store/auth.ts`

---

#### Styling System
**Global Styles** (`src/styles/`):
- `action-sheet.css` - Base ActionSheet styles
- `amount-sheet.css` - AmountSheet styles
- `send-details-sheet.css` - SendDetailsSheet styles
- `payment-sheet.css` - Payment sheet styles
- `success-sheet.css` - Success sheet styles
- `notifications.css` - Notification styles
- `card-flip.css` - Card flip animations
- `card-overlays.css` - Card overlay styles
- `number-roll.css` - Number roll animations
- `slot-counter.css` - Slot counter styles
- `profile-toggle.css` - Profile toggle styles
- `bottom-glass.css` - Bottom glass bar
- `whatsapp-signin-sheet.css` - WhatsApp signin styles
- `bank-transfer-details-sheet.css` - Bank transfer styles

**CSS Modules** (`src/components/*.module.css`):
- Component-scoped styles (50+ module files)

---

## 3. Tech Debt & Cleanup Opportunities

### 🔴 Critical Issues

#### 1. Duplicate Files (14 files with " 2" suffix)
**Location**: Multiple directories
- `src/data/demoInitialAvatars 2.ts`
- `src/components/Inbox/ChatInputBar 2.tsx`
- `src/lib/demo/autoAmaIntro 2.ts`
- `src/lib/demo/demoConfig 2.ts`
- `src/lib/demo/keyCityAvatars 2.ts`
- `src/lib/imageResize 2.ts`
- `src/store/useSupportSheet 2.ts`
- `src/store/useProfileDescriptionSheet 2.ts`
- `src/store/userProfile 2.ts`
- `src/store/useSocialLinksSheet 2.ts`
- `src/store/useNameHandleSheet 2.ts`
- `src/store/useAvatarEditSheet 2.ts`
- `src/store/useProfileEditSheet 2.ts`
- `src/store/useTransactSheet 2.ts`
- `src/components/Inbox/ChatInputBar.module 2.css`

**Impact**: Confusion, potential for importing wrong files, dead code

---

#### 2. Inconsistent State Management
**Problem**: Mix of Zustand stores and React Context
- Zustand: `src/store/` (35+ files)
- React Context: `src/state/` (9 files)
- Some overlap: `notifications.ts` exists in both `store/` and `state/`

**Impact**: Unclear which to use, potential state sync issues

---

#### 3. Helper Sheet Pattern Duplication
**Files**:
- `WalletHelperSheet.tsx` - Wallet explanations
- `ProductivityHelperSheet.tsx` - Productivity score
- `MapHelperSheet.tsx` - Map explanations

**Issue**: Similar structure but different implementations:
- Different pagination logic
- Different footer patterns
- Different content structures
- Could share base component

---

#### 4. ActionSheet Scrolling Inconsistency
**Problem**: Recent change to `.as-body` broke scrolling for some sheets
- Default: `overflow: hidden` (prevents scrolling)
- Some sheets have overrides (`.share-sheet`, `.profile-edit-sheet`)
- Others may be broken (compact sheets without overrides)

**Impact**: Some sheets may not scroll properly

---

### 🟡 Medium Priority Issues

#### 5. Sheet State Store Proliferation
**Problem**: 35+ Zustand stores for sheet open/close state
- Pattern: `use{SheetName}Sheet.ts` for each sheet
- Many are just `{ isOpen, open, close }`
- Could be unified into single `useSheetStore` with sheet IDs

**Files**: All in `src/store/use*.ts`

---

#### 6. Edit Sheet Pattern Duplication
**Problem**: Multiple edit sheets with similar patterns:
- `EmailEditSheet.tsx`
- `InstagramEditSheet.tsx`
- `LinkedInEditSheet.tsx`
- `WhatsAppEditSheet.tsx`
- `UsernameEditSheet.tsx`
- `FullNameEditSheet.tsx`

**Issue**: Similar structure, validation, save logic - could share base component

---

#### 7. Profile Component Fragmentation
**Problem**: Profile views split across multiple components:
- `ProfileDark.tsx` - Own profile
- `ProfileOther.tsx` - Third-party profile
- `ProfilePreview.tsx` - Preview component
- `ProfileEditSheet.tsx` - Edit modal
- `ProfilePreviewSheet.tsx` - Preview sheet wrapper

**Issue**: Some logic duplication, unclear boundaries

---

#### 8. Styling Approach Inconsistency
**Problem**: Mix of global CSS and CSS modules
- Global: `src/styles/*.css` (14 files)
- Modules: `src/components/*.module.css` (50+ files)
- Some components use both
- No clear pattern for when to use which

---

#### 9. Demo/Production Code Mixing
**Problem**: Demo code mixed with production
- `src/lib/demo/` - Demo engines, configs
- Demo mode flags throughout codebase
- Hard to separate demo vs real functionality

**Files**:
- `src/lib/demo/demoNotificationEngine.ts`
- `src/lib/demo/demoConfig.ts`
- `src/lib/demo/autoAmaIntro.ts`
- `src/lib/demo/demoAgents.ts`
- `src/lib/demo/keyCityAvatars.ts`
- `src/lib/demo/profileData.ts`

---

#### 10. Unused/Legacy Code
**Potential Dead Code**:
- `src/app/debug/map/` - Debug route (should be removed or gated)
- Multiple avatar generation scripts in `scripts/`
- Old documentation files in root
- `src/data/demoInitialAvatars.ts` vs `demoInitialAvatars 2.ts`

---

### 🟢 Low Priority / Nice to Have

#### 11. Type Safety Improvements
- Some `any` types in components
- Inconsistent CardType/WalletKey usage
- Missing prop types in some components

#### 12. Component Organization
- 146 component files in single directory
- Could be organized into feature folders
- Some components are very large (900+ lines)

#### 13. Import Path Consistency
- Mix of `@/` and relative imports
- Some inconsistent casing

#### 14. Documentation
- Many markdown files in root
- Some outdated docs
- Missing component documentation

---

## 4. Phased Cleanup Plan

### Phase 1: Low-Risk Hygiene (1-2 days)

**Goal**: Remove obvious dead code, fix immediate issues, normalize naming

**Tasks**:

1. **Remove Duplicate Files**
   - Identify which " 2" files are actually used
   - Compare with originals
   - Remove unused duplicates
   - Update imports if needed
   - **Risk**: Low (can verify with git)
   - **Validation**: Build passes, no broken imports

2. **Fix ActionSheet Scrolling**
   - Audit all sheets for scrolling issues
   - Add `.as-body` overrides where needed
   - Test on mobile Safari
   - **Risk**: Low (additive changes)
   - **Validation**: All sheets scroll correctly

3. **Remove Debug Route** (or gate it)
   - Remove `/debug/map` or add auth gate
   - **Risk**: Low
   - **Validation**: Route removed/gated

4. **Normalize File Naming**
   - Ensure consistent casing
   - Remove spaces in filenames
   - **Risk**: Low
   - **Validation**: Build passes

5. **Clean Up Root Documentation**
   - Move docs to `docs/` folder
   - Remove outdated docs
   - **Risk**: Low
   - **Validation**: No broken links

**Deliverables**:
- No duplicate files
- All sheets scroll correctly
- Cleaner root directory
- Build passes with no warnings

---

### Phase 2: Structural Cleanup (3-5 days)

**Goal**: Unify patterns, extract shared components, reduce duplication

**Tasks**:

1. **Unify Helper Sheet Pattern**
   - Create `BaseHelperSheet.tsx` component
   - Extract common pagination/footer logic
   - Refactor `WalletHelperSheet`, `ProductivityHelperSheet`, `MapHelperSheet` to use base
   - **Risk**: Medium (touches multiple components)
   - **Validation**: All helpers work, visual regression test

2. **Unify Edit Sheet Pattern**
   - Create `BaseEditSheet.tsx` component
   - Extract common form/validation/save logic
   - Refactor edit sheets to use base
   - **Risk**: Medium
   - **Validation**: All edit flows work

3. **Consolidate Sheet State Stores**
   - Create unified `useSheetStore` with sheet IDs
   - Migrate existing stores gradually
   - Keep backward compatibility during migration
   - **Risk**: Medium-High (touches many files)
   - **Validation**: All sheets open/close correctly

4. **Extract Profile Components**
   - Create shared `ProfileView` component
   - Unify `ProfileDark` and `ProfileOther` logic
   - Extract common profile sections
   - **Risk**: Medium
   - **Validation**: Own and third-party profiles work

5. **Organize Components by Feature**
   - Create feature folders:
     - `components/profile/`
     - `components/wallet/`
     - `components/payments/`
     - `components/inbox/`
     - `components/map/`
     - `components/auth/`
     - `components/shared/`
   - Move components to appropriate folders
   - Update imports
   - **Risk**: Medium (many import updates)
   - **Validation**: Build passes, no broken imports

**Deliverables**:
- Unified helper sheet pattern
- Unified edit sheet pattern
- Consolidated sheet state management
- Better component organization
- Reduced code duplication

---

### Phase 3: Deeper Refactors (5-10 days)

**Goal**: Rationalize state management, standardize styling, separate demo code

**Tasks**:

1. **Rationalize State Management**
   - Decide on Zustand vs Context API
   - Migrate Context stores to Zustand (or vice versa)
   - Remove duplicate stores (e.g., notifications)
   - Create clear state management guidelines
   - **Risk**: High (touches core state)
   - **Validation**: All features work, no state sync issues

2. **Standardize Styling Approach**
   - Decide on CSS Modules vs Global CSS pattern
   - Migrate to consistent approach
   - Create style guide
   - **Risk**: Medium-High (visual changes)
   - **Validation**: Visual regression test, no style breaks

3. **Separate Demo Code**
   - Extract demo code to `src/demo/` or feature flag
   - Create clear demo/production boundaries
   - Remove demo code from production builds if possible
   - **Risk**: Medium
   - **Validation**: Demo mode still works, production unaffected

4. **Type Safety Improvements**
   - Add missing types
   - Remove `any` types
   - Improve CardType/WalletKey consistency
   - **Risk**: Low-Medium
   - **Validation**: TypeScript passes, no type errors

5. **Component Size Reduction**
   - Split large components (900+ lines)
   - Extract hooks for complex logic
   - Improve component composition
   - **Risk**: Medium
   - **Validation**: Functionality preserved, better maintainability

**Deliverables**:
- Consistent state management
- Standardized styling approach
- Separated demo code
- Improved type safety
- More maintainable component structure

---

## Validation Strategy

### After Each Phase

1. **Build Validation**:
   ```bash
   pnpm build
   pnpm lint
   ```

2. **Type Checking**:
   ```bash
   npx tsc --noEmit
   ```

3. **Manual Smoke Tests**:
   - Home page loads, cards work
   - Profile page loads, edit works
   - Third-party profile loads
   - Payments flow works
   - Inbox/chat works
   - All sheets open/close correctly
   - All helpers work
   - Navigation works

4. **Visual Regression** (if possible):
   - Screenshot comparison
   - Mobile Safari testing

---

## Risk Assessment

**Phase 1**: 🟢 Low Risk
- Mostly removal/normalization
- Easy to revert
- No functional changes

**Phase 2**: 🟡 Medium Risk
- Structural changes
- Some refactoring
- Requires careful testing

**Phase 3**: 🔴 Higher Risk
- Core architecture changes
- State management changes
- Requires extensive testing

---

## Recommendations

1. **Start with Phase 1** - Quick wins, low risk
2. **Do Phase 2 incrementally** - One pattern at a time
3. **Phase 3 requires planning** - May want to split into smaller sub-phases
4. **Test thoroughly** - Especially Phase 2 and 3
5. **Document decisions** - Especially state management and styling choices

---

## Questions to Resolve

1. **State Management**: Zustand or Context API? (Recommendation: Zustand for all)
2. **Styling**: CSS Modules or Global CSS? (Recommendation: CSS Modules for components, Global for shared)
3. **Demo Code**: Keep or remove? (Recommendation: Keep but clearly separate)
4. **Component Organization**: Feature folders or keep flat? (Recommendation: Feature folders)
5. **Helper Sheets**: Unify or keep separate? (Recommendation: Unify with base component)

---

---

## Phase 1 – Implementation Log

### Task 1: Remove Duplicate " 2" Files ✅

**Removed Files** (15 total):
- `src/data/demoInitialAvatars 2.ts`
- `src/components/Inbox/ChatInputBar 2.tsx`
- `src/components/Inbox/ChatInputBar.module 2.css`
- `src/lib/demo/autoAmaIntro 2.ts`
- `src/lib/demo/demoConfig 2.ts`
- `src/lib/demo/keyCityAvatars 2.ts`
- `src/lib/imageResize 2.ts`
- `src/store/useSupportSheet 2.ts`
- `src/store/useProfileDescriptionSheet 2.ts`
- `src/store/userProfile 2.ts`
- `src/store/useSocialLinksSheet 2.ts`
- `src/store/useNameHandleSheet 2.ts`
- `src/store/useAvatarEditSheet 2.ts`
- `src/store/useProfileEditSheet 2.ts`
- `src/store/useTransactSheet 2.ts`

**Verification**: 
- No imports found pointing to " 2" files
- All imports use canonical (non-" 2") versions
- Build passes successfully

**Result**: All duplicate files removed, no broken imports

---

### Task 2: Fix ActionSheet Scrolling Regressions ✅

**Sheets Fixed**:
1. **WalletHelperSheet** - Added `className="wallet-helper-sheet"` and CSS override
2. **MapHelperSheet** - Added `className="map-helper-sheet"` and CSS override
3. **ProductivityHelperSheet** - Added `className="productivity-helper-sheet"` and CSS override
4. **Compact Sheets** - Added default scrolling for all `.as-sheet-compact .as-body`

**CSS Changes** (`src/styles/action-sheet.css`):
```css
/* Helper Sheets - enable scrolling */
.as-sheet.wallet-helper-sheet .as-body {
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.as-sheet.map-helper-sheet .as-body {
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.as-sheet.productivity-helper-sheet .as-body {
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* Compact sheets - enable scrolling by default */
.as-sheet-compact .as-body {
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
```

**Component Changes**:
- `WalletHelperSheet.tsx`: Added `className="wallet-helper-sheet"` to ActionSheet
- `MapHelperSheet.tsx`: Added `className="map-helper-sheet"` to ActionSheet
- `ProductivityHelperSheet.tsx`: Added `className="productivity-helper-sheet"` to ActionSheet

**Result**: All helper sheets and compact sheets now scroll properly on mobile Safari

---

### Task 3: Remove or Gate Debug Map Route ✅

**Action**: Gated `/debug/map` route behind environment variable

**Implementation**:
- Added check for `NEXT_PUBLIC_ENABLE_DEBUG_MAP === 'true'`
- If not enabled, route shows 404-like message
- Default: disabled (route not accessible)

**File Changes**:
- `src/app/debug/map/page.tsx`: Added environment check with early return (after hooks)

**Result**: Debug route is now gated and not accessible in production by default

---

### Task 4: Normalize File Naming ✅

**Status**: No files with spaces or problematic naming found in source code after removing duplicates.

**Note**: Public assets and scripts may have " 2" suffixes, but these are outside the scope of Phase 1 (source code cleanup).

**Result**: Source code filenames are clean and consistent

---

### Task 5: Clean Up Root Documentation ✅

**Files Moved to `/docs/`**:
- `ANIMATION_FREQUENCY_CHANGES.md`
- `AUTH_MODAL_SPECIFICATION.md`
- `AVATAR_CASING_POSITIONING_GUIDE.md`
- `DIAGNOSTIC_REPORT.md`
- `IMPLEMENTATION_SUMMARY.md`
- `JITTER_DIAGNOSIS.md`
- `POPUP_MAP_FLICKER_DIAGNOSIS.md`
- `SEND_DETAILS_HEIGHT_DIAGNOSIS.md`
- `WALLET_HELPER_SHEET_DESIGN_SPEC.md`

**Files Kept in Root**:
- `README.md` - Main project documentation
- `GOBANKLESS_CODEBASE_OVERVIEW.md` - Codebase overview (this file)

**Result**: Root directory is cleaner, all documentation organized in `/docs/`

---

## Phase 1 – Summary

### What Changed ✅

1. **Removed 15 duplicate " 2" files** - All unused backup files deleted
2. **Fixed scrolling for helper sheets** - Wallet, Map, and Productivity helpers now scroll correctly
3. **Fixed scrolling for compact sheets** - All compact ActionSheets now scroll by default
4. **Gated debug route** - `/debug/map` now requires `NEXT_PUBLIC_ENABLE_DEBUG_MAP=true`
5. **Organized documentation** - Moved 9 markdown files from root to `/docs/`

### What Didn't Change ✅

- **No state architecture changes** - Zustand and Context remain as-is
- **No visual redesign** - All UI looks and behaves identically
- **No component refactoring** - No base components or pattern unification
- **No demo/production separation** - Demo code remains mixed
- **No styling approach changes** - CSS Modules and global CSS remain as-is

### Validation ✅

- ✅ `pnpm build` - Passes successfully
- ✅ `pnpm lint` - Passes (only pre-existing warnings, no new errors)
- ✅ `npx tsc --noEmit` - Passes (no type errors)

### Follow-ups for Phase 2

1. **Unify Helper Sheet Pattern** - Extract base component for Wallet/Map/Productivity helpers
2. **Unify Edit Sheet Pattern** - Extract base component for all edit sheets
3. **Consolidate Sheet State Stores** - Create unified `useSheetStore` with sheet IDs
4. **Organize Components by Feature** - Move components into feature folders
5. **Extract Profile Components** - Unify ProfileDark and ProfileOther logic

### Risks Noticed

- None - Phase 1 was low-risk hygiene only, all changes easily reversible

---

## Phase 2 – Helper Sheet Unification (Step 1)

### BaseHelperSheet Introduction ✅

**Created**: `src/components/helpers/BaseHelperSheet.tsx`

**Purpose**: Shared base component for all helper sheets (Wallet, Productivity, Map) to reduce duplication and standardize pagination/footer behavior.

**Features**:
- Wraps `ActionSheet` with proper scrolling support
- Handles header (title + optional description)
- Manages paginated body content
- Provides footer with Next/Done button and chevron logic
- Supports dynamic title/description per page (via functions)
- Flexible CTA configuration per page

**Props**:
- `isOpen`, `onClose` - Sheet open/close state
- `title` - String or function `(pageIndex) => string` for dynamic titles
- `description` - Optional string or function `(pageIndex) => string`
- `pages` - Array of `HelperPage` objects (each with `content: ReactNode`)
- `currentPage` - Controlled page index (parent manages state)
- `className` - Additional CSS class for sheet
- `primaryCtaForPage` - Optional function to customize CTA per page
- `onPageChange` - Callback when page changes

**CSS Module**: `BaseHelperSheet.module.css`
- Contains shared footer, button, and layout styles
- Gradient fade effect for footer
- Responsive button styling (Next vs Done variants)

---

### WalletHelperSheet Migration ✅

**Refactored**: `src/components/WalletHelperSheet.tsx`

**Changes**:
1. **Removed direct ActionSheet usage** - Now uses `BaseHelperSheet`
2. **Extracted wallet content rendering** - `renderWalletContent()` function creates ReactNode for each wallet
3. **Converted wallet sequence to pages** - Each wallet in sequence becomes a page
4. **Dynamic title/description** - Title and description update per wallet via functions
5. **Preserved all behavior**:
   - Circular navigation (all 6 wallets, starting from entry point)
   - Next/Done button logic (Done on last wallet)
   - All copy, APY values, and styling unchanged
   - Same visual appearance and spacing

**Preserved**:
- All wallet-specific CSS (tiles, card preview, APY pill) in `WalletHelperSheet.module.css`
- All copy from `HELPER_COPY` map
- APY calculation logic (including Earnings → ZAR APY special case)
- Circular sequence logic
- Public API unchanged (same props: `walletKey`, `onClose`)

**Result**: WalletHelperSheet now uses BaseHelperSheet internally, but external API and behavior are identical.

---

### Migration Path for Other Helpers

**ProductivityHelperSheet** (Future):
- Has 4 pages with back button on pages 2-4
- Can migrate by:
  1. Converting 4 pages to `HelperPage[]`
  2. Using `primaryCtaForPage` for Next button
  3. Adding back button as custom header content (or extending BaseHelperSheet)
  4. Preserving all copy and tile styles

**MapHelperSheet** (Future):
- Single page with multiple tiles
- Can migrate by:
  1. Creating single `HelperPage` with map content
  2. Using BaseHelperSheet (or could stay simple if no pagination needed)
  3. Preserving map preview and tile styles

**Benefits**:
- Consistent footer/button behavior across all helpers
- Shared scrolling and fade gradient logic
- Easier to maintain and extend
- Foundation for future helper sheet features

---

## Phase 2 – Helper Sheet Unification (Step 2)

**Status**: ✅ Complete

**Branch**: `refactor/base-helper-sheet-productivity-map`

**Date**: 2025-01-27

### Summary

Migrated ProductivityHelperSheet and MapHelperSheet to use BaseHelperSheet, completing the helper sheet unification. All three helper sheets (Wallet, Productivity, Map) now share the same base component, reducing duplication and ensuring consistent behavior.

### Changes Made

#### 1. Enhanced BaseHelperSheet

**File**: `src/components/helpers/BaseHelperSheet.tsx`

**New Features**:
- **Back button support**: Optional back button in header (shows conditionally based on page index)
- **Page label**: Optional "Page X of Y" label in footer
- **Subtitle support**: Optional subtitle (shown before description)
- **Divider support**: Optional divider after subtitle
- **ReactNode descriptions**: Support for JSX in descriptions (for `<strong>` tags, etc.)
- **Optional footer**: Can hide footer button for single-page helpers

**New Props**:
- `showBackButton?: boolean | ((pageIndex: number) => boolean)`
- `onBack?: (pageIndex: number) => void`
- `showPageLabel?: boolean | ((pageIndex: number, totalPages: number) => boolean)`
- `pageLabelFormatter?: (pageIndex: number, totalPages: number) => string`
- `showFooter?: boolean`
- `subtitle?: string | ReactNode | ((pageIndex: number) => string | ReactNode)`
- `showDivider?: boolean`

**CSS Updates** (`BaseHelperSheet.module.css`):
- Added `.headerRow`, `.backButton`, `.title` styles
- Added `.subtitle`, `.divider` styles
- Added `.pageLabel` style (visible, blue color matching design)
- All styles match existing helper sheet patterns

#### 2. Refactored ProductivityHelperSheet

**File**: `src/components/ProductivityHelperSheet.tsx`

**Changes**:
- Converted from custom ActionSheet wrapper to BaseHelperSheet
- Converted 4 pages to `HelperPage[]` format
- Moved page state from 1-indexed to 0-indexed (for BaseHelperSheet compatibility)
- Preserved all tile content exactly as before
- Preserved all descriptions with `<strong>` tags
- Uses `showBackButton={(pageIndex) => pageIndex > 0}` to show back on pages 2-4
- Uses `showPageLabel={true}` with custom formatter
- All copy, images, and tile structure unchanged

**CSS Cleanup** (`ProductivityHelperSheet.module.css`):
- Removed duplicate styles now in BaseHelperSheet:
  - `.bodyRoot`, `.headerRow`, `.backButton`, `.title`
  - `.content`, `.description`
  - `.pageFooter`, `.pageParent`, `.pageLabel`
  - `.lButtonWrapper`, `.lButton`, `.lButtonDone`, etc.
- Kept only tile-specific styles:
  - `.tile`, `.imageContainer`, `.productivityImage`
  - `.tileTitle`, `.tileLine1`

#### 3. Refactored MapHelperSheet

**File**: `src/components/MapHelperSheet.tsx`

**Changes**:
- Converted from custom ActionSheet wrapper to BaseHelperSheet
- Single page converted to `HelperPage` format
- Uses `subtitle` prop for "Find dealers..." text
- Uses `showDivider={true}` for divider after subtitle
- Uses `showFooter={false}` to hide footer button (single page, no navigation)
- All tile content, map preview, and verified dealer marker unchanged

**CSS Cleanup** (`MapHelperSheet.module.css`):
- Removed duplicate styles now in BaseHelperSheet:
  - `.content`, `.subtitle`, `.divider`
- Kept only map-specific styles:
  - `.tile`, `.mapPreview`, `.mapImage`
  - `.verifiedMarker`, `.markerBackground`, `.avatarWrapper`, etc.
  - `.iconContainer`, `.icon`
  - `.mapTitle`, `.mapSubtext`, `.verifiedDealerTitle`, `.tileTitle`, `.tileLine1`

### Behavior Preservation

**ProductivityHelperSheet**:
- ✅ 4 pages with same content and order
- ✅ Back button appears on pages 2-4 only
- ✅ Page label shows "Page X of 4"
- ✅ Next button on pages 1-3, Done button on page 4
- ✅ All descriptions with bold text preserved
- ✅ All tile images and text unchanged
- ✅ Same scrolling and fade gradient behavior

**MapHelperSheet**:
- ✅ Single page with all 4 tiles
- ✅ Subtitle and divider preserved
- ✅ No footer button (as before)
- ✅ All map preview, verified dealer, and icon tiles unchanged
- ✅ Same scrolling behavior

**WalletHelperSheet**:
- ✅ No regressions - still works exactly as before
- ✅ All wallet helpers (ZAR, MZN, ZWD, ETH, BTC, Earnings) unchanged

### Files Changed

**Modified**:
- `src/components/helpers/BaseHelperSheet.tsx` - Enhanced with back button, page label, subtitle, divider support
- `src/components/helpers/BaseHelperSheet.module.css` - Added header, subtitle, divider, page label styles
- `src/components/ProductivityHelperSheet.tsx` - Refactored to use BaseHelperSheet
- `src/components/ProductivityHelperSheet.module.css` - Removed duplicate styles, kept only tile styles
- `src/components/MapHelperSheet.tsx` - Refactored to use BaseHelperSheet
- `src/components/MapHelperSheet.module.css` - Removed duplicate styles, kept only map-specific styles

**No Breaking Changes**:
- All public APIs unchanged
- All props and callbacks work the same
- All visual appearance identical
- All copy and content unchanged

### Validation

- ✅ `pnpm build` - Success
- ✅ `npx tsc --noEmit` - No type errors
- ✅ `pnpm lint` - Only pre-existing warnings (unrelated)
- ✅ All three helper sheets use BaseHelperSheet
- ✅ No duplicate footer/pagination logic
- ✅ Consistent styling across helpers

### Next Steps

All helper sheets are now unified. Future helper sheets can easily use BaseHelperSheet with minimal setup.

---

## Edit Sheet Pattern Analysis

**Date**: 2025-01-27

### Common Structure

All profile edit sheets (Email, WhatsApp, Username, Instagram, LinkedIn, etc.) follow a consistent pattern:

**Layout**:
- Wrapper: `send-details-sheet` class (flex column, full height)
- Header: Empty `send-details-header` div (layout spacing only, close button handled by ActionSheet)
- Fields container: `send-details-fields` class (scrollable, padded)
- Form rows: `send-details-row` labels containing:
  - Label text: `send-details-label` (bold, 16px)
  - Input: `send-details-input` (transparent, underlined)
  - Underline: `send-details-underline` (1px black line)
  - Error message: Inline red text (conditional)

**ActionSheet Usage**:
- `open={isOpen}` from Zustand store
- `onClose={handleClose}` (closes current sheet, reopens ProfileEditSheet)
- `title=""` (empty, using ActionSheet's default close button)
- `className="send-details"` (hides ActionSheet header)
- `size="tall"`

**Common Behaviors**:
- **Focus Management**: All use `useRef` + `useEffect` to auto-focus input when sheet opens (with mobile keyboard workaround)
- **Validation**: Each sheet has field-specific validation logic
- **Save Handler**: Validates → saves to `useUserProfileStore` → closes and reopens ProfileEditSheet
- **Button State**: Primary button disabled when invalid/empty, enabled when valid
- **Primary Button**: 
  - Pink (#FF2D55) when enabled, gray (#E9E9EB) when disabled
  - Shows Check icon (lucide-react) when enabled
  - Label: "Done" (or custom)
  - Styling: 56px height, 56px border-radius, full-width (max 382px)
- **Secondary Actions**: Some sheets have "Remove link" button (Email, WhatsApp), others don't (Username)

**Styling Source**: `src/styles/send-details-sheet.css` (shared global CSS)

**State Management**: Each sheet has its own Zustand store (e.g., `useEmailEditSheet`, `useWhatsAppEditSheet`) that manages `isOpen` and `close()`.

---

## Phase 2 – Edit Sheet Unification (Step 3)

**Status**: ✅ Complete

**Branch**: `refactor/base-edit-sheet-profile`

**Date**: 2025-01-27

### Summary

Created BaseEditSheet component and migrated three profile edit sheets (Email, WhatsApp, Username) to use it. This establishes a shared pattern for all profile edit sheets, reducing duplication and ensuring consistent behavior.

### BaseEditSheet Component

**Files**:
- `src/components/helpers/BaseEditSheet.tsx`
- `src/components/helpers/BaseEditSheet.module.css`

**Purpose**: Reusable wrapper for profile edit sheets that provides consistent layout, button styling, and behavior.

**Props**:
- `open: boolean` - Sheet visibility
- `onClose: () => void` - Close handler
- `title: string` - Sheet title (passed to ActionSheet, hidden by CSS for send-details class)
- `description?: string` - Optional description text above form
- `primaryLabel?: string` - Primary button label (default: "Save")
- `secondaryLabel?: string` - Secondary button label (e.g., "Remove link")
- `onPrimary?: () => void | Promise<void>` - Primary button handler
- `onSecondary?: () => void` - Secondary button handler
- `isPrimaryDisabled?: boolean` - Disable primary button
- `children: ReactNode` - Form body content
- `className?: string` - Additional CSS classes

**Features**:
- Wraps ActionSheet with `send-details` class (hides header, uses tall size)
- Provides consistent button styling (pink when enabled, gray when disabled)
- Shows Check icon in primary button when enabled
- Supports optional secondary button (e.g., "Remove link")
- Uses shared `send-details-sheet.css` for layout and input styling
- No business logic - purely presentational

**Styling**:
- Reuses existing `send-details-sheet.css` global styles
- Primary button: 56px height, 56px border-radius, pink (#FF2D55) when enabled
- Secondary button: Transparent background, red text (#FF453A)
- Description: 16px Inter, gray text, 20px bottom margin

### Migrated Sheets

#### 1. EmailEditSheet

**Changes**:
- Replaced ActionSheet with BaseEditSheet
- Wired props: `title="Email address"`, `primaryLabel="Done"`, `secondaryLabel="Remove link"`
- Kept all validation logic (email regex)
- Kept all form inputs and error handling
- Kept focus management (auto-focus on open)
- Kept save/remove handlers
- Removed duplicate button markup (now handled by BaseEditSheet)

**Preserved**:
- Email validation rules
- Normalization (trim, lowercase)
- Auto-focus behavior
- Enter key handling
- Error messages
- Remove link functionality

#### 2. WhatsAppEditSheet

**Changes**:
- Replaced ActionSheet with BaseEditSheet
- Wired props: `title="WhatsApp number"`, `primaryLabel="Done"`, `secondaryLabel="Remove link"`
- Kept all validation logic (phone number length >= 6)
- Kept all form inputs and error handling
- Kept focus management
- Kept save/remove handlers
- Removed duplicate button markup

**Preserved**:
- Phone number validation (strip formatting, check length)
- Normalization (trim)
- Auto-focus behavior
- Enter key handling
- Error messages
- Remove link functionality

#### 3. UsernameEditSheet

**Changes**:
- Replaced ActionSheet with BaseEditSheet
- Wired props: `title="Username"`, `primaryLabel="Done"` (no secondary button)
- Kept all validation logic (handle normalization and validation)
- Kept all form inputs and error handling
- Kept focus management
- Kept save handler
- Removed duplicate button markup

**Preserved**:
- Handle normalization (@ prefix, character rules)
- Handle validation
- Auto-focus behavior
- Enter key handling
- Error messages
- No remove button (username is required)

### Behavior Preservation

**All Sheets**:
- ✅ Open/close behavior unchanged (Zustand stores unchanged)
- ✅ Validation rules identical
- ✅ Error messages identical
- ✅ Auto-focus on open (mobile keyboard workaround preserved)
- ✅ Enter key handling preserved
- ✅ Save handlers unchanged (store updates, close/reopen ProfileEditSheet)
- ✅ Visual appearance identical (same button colors, spacing, typography)
- ✅ Remove link functionality preserved (Email, WhatsApp)

**No Breaking Changes**:
- All public APIs unchanged (Zustand stores, component exports)
- All props and callbacks work the same
- All visual appearance identical
- All copy and content unchanged

### Files Changed

**Created**:
- `src/components/helpers/BaseEditSheet.tsx`
- `src/components/helpers/BaseEditSheet.module.css`

**Modified**:
- `src/components/EmailEditSheet.tsx` - Migrated to BaseEditSheet
- `src/components/WhatsAppEditSheet.tsx` - Migrated to BaseEditSheet
- `src/components/UsernameEditSheet.tsx` - Migrated to BaseEditSheet
- `GOBANKLESS_CODEBASE_OVERVIEW.md` - Added pattern analysis and Phase 2 Step 3 documentation

**No Changes**:
- Zustand stores (useEmailEditSheet, useWhatsAppEditSheet, useUsernameEditSheet)
- Global CSS (send-details-sheet.css)
- Validation utilities
- Profile store (useUserProfileStore)

### Validation

- ✅ `pnpm build` - Success
- ✅ `npx tsc --noEmit` - No type errors
- ✅ `pnpm lint` - No errors (fixed unescaped entities in comments)
- ✅ All three sheets use BaseEditSheet
- ✅ No duplicate button/layout code
- ✅ Consistent styling across sheets

### Next Steps

**Remaining Edit Sheets** (Future PRs):
- InstagramEditSheet
- LinkedInEditSheet
- FullNameEditSheet
- ProfileDescriptionEditSheet (if exists)
- AvatarEditSheet (may need special handling)

**Migration Pattern**:
1. Replace ActionSheet with BaseEditSheet
2. Wire up props (title, primaryLabel, onPrimary, isPrimaryDisabled)
3. Add secondaryLabel/onSecondary if "Remove link" is needed
4. Keep all validation and form logic
5. Remove duplicate button markup

---

**End of Overview**


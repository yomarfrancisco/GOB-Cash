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

**End of Overview**


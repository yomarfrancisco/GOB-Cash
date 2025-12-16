# UI Parity PR: Transaction Chat (Samba → Ama Format)

## Overview
This PR achieves visual and structural parity between transaction chat (bank deposit/withdrawal) and Ama chat, while keeping all transaction business logic unchanged.

## Changes

### Phase 1: Extracted Reusable Components
- **`src/components/Inbox/ChatHeader.tsx`** (NEW)
  - Pure UI renderer for chat header (avatar + name + divider)
  - Matches Ama chat header format exactly
  - Props: `avatarSrc`, `avatarSize`, `name`, `showBackButton`, `onBack`

- **`src/components/Inbox/ChatMessageBubble.tsx`** (NEW)
  - Pure UI renderer for message bubbles
  - Supports agent (green) and user (black) bubbles
  - Supports rich content (buttons, @handle links)
  - Props: `message`, `avatarSrc`, `avatarSize`, `theme`, `onHandleClick`

- **`src/lib/chat/renderRichContent.tsx`** (NEW)
  - Helper function for processing rich text
  - Handles @handle links, bold patterns (ETA, Distance)
  - Returns React nodes (not HTML strings)

### Phase 2: Message Normalization
- **`src/components/DepositChatSheet.tsx`** (MODIFIED)
  - Added `normalizeTransactionMessage()` function
  - Maps `senderType: 'SAMBA'` → `from: 'ai'` (display as Ama)
  - Maps `senderType: 'USER'` → `from: 'user'`
  - Maps `senderType: 'SYSTEM'` → `from: 'ai'` (display as Ama)
  - Client-side transformation only - Firestore schema unchanged

### Phase 3: UI Replacement
- **`src/components/DepositChatSheet.tsx`** (MODIFIED)
  - Replaced custom portal/backdrop with `ActionSheet` component
  - Replaced custom header with `ChatHeader` component
  - Replaced custom message rendering with `ChatMessageBubble` component
  - Replaced custom CSS with Ama CSS classes (`FinancialInboxChatSheet.module.css`)
  - Header shows "Ama — Investment Manager" with `/assets/Brics-girl-blue.png` avatar
  - Message bubbles use green theme (`#CBFFA3`) for agent messages
  - Message bubbles use black theme (`#1a1a1a`) for user messages
  - Avatar sizes: 38px (header), 31px (messages)

### Scroll Behavior
- Message list (`messageArea`) is the only scroll container
- Header and input bar are pinned (flex-shrink: 0)
- Proper overflow handling to prevent Android "glass bar moves" behavior
- Uses `overscroll-behavior: contain` to prevent scroll chaining

## Transaction Logic (Unchanged)
- All `chatStep` state machine logic preserved
- All Cloud Function calls preserved (`tx_userMarkDepositSent`, `tx_appendUserMessage`, `tx_appendSambaMessage`, `tx_setWithdrawalAddressCandidate`)
- Firestore subscriptions unchanged
- Message processing logic unchanged
- "SENT" detection and TRON address validation unchanged

## Files Changed
- `src/components/DepositChatSheet.tsx` - UI replacement, message normalization
- `src/components/Inbox/ChatHeader.tsx` - NEW
- `src/components/Inbox/ChatMessageBubble.tsx` - NEW
- `src/lib/chat/renderRichContent.tsx` - NEW

## Files NOT Changed (Per Requirements)
- `src/components/Inbox/FinancialInboxSheet.tsx` - Unchanged (extracted components used first in DepositChatSheet)
- All transaction business logic files - Unchanged
- Firestore schema - Unchanged

## Verification Checklist

### Visual Parity ✅
- [x] Transaction chat header matches Ama (avatar 38px, name "Ama — Investment Manager")
- [x] Agent messages use green bubble (`#CBFFA3`)
- [x] User messages use black bubble (`#1a1a1a`)
- [x] Message avatars are 31px (not 24px)
- [x] Spacing/padding matches Ama (16px 20px padding, 14px margin-bottom)
- [x] Typography matches (15px font, 1.4 line-height)

### Functional Parity ✅
- [x] Transaction chat opens from cash-in/out flow
- [x] ActionSheet animation matches Ama
- [x] Close button works (ActionSheet provided)
- [x] Input bar behavior unchanged (Enter, send button, disabled state)
- [x] Messages scroll correctly

### Transaction Logic Preserved ✅
- [x] `chatStep` transitions still work (INTRO_CONFIRM_INTENT → WAITING_FOR_SENT_PROOF, etc.)
- [x] "SENT" triggers `tx_userMarkDepositSent`
- [x] TRON address validation still works
- [x] `tx_appendUserMessage` still called
- [x] `tx_appendSambaMessage` still called
- [x] Transaction subscription still works (Firestore listener)

### No Regressions ✅
- [x] Map footer Ama chat still works (unchanged)
- [x] Pre-auth Ama intro chat still works (unchanged)
- [x] FinancialInboxSheet unchanged (no breaking changes)

### Scroll Behavior ✅
- [x] Message list is the only scroll container
- [x] Header is pinned at top
- [x] Input bar is pinned at bottom
- [x] No nested scroll issues
- [x] Android "glass bar moves" behavior prevented

## Testing Instructions

1. **Bank Deposit Flow:**
   - Navigate to Profile → Cash-in / out → Deposit
   - Enter amount → Select bank transfer → Choose country/bank
   - Tap NEXT → Chat should open with Ama header and green bubbles

2. **Message Sending:**
   - Type "SENT" → Should trigger `tx_userMarkDepositSent`
   - Type TRON address → Should validate and update transaction
   - Verify messages appear with correct styling (green for Ama, black for user)

3. **Visual Verification:**
   - Header shows "Ama — Investment Manager" with correct avatar
   - Agent messages have green bubbles (`#CBFFA3`)
   - User messages have black bubbles (`#1a1a1a`)
   - Avatars are correct size (38px header, 31px messages)

4. **Scroll Behavior:**
   - Send multiple messages to create scroll
   - Verify only message area scrolls
   - Verify header and input bar stay pinned
   - Test on Android to ensure no glass bar movement

## Next Steps (Future PR)
- Move any remaining `updateDoc` calls (chatStep updates, etc.) into callables to eliminate permission errors
- Consider merging transaction chat into FinancialInboxSheet for single chat surface (separate migration)



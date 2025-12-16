# Deposit Chat Pop-up: Immediate Open + Thinking Loader + Match Standard Sheet Height

## 1. Comparison of 3 Chat Pop-up Implementations

### A) Map-Footer Chat Pop-up

**Open Path**: `BranchManagerFooter` → `openAmaChatWithScenario('cash_deposit')` → `FinancialInboxSheet` → `FinancialInboxChatSheet`

**Wrapper Component**: `ActionSheet` with `className="financialInboxSheet"`

**Height Props/CSS**:
- CSS Class: `.as-sheet.financialInboxSheet` (from `action-sheet.css`)
- Max Height: `85vh` (line 71 in `action-sheet.css`)
- Body Padding: `0` (removed default 24px padding, line 90-96)

**Layout Structure**:
- **Header**: `ChatHeader` component (avatar + name, no back button)
- **Body**: 
  - Uses `FinancialInboxChatSheet.module.css`
  - Container: `.container` (flex column, height 100%)
  - Message Area: `.messageArea` (flex: 1, overflow-y: auto, padding: 0 20px 16px 20px)
  - Input Bar: `ChatInputBar` component (sticky bottom, padding includes safe-area-inset-bottom)

**Typing Indicator**:
- Component: `TypingBubble()` function (defined in `FinancialInboxSheet.tsx` line 38-47)
- CSS Classes: 
  - `.messageBubble` + `.amaIntroTypingBubble` (line 352-356 in `FinancialInboxChatSheet.module.css`)
  - `.typingDots` (line 276-307)
- Structure: Bubble with 3 animated dots (lime green theme `#CBFFA3`)
- Usage: Rendered when `isTyping === true` (line 1345-1362 in `FinancialInboxSheet.tsx`)

**Message Rendering**:
- Uses `ChatMessageBubble` component
- Messages from `FinancialInboxStore` (in-memory Zustand store)
- No Firestore subscription

---

### B) Pre-Auth Chat Pop-up

**Component**: `BabyCdoChatSheet` (React portal, not ActionSheet)

**Wrapper**: React portal to `document.body` with custom backdrop

**Height Props/CSS**:
- Custom CSS module: `BabyCdoChatSheet.module.css`
- Height: Not using ActionSheet, so no standard height constraint
- Uses fixed positioning with backdrop overlay

**Layout Structure**:
- **Header**: Custom header with avatar + "BabyCDO" name + close button
- **Body**: 
  - `.popupBody` (flex column)
  - `.messagesContainer` (scrollable message area)
  - `.inputForm` (input + send button at bottom)

**Typing Indicator**: None found in this component

**Message Rendering**:
- Messages from `useBabyCdoChatStore` (Zustand store)
- Simple message array with `role: 'assistant' | 'user'`

---

### C) Deposit Flow Chat Pop-up

**Component**: `DepositChatSheet.tsx`

**Wrapper Component**: `ActionSheet` with `title=""` (no className specified)

**Height Props/CSS**:
- **Current**: Uses default `ActionSheet` (no `financialInboxSheet` class)
- **Default Height**: `65vh` (compact size, line 129 in `action-sheet.css`)
- **Issue**: Does NOT match map-footer chat height (85vh)

**Layout Structure**:
- **Header**: `ChatHeader` component (same as map-footer)
- **Body**: 
  - Uses `FinancialInboxChatSheet.module.css` (same CSS module as map-footer)
  - Container: `.container` (flex column)
  - Message Area: `.messageArea` (flex: 1, overflow-y: auto)
  - Input Bar: `ChatInputBar` component

**Typing Indicator**: **MISSING** - No typing indicator currently implemented

**Message Rendering**:
- Firestore subscription to `transactions/{txId}/messages`
- Real-time updates via `onSnapshot`
- Normalizes `TransactionMessage` → `NormalizedChatMessage`

**Current Flow Issue**:
- Line 900-920 in `profile/page.tsx`: Creates transaction FIRST, then opens sheet after 220ms delay
- Sheet requires `txId` prop (line 21 in `DepositChatSheet.tsx`)
- No pending state - sheet won't open until `txId` exists

---

## 2. Proposed Approach

### High-Level Strategy

**"Pending Sheet → Async Transaction → Subscribe" Pattern**

1. **Immediate Open**: Open `DepositChatSheet` instantly with `txId: null | string` (nullable)
2. **Show Thinking Bubble**: Display typing indicator immediately when `txId === null`
3. **Async Transaction Creation**: Create Firestore transaction in background (don't block)
4. **Switch to Firestore Mode**: Once `txId` exists, subscribe to `transactions/{txId}/messages`
5. **Hide Thinking Bubble**: Remove typing indicator when first AI message arrives

### State Machine

```
State: 'pending' | 'loading' | 'ready' | 'error'

pending: txId === null, show typing indicator
loading: txId exists but messages.length === 0, show typing indicator  
ready: messages.length > 0, hide typing indicator, show messages
error: transaction creation failed, show error bubble
```

---

## 3. Exact Files to Edit

### Primary Changes

1. **`src/components/DepositChatSheet.tsx`**
   - Change `txId: string` → `txId: string | null`
   - Add typing indicator rendering (reuse `TypingBubble` component)
   - Add state machine logic for pending/loading/ready/error
   - Handle `txId === null` case (show typing, don't subscribe)
   - Add error state handling

2. **`src/app/profile/page.tsx`** (lines 872-940)
   - Change flow: Open sheet FIRST, create transaction SECOND
   - Remove `setTimeout(() => setOpenDepositChat(true), 220)` delay
   - Open sheet immediately with `txId: null`
   - Pass transaction creation promise to sheet (or handle in sheet)
   - Update `depositChatTxId` state when transaction is created

3. **`src/components/DepositChatSheet.tsx`** (height fix)
   - Add `className="financialInboxSheet"` to `ActionSheet` wrapper
   - Ensure same height as map-footer chat (85vh)

### Supporting Changes

4. **`src/components/Inbox/FinancialInboxChatSheet.module.css`**
   - Already has typing indicator styles (`.typingDots`, `.amaIntroTypingBubble`)
   - No changes needed - reuse existing styles

5. **Extract `TypingBubble` component** (optional but recommended)
   - Currently defined inline in `FinancialInboxSheet.tsx` (line 38-47)
   - Extract to shared component: `src/components/Inbox/TypingBubble.tsx`
   - Reuse in both `FinancialInboxSheet` and `DepositChatSheet`

---

## 4. Typing Indicator Component Path

### Current Implementation

**Location**: `src/components/Inbox/FinancialInboxSheet.tsx` (line 38-47)

**Component**:
```typescript
function TypingBubble() {
  return (
    <div className={clsx(chatStyles.messageBubble, chatStyles.amaIntroTypingBubble)}>
      <div className={chatStyles.typingDots}>
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
```

**CSS Classes** (from `FinancialInboxChatSheet.module.css`):
- `.messageBubble` (line 107-118): Base bubble styling
- `.amaIntroTypingBubble` (line 352-356): Lime green theme override
- `.typingDots` (line 276-307): 3-dot animation

**Usage Pattern** (from `FinancialInboxSheet.tsx` line 1345-1362):
```typescript
{(isCashDepositActive || isCashWithdrawalActive) && isTyping && (
  <div className={chatStyles.messageWrapper}>
    <div className={chatStyles.messageAvatar}>
      <Image src="/assets/Brics-girl-blue.png" ... />
    </div>
    <div className={chatStyles.bubbleContainer}>
      <TypingBubble />
    </div>
  </div>
)}
```

### Reuse Strategy

**Option A**: Extract to shared component
- Create `src/components/Inbox/TypingBubble.tsx`
- Import in both `FinancialInboxSheet` and `DepositChatSheet`

**Option B**: Inline in `DepositChatSheet`
- Copy `TypingBubble` function directly into `DepositChatSheet.tsx`
- Import `chatStyles` from `FinancialInboxChatSheet.module.css`

**Recommendation**: Option A (extract to shared component) for maintainability

---

## 5. Sheet Height/Layout Standardization

### Current Mismatch

**Map-Footer Chat**:
- `ActionSheet` with `className="financialInboxSheet"`
- Max height: `85vh` (from `action-sheet.css` line 71)

**Deposit Chat**:
- `ActionSheet` with no className
- Max height: `65vh` (default compact size)

### Fix Required

**Add className to DepositChatSheet**:
```typescript
<ActionSheet 
  open={open} 
  onClose={onClose} 
  title=""
  className="financialInboxSheet"  // ← ADD THIS
>
```

**CSS Already Exists**:
- `.as-sheet.financialInboxSheet` (line 70-74 in `action-sheet.css`)
- Sets `max-height: 85vh`
- Removes default body padding (line 90-96)

**Layout Tokens** (already shared via `FinancialInboxChatSheet.module.css`):
- Container: `.container` (flex column, height 100%)
- Message Area: `.messageArea` (flex: 1, padding: 0 20px 16px 20px)
- Input Bar: `ChatInputBar` component (sticky bottom, safe-area-inset-bottom)

**Result**: Both chats will use identical height (85vh) and layout structure

---

## 6. Data-Loading Behavior (Loader Show/Hide Logic)

### State Conditions

```typescript
const showTypingIndicator = 
  txId === null ||                    // Pending: transaction not created yet
  (txId !== null && messages.length === 0) ||  // Loading: tx exists but no messages yet
  (txId !== null && transaction?.chatStep === 'INTRO_CONFIRM_INTENT' && !hasSambaMessage)  // Waiting for intro message

const hideTypingIndicator = 
  txId !== null && 
  messages.length > 0 && 
  messages.some(m => m.senderType === 'SAMBA' || m.senderType === 'SYSTEM')  // First AI message arrived
```

### Error Handling

```typescript
if (errorCreatingTx) {
  // Show error bubble (single system message)
  // Hide typing indicator
  // Allow user to retry or close
}
```

### Implementation Details

**Pending State** (`txId === null`):
- Show typing indicator immediately
- Don't subscribe to Firestore
- Wait for `txId` to be set

**Loading State** (`txId !== null && messages.length === 0`):
- Show typing indicator
- Subscribe to Firestore
- Wait for first message

**Ready State** (`messages.length > 0`):
- Hide typing indicator
- Show all messages
- Normal chat flow

**Error State**:
- Hide typing indicator
- Show error bubble: "Something went wrong. Try again."
- Allow retry or close

---

## 7. Acceptance Criteria Verification

### Mobile Safari Testing Checklist

✅ **Immediate Open**
- Tap NEXT → `DepositChatSheet` appears instantly (no 220ms delay)
- Sheet opens with `txId: null` initially

✅ **Thinking Bubble**
- Ama typing indicator appears immediately when sheet opens
- Uses same bubble style as map-footer chat (lime green, 3 dots)

✅ **Message Arrival**
- When Firestore message arrives → typing indicator disappears
- First Samba message renders normally

✅ **Height Match**
- `DepositChatSheet` height matches map-footer/pre-auth chat exactly (85vh)
- Same padding, spacing, header height

✅ **No Duplicate Messages**
- Intro message only sent once (check `sambaMessageSentRef`)
- No duplicate messages on refresh

✅ **No Layout Jumps**
- Smooth transition from pending → txId active
- No height changes when switching states
- Typing indicator removal doesn't cause jump

---

## 8. Implementation Summary

### Proposed Approach

1. **Make `txId` nullable** in `DepositChatSheet`
2. **Open sheet immediately** with `txId: null` in `profile/page.tsx`
3. **Show typing indicator** when `txId === null` or `messages.length === 0`
4. **Create transaction async** (don't block sheet opening)
5. **Update `txId` state** when transaction is created
6. **Subscribe to Firestore** once `txId` exists
7. **Hide typing indicator** when first AI message arrives
8. **Add `financialInboxSheet` className** to match height (85vh)

### Files to Edit

1. `src/components/DepositChatSheet.tsx` - Main changes
2. `src/app/profile/page.tsx` - Flow changes (lines 872-940)
3. `src/components/Inbox/TypingBubble.tsx` - Extract shared component (new file)

### Typing Indicator Reuse

- **Component**: Extract `TypingBubble` from `FinancialInboxSheet.tsx`
- **CSS**: Reuse `FinancialInboxChatSheet.module.css` (`.typingDots`, `.amaIntroTypingBubble`)
- **Structure**: Same as map-footer chat (avatar + bubble container)

### Height Standardization

- **Add className**: `className="financialInboxSheet"` to `ActionSheet` in `DepositChatSheet`
- **Result**: Both chats use `85vh` max-height
- **Layout**: Already shared via `FinancialInboxChatSheet.module.css`

---

## Next Steps

**Wait for go-ahead before implementing.**

Once approved, I will:
1. Extract `TypingBubble` to shared component
2. Update `DepositChatSheet` to support nullable `txId`
3. Update `profile/page.tsx` to open sheet immediately
4. Add typing indicator rendering logic
5. Add `financialInboxSheet` className for height match
6. Test on mobile Safari for all acceptance criteria


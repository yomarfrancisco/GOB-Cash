# Deposit Chat Implementation Plan

## Required Changes Before Implementation

### 1. Standardize DepositChatSheet to Map-Footer ActionSheet Structure

**Current Issue**: DepositChatSheet uses `ActionSheet` without `financialInboxSheet` className, resulting in 65vh height instead of 85vh.

**Changes Required**:
- Add `className="financialInboxSheet"` to `ActionSheet` in `DepositChatSheet.tsx`
- Verify structure matches `FinancialInboxSheet` exactly:
  - `ChatHeader` (includes `usernameRow` + `divider`)
  - `messageArea` (with proper padding: `0 20px 16px 20px`)
  - `ChatInputBar` (with safe-area-inset-bottom)

**Files to Edit**:
- `src/components/DepositChatSheet.tsx` (line 293): Add `className="financialInboxSheet"`

**Verification**:
- Compare before/after screenshots showing identical height (85vh) and internal spacing
- Confirm no extra ActionSheet padding (`.as-body` padding should be 0 for `financialInboxSheet`)

---

### 2. Server-Side Idempotency for Intro Message

**Current Issue**: Intro message is sent client-side (line 145-161 in `DepositChatSheet.tsx`), relying on client refs which can fail on refresh/double-tap.

**Changes Required**:

**A) Server-Side Function** (`functions/src/tx/createBankDepositRequest.ts`):
- After creating transaction, check if intro message already exists
- If `chatStep === 'INTRO_CONFIRM_INTENT'` and no existing SAMBA message with that step:
  - Generate Samba intro message server-side
  - Append as SAMBA message atomically with transaction creation
- Add `introSent: boolean` field to transaction document (or check for existing message)

**B) Client-Side** (`src/components/DepositChatSheet.tsx`):
- Remove client-side intro message sending (lines 145-161)
- Remove `sambaMessageSentRef` logic for INTRO_CONFIRM_INTENT
- Trust server-side idempotency

**Files to Edit**:
- `functions/src/tx/createBankDepositRequest.ts`: Add server-side intro message creation with idempotency check
- `src/components/DepositChatSheet.tsx`: Remove client-side intro message logic

**Idempotency Strategy**:
```typescript
// Option A: Check for existing message
const existingMessages = await txRef.collection('messages')
  .where('senderType', '==', 'SAMBA')
  .where('metadata.chatStep', '==', 'INTRO_CONFIRM_INTENT')
  .limit(1)
  .get()

if (existingMessages.empty) {
  // Create intro message
}

// Option B: Use introSent field on transaction
if (!transaction.introSent) {
  // Create intro message
  // Set introSent: true atomically
}
```

**Recommendation**: Option A (check for existing message) - more robust, no schema change needed.

---

### 3. Confirm Internal Layout Parity

**Current Structure** (FinancialInboxSheet):
```tsx
<ActionSheet className="financialInboxSheet">
  <div className={chatStyles.container}>
    <ChatHeader /> {/* includes usernameRow + divider */}
    <div className={chatStyles.messageArea}>
      {/* messages */}
    </div>
    <ChatInputBar />
  </div>
</ActionSheet>
```

**DepositChatSheet Structure** (should match exactly):
```tsx
<ActionSheet className="financialInboxSheet"> {/* ADD THIS */}
  <div className={chatStyles.container}>
    <ChatHeader /> {/* already correct */}
    <div className={chatStyles.messageArea}> {/* already correct */}
      {/* messages */}
    </div>
    <ChatInputBar /> {/* already correct */}
  </div>
</ActionSheet>
```

**CSS Verification**:
- `.as-sheet.financialInboxSheet` → `max-height: 85vh` ✅
- `.as-sheet.financialInboxSheet .as-body` → `padding: 0` ✅
- `.container` → `height: 100%`, `flex-direction: column` ✅
- `.messageArea` → `padding: 0 20px 16px 20px` ✅
- `ChatInputBar` → includes `env(safe-area-inset-bottom)` ✅

**Before/After Screenshots Required**:
- Side-by-side comparison of map-footer chat vs deposit chat
- Verify identical:
  - Sheet height (85vh)
  - Header spacing
  - Message area padding
  - Input bar safe-area behavior

---

### 4. Micro-UX: Prevent Double-Tap on NEXT Button

**Current Issue**: User can double-tap NEXT, creating duplicate transactions.

**Changes Required**:

**A) BankTransferDetailsSheet** (`src/components/BankTransferDetailsSheet.tsx`):
- Add `isSubmitting` state
- Disable NEXT button when `isSubmitting === true`
- Show pressed/loading state on button

**B) Profile Page** (`src/app/profile/page.tsx`):
- Set `isSubmitting` before transaction creation
- Re-enable only if transaction creation fails
- Pass `isSubmitting` state to `BankTransferDetailsSheet`

**Files to Edit**:
- `src/components/BankTransferDetailsSheet.tsx`: Add `isSubmitting` prop and disabled state
- `src/app/profile/page.tsx` (lines 872-940): Manage `isSubmitting` state

**Implementation**:
```typescript
// In BankTransferDetailsSheet
type Props = {
  // ... existing props
  isSubmitting?: boolean
  onNext?: () => void | Promise<void>
}

// In button
<button 
  disabled={isSubmitting}
  onClick={async () => {
    if (isSubmitting) return
    await onNext?.()
  }}
>
  {isSubmitting ? 'Creating...' : 'NEXT'}
</button>

// In profile/page.tsx
const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false)

onNext={async () => {
  setIsSubmittingDeposit(true)
  try {
    // ... create transaction
  } catch (error) {
    setIsSubmittingDeposit(false) // Re-enable on error
  }
}
```

---

## Implementation Steps (After Required Changes)

### Step 1: Extract TypingBubble Component

**File**: `src/components/Inbox/TypingBubble.tsx` (new file)

```typescript
import clsx from 'clsx'
import styles from './FinancialInboxChatSheet.module.css'

export default function TypingBubble() {
  return (
    <div className={clsx(styles.messageBubble, styles.amaIntroTypingBubble)}>
      <div className={styles.typingDots}>
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
```

**Update**: `src/components/Inbox/FinancialInboxSheet.tsx` to import and use shared component

---

### Step 2: Update DepositChatSheet for Nullable txId

**File**: `src/components/DepositChatSheet.tsx`

**Changes**:
- Change `txId: string` → `txId: string | null`
- Add typing indicator rendering when `txId === null` or `messages.length === 0`
- Handle pending state (don't subscribe when `txId === null`)
- Add error state handling

---

### Step 3: Update Profile Page Flow

**File**: `src/app/profile/page.tsx`

**Changes**:
- Open `DepositChatSheet` immediately with `txId: null`
- Create transaction async (don't block)
- Update `depositChatTxId` when transaction is created
- Remove `setTimeout` delay

---

### Step 4: Add Error Handling

**File**: `src/components/DepositChatSheet.tsx`

**Changes**:
- Add error state
- Show error bubble if transaction creation fails
- Allow retry or close

---

## File Edit Summary

### Required Changes (Before Implementation)

1. **`src/components/DepositChatSheet.tsx`**
   - Line 293: Add `className="financialInboxSheet"` to `ActionSheet`

2. **`functions/src/tx/createBankDepositRequest.ts`**
   - After line 127: Add server-side intro message creation with idempotency check
   - Check for existing SAMBA message with `INTRO_CONFIRM_INTENT` before creating

3. **`src/components/DepositChatSheet.tsx`**
   - Lines 145-161: Remove client-side intro message sending
   - Remove `sambaMessageSentRef` logic for `INTRO_CONFIRM_INTENT`

4. **`src/components/BankTransferDetailsSheet.tsx`**
   - Add `isSubmitting` prop
   - Disable NEXT button when submitting

5. **`src/app/profile/page.tsx`**
   - Add `isSubmittingDeposit` state
   - Manage state in `onNext` handler

### Implementation Changes (After Required Changes)

6. **`src/components/Inbox/TypingBubble.tsx`** (new file)
   - Extract shared typing indicator component

7. **`src/components/DepositChatSheet.tsx`**
   - Make `txId` nullable
   - Add typing indicator rendering
   - Add error state handling

8. **`src/app/profile/page.tsx`**
   - Open sheet immediately
   - Create transaction async

---

## Verification Checklist

### Layout Parity
- [ ] DepositChatSheet height matches map-footer chat (85vh)
- [ ] Header spacing identical
- [ ] Message area padding identical (0 20px 16px 20px)
- [ ] Input bar safe-area behavior identical
- [ ] No extra ActionSheet padding

### Idempotency
- [ ] Intro message sent exactly once on transaction creation
- [ ] No duplicate intro messages on refresh
- [ ] No duplicate intro messages on double-tap
- [ ] Server-side check prevents duplicates

### UX Flow
- [ ] Sheet opens immediately (no delay)
- [ ] Typing indicator appears instantly
- [ ] NEXT button disabled during submission
- [ ] Error handling works correctly
- [ ] Typing indicator disappears when first message arrives

---

## Next Steps

1. **Implement Required Changes 1-4** (standardization, idempotency, layout, double-tap prevention)
2. **Verify with screenshots** (before/after layout comparison)
3. **Get approval** for layout parity
4. **Proceed with implementation** (Steps 1-4 above)


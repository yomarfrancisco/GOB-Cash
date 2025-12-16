# Deposit Chat: Final Implementation Plan

## Summary

This document outlines the exact changes required to:
1. Standardize DepositChatSheet to match map-footer chat structure
2. Add server-side idempotency for intro message
3. Confirm layout parity
4. Implement immediate open + typing indicator
5. Prevent double-tap on NEXT button

---

## Part 1: Required Changes (Before Main Implementation)

### Change 1: Standardize ActionSheet Height

**File**: `src/components/DepositChatSheet.tsx`

**Current** (line 293):
```typescript
<ActionSheet open={open} onClose={onClose} title="">
```

**Change to**:
```typescript
<ActionSheet open={open} onClose={onClose} title="" className="financialInboxSheet">
```

**Result**: 
- Height changes from `65vh` (default compact) → `85vh` (matches map-footer)
- `.as-body` padding becomes `0` (removes default 24px padding)
- Matches exact structure of `FinancialInboxSheet`

**Verification**: 
- CSS already exists: `.as-sheet.financialInboxSheet` (line 70-74 in `action-sheet.css`)
- `.as-sheet.financialInboxSheet .as-body` (line 90-96) sets `padding: 0`

---

### Change 2: Server-Side Intro Message Idempotency

**File**: `functions/src/tx/createBankDepositRequest.ts`

**Current**: Only creates SYSTEM message, intro message sent client-side

**Change Required**: Add server-side intro message creation with idempotency check

**Implementation** (after line 127, before return):
```typescript
// After transaction is created, check if intro message already exists
// This prevents duplicates on refresh/double-tap
if (chatStep === 'INTRO_CONFIRM_INTENT') {
  const existingIntroMessages = await txRef.collection('messages')
    .where('senderType', '==', 'SAMBA')
    .limit(1)
    .get()

  if (existingIntroMessages.empty) {
    // Get user profile for personalized greeting
    const userRef = db.collection('users').doc(userId)
    const userSnap = await userRef.get()
    const userData = userSnap.data()
    
    // Extract user name (handle, fullName, or fallback)
    const handleCustomer = userData?.userHandle || 
                          userData?.fullName?.split(' ')[0] || 
                          'there'
    const amount = depositCurrency === 'MZN' ? `${amountZar.toFixed(2)}` : `${amountZar.toFixed(2)}`
    const currency = depositCurrency || 'ZAR'
    const countryName = bankCountry === 'MZ' ? 'Mozambique' : bankCountry === 'ZA' ? 'South Africa' : ''
    const bankName = bankId || 'your bank'
    const reference = depositReference || ''

    // Generate Samba intro message (matching client-side template)
    const introText = `Hi ${handleCustomer} — I'm Samba from GoBankless.\n\nTo confirm:\n\n• Deposit amount: ${amount}\n• Deposit method: Direct bank transfer\n• Country: ${countryName}\n• Bank: ${bankName}\n• You will receive: USDT (TRC-20)\n• Next step: After you send the bank transfer, reply "SENT" and upload proof of payment (screenshot or reference).\n\nWhen you're ready, send "SENT" + proof.`

    const introMsgRef = txRef.collection('messages').doc()
    const introMessage = {
      id: introMsgRef.id,
      txId,
      createdAt: now,
      senderType: 'SAMBA' as const,
      senderUid: 'samba',
      text: introText,
      metadata: {
        chatStep: 'INTRO_CONFIRM_INTENT',
      },
    }
    
    // Append intro message atomically (in same transaction if possible, or separate)
    await introMsgRef.set(introMessage)
    
    console.log(`[tx_createBankDepositRequest] Intro message created for tx ${txId}`)
  } else {
    console.log(`[tx_createBankDepositRequest] Intro message already exists for tx ${txId}, skipping`)
  }
}
```

**Note**: This duplicates the client-side `getSambaMessage` template logic server-side. The idempotency check prevents duplicates.

**Alternative**: Use `introSent` field on transaction:
```typescript
// In transaction object
introSent: false,

// After creating transaction
if (!transaction.introSent && chatStep === 'INTRO_CONFIRM_INTENT') {
  // Create intro message
  // Set introSent: true atomically
}
```

**Recommendation**: Use message existence check (more robust, no schema change)

---

### Change 3: Remove Client-Side Intro Message Logic

**File**: `src/components/DepositChatSheet.tsx`

**Remove** (lines 145-161):
```typescript
// Send initial Samba message on open
useEffect(() => {
  if (!open || !transaction || !txId) return

  // Check if we need to send intro message
  if (transaction.chatStep === 'INTRO_CONFIRM_INTENT' && !sambaMessageSentRef.current.has('INTRO_CONFIRM_INTENT')) {
    // Wait a bit for messages to load, then send intro
    setTimeout(() => {
      // Check if Samba already sent a message (from existing messages)
      const hasSambaMessage = messages.some(m => m.senderType === 'SAMBA')
      if (!hasSambaMessage) {
        sendSambaMessage(transaction.chatStep, transaction)
        sambaMessageSentRef.current.add('INTRO_CONFIRM_INTENT')
      }
    }, 1000)
  }
}, [open, transaction, messages, txId])
```

**Also Remove**: `sambaMessageSentRef` logic for `INTRO_CONFIRM_INTENT` (keep for other steps)

**Result**: Intro message is now server-side only, preventing duplicates

---

### Change 4: Prevent Double-Tap on NEXT Button

**File**: `src/components/BankTransferDetailsSheet.tsx`

**Add**:
```typescript
type BankTransferDetailsSheetProps = {
  // ... existing props
  isSubmitting?: boolean
}

// In component
export default function BankTransferDetailsSheet({
  // ... existing props
  isSubmitting = false,
}: BankTransferDetailsSheetProps) {
  // ... existing code

  // In button (line 121-134)
  <button 
    className="bank-transfer-close-btn" 
    onClick={onNext ? async () => {
      if (isSubmitting) return // Prevent double-tap
      await onNext('') // Parent handles tx creation
    } : onClose} 
    disabled={isSubmitting}
    type="button"
  >
    {isSubmitting ? 'Creating...' : (onNext ? 'NEXT' : 'CLOSE')}
  </button>
}
```

**File**: `src/app/profile/page.tsx`

**Add** (line ~870):
```typescript
const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false)

// In BankTransferDetailsSheet onNext (line 872)
onNext={async () => {
  setIsSubmittingDeposit(true) // Disable button immediately
  try {
    // ... existing transaction creation code
  } catch (error: any) {
    setIsSubmittingDeposit(false) // Re-enable on error
    // ... existing error handling
  }
  // Note: Don't set isSubmittingDeposit to false on success
  // Sheet will close, so state will reset naturally
}}

// Pass to component (line ~935)
<BankTransferDetailsSheet
  // ... existing props
  isSubmitting={isSubmittingDeposit}
/>
```

---

## Part 2: Layout Parity Verification

### Current Structure Comparison

**FinancialInboxSheet** (map-footer chat):
```tsx
<ActionSheet className="financialInboxSheet">
  <div className={chatStyles.container}>
    <ChatHeader /> {/* usernameRow + divider */}
    <div className={chatStyles.messageArea}>
      {/* messages */}
    </div>
    <ChatInputBar />
  </div>
</ActionSheet>
```

**DepositChatSheet** (after Change 1):
```tsx
<ActionSheet className="financialInboxSheet"> {/* ADDED */}
  <div className={chatStyles.container}>
    <ChatHeader /> {/* already correct */}
    <div className={chatStyles.messageArea}>
      {/* messages */}
    </div>
    <ChatInputBar />
  </div>
</ActionSheet>
```

**Result**: Structures are identical ✅

### CSS Verification

**ActionSheet**:
- `.as-sheet.financialInboxSheet` → `max-height: 85vh` ✅
- `.as-sheet.financialInboxSheet .as-body` → `padding: 0` ✅

**Container** (from `FinancialInboxChatSheet.module.css`):
- `.container` → `height: 100%`, `flex-direction: column` ✅

**Message Area**:
- `.messageArea` → `padding: 0 20px 16px 20px` ✅

**Input Bar**:
- `ChatInputBar` → includes `env(safe-area-inset-bottom)` ✅

**Result**: All CSS matches exactly ✅

---

## Part 3: Main Implementation (After Required Changes)

### Step 1: Extract TypingBubble Component

**File**: `src/components/Inbox/TypingBubble.tsx` (new)

```typescript
'use client'

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

**Update**: `src/components/Inbox/FinancialInboxSheet.tsx` (line 38-47)
- Replace inline `TypingBubble` function with import

---

### Step 2: Update DepositChatSheet for Nullable txId

**File**: `src/components/DepositChatSheet.tsx`

**Changes**:

1. **Props** (line 18-22):
```typescript
type DepositChatSheetProps = {
  open: boolean
  onClose: () => void
  txId: string | null // Changed from string
}
```

2. **State** (add after line 74):
```typescript
const [txCreationError, setTxCreationError] = useState<string | null>(null)
```

3. **Subscription Logic** (line 77-93):
```typescript
// Subscribe to messages
useEffect(() => {
  if (!open || !txId) return // Early return if txId is null

  // ... existing subscription code
}, [open, txId])
```

4. **Typing Indicator Logic** (add before return):
```typescript
// Show typing indicator when:
// - txId is null (pending)
// - txId exists but no messages yet (loading)
// - Waiting for first AI message
const showTypingIndicator = 
  txId === null || 
  (txId !== null && messages.length === 0) ||
  (txId !== null && messages.length > 0 && !messages.some(m => 
    m.senderType === 'SAMBA' || m.senderType === 'SYSTEM'
  ))

// Show error if transaction creation failed
const showError = txCreationError !== null
```

5. **Render Typing Indicator** (in messageArea, after messages):
```typescript
<div ref={messageAreaRef} className={chatStyles.messageArea}>
  {normalizedMessages.map((message) => (
    <ChatMessageBubble key={message.id} ... />
  ))}
  
  {/* Typing indicator */}
  {showTypingIndicator && !showError && (
    <div className={chatStyles.messageWrapper}>
      <div className={chatStyles.messageAvatar}>
        <Image
          src="/assets/Brics-girl-blue.png"
          alt="Ama"
          width={31}
          height={31}
          className={chatStyles.messageAvatarImage}
          sizes="31px"
          quality={92}
        />
      </div>
      <div className={chatStyles.bubbleContainer}>
        <TypingBubble />
      </div>
    </div>
  )}
  
  {/* Error message */}
  {showError && (
    <div className={chatStyles.messageWrapper}>
      <div className={chatStyles.messageAvatar}>
        <Image ... />
      </div>
      <div className={chatStyles.bubbleContainer}>
        <div className={chatStyles.messageBubble}>
          Something went wrong. Try again.
        </div>
      </div>
    </div>
  )}
  
  <div ref={messagesEndRef} />
</div>
```

6. **Import TypingBubble**:
```typescript
import TypingBubble from './Inbox/TypingBubble'
```

---

### Step 3: Update Profile Page Flow

**File**: `src/app/profile/page.tsx`

**Changes** (lines 872-940):

**Current**:
```typescript
onNext={async () => {
  try {
    // ... create transaction
    const { txId } = await tx_createBankDepositRequest({...})
    
    setOpenBankTransferDetails(false)
    setDepositChatTxId(txId)
    setTimeout(() => setOpenDepositChat(true), 220)
  } catch (error) {
    // ... error handling
  }
}}
```

**Change to**:
```typescript
onNext={async () => {
  setIsSubmittingDeposit(true)
  
  try {
    // Close bank details sheet immediately
    setOpenBankTransferDetails(false)
    
    // Open chat sheet immediately with txId: null
    setDepositChatTxId(null)
    setOpenDepositChat(true)
    
    // Create transaction async (don't block)
    const { txId } = await tx_createBankDepositRequest({
      receiverId: AGENT_UID,
      amountZar: depositAmountZAR,
      bankCountry: bankTransferCountry,
      bankId: selectedBank || (bankTransferCountry === 'MZ' ? 'BCI' : 'FNB'),
      depositCurrency: bankTransferCountry === 'MZ' ? 'MZN' : 'ZAR',
      depositReference: config.referencePrefix,
      chatStep: 'INTRO_CONFIRM_INTENT',
      depositDetails: {
        amount: depositAmountZAR,
        currency: bankTransferCountry === 'MZ' ? 'MZN' : 'ZAR',
        country: countryName,
        bankName: config.bankName,
        reference: config.referencePrefix,
      },
    })
    
    // Update txId when transaction is created
    setDepositChatTxId(txId)
  } catch (error: any) {
    setIsSubmittingDeposit(false) // Re-enable on error
    console.error('[Deposit] Failed to create transaction:', error)
    
    // Show error in chat sheet
    // We'll need to pass error state to DepositChatSheet
    const errorMessage = error?.message || 'Unknown error'
    if (errorMessage.includes('CORS') || errorMessage.includes('network') || errorMessage.includes('fetch')) {
      alert('We couldn\'t start the deposit chat. Please check your connection and try again.')
    } else {
      alert('We couldn\'t start the deposit chat. Please try again.')
    }
    
    // Close chat sheet on error (user can retry from bank details)
    setOpenDepositChat(false)
    setDepositChatTxId(null)
  }
}}
```

**Note**: Error handling in chat sheet will be handled via props (see Step 2)

---

### Step 4: Add Error Prop to DepositChatSheet

**File**: `src/components/DepositChatSheet.tsx`

**Add**:
```typescript
type DepositChatSheetProps = {
  open: boolean
  onClose: () => void
  txId: string | null
  error?: string | null // Optional error message
}

// In component
export default function DepositChatSheet({ open, onClose, txId, error }: DepositChatSheetProps) {
  // Use error prop if provided
  const [txCreationError, setTxCreationError] = useState<string | null>(error || null)
  
  // Update error state when prop changes
  useEffect(() => {
    setTxCreationError(error || null)
  }, [error])
  
  // ... rest of component
}
```

**File**: `src/app/profile/page.tsx`

**Add**:
```typescript
const [depositChatError, setDepositChatError] = useState<string | null>(null)

// In onNext catch block
setDepositChatError('Failed to create transaction. Please try again.')

// Pass to DepositChatSheet
<DepositChatSheet
  open={openDepositChat}
  onClose={() => {
    setOpenDepositChat(false)
    setDepositChatError(null)
  }}
  txId={depositChatTxId}
  error={depositChatError}
/>
```

---

## File Edit Summary

### Required Changes (Do First)

1. **`src/components/DepositChatSheet.tsx`**
   - Line 293: Add `className="financialInboxSheet"`

2. **`functions/src/tx/createBankDepositRequest.ts`**
   - After line 127: Add server-side intro message with idempotency check

3. **`src/components/DepositChatSheet.tsx`**
   - Lines 145-161: Remove client-side intro message logic
   - Remove `sambaMessageSentRef` for `INTRO_CONFIRM_INTENT`

4. **`src/components/BankTransferDetailsSheet.tsx`**
   - Add `isSubmitting` prop
   - Disable NEXT button when submitting

5. **`src/app/profile/page.tsx`**
   - Add `isSubmittingDeposit` state
   - Manage state in `onNext` handler
   - Pass `isSubmitting` to `BankTransferDetailsSheet`

### Implementation Changes (After Required Changes)

6. **`src/components/Inbox/TypingBubble.tsx`** (new file)
   - Extract shared typing indicator component

7. **`src/components/Inbox/FinancialInboxSheet.tsx`**
   - Import and use `TypingBubble` component

8. **`src/components/DepositChatSheet.tsx`**
   - Make `txId` nullable
   - Add typing indicator rendering
   - Add error state handling
   - Import `TypingBubble`

9. **`src/app/profile/page.tsx`**
   - Open sheet immediately with `txId: null`
   - Create transaction async
   - Add error state management

---

## Verification Steps

### Before Implementation
- [ ] Change 1: Add `className="financialInboxSheet"` to DepositChatSheet
- [ ] Change 2: Add server-side intro message with idempotency
- [ ] Change 3: Remove client-side intro message logic
- [ ] Change 4: Add double-tap prevention
- [ ] Screenshot: Compare DepositChatSheet vs FinancialInboxSheet height/layout

### After Implementation
- [ ] Sheet opens immediately (no delay)
- [ ] Typing indicator appears instantly
- [ ] Intro message sent exactly once (server-side)
- [ ] No duplicate messages on refresh
- [ ] NEXT button disabled during submission
- [ ] Error handling works correctly
- [ ] Typing indicator disappears when first message arrives
- [ ] Layout matches map-footer chat exactly (85vh, same padding)

---

## Next Steps

1. **Implement Required Changes 1-4**
2. **Take before/after screenshots** for layout parity verification
3. **Get approval** for layout match
4. **Proceed with main implementation** (Steps 1-4)


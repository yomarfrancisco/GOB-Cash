# Deposit Chat vs Inbox Chat Diagnosis Report

## Root Cause Analysis

### 1) UI Mismatch: Sheet Height/Width/Layout Parity

#### A) Wrapper Comparison

**DepositChatSheet** (`src/components/DepositChatSheet.tsx:299`):
```tsx
<ActionSheet open={open} onClose={onClose} title="" className="financialInboxSheet">
```

**FinancialInboxSheet** (`src/components/Inbox/FinancialInboxSheet.tsx:812`):
```tsx
<ActionSheet ... className={`${listStyles.financialInboxSheet} inboxTallSheet`}>
```

**Issue**: 
- ✅ DepositChatSheet correctly uses `className="financialInboxSheet"`
- ❌ FinancialInboxSheet uses BOTH `financialInboxSheet` (from CSS module) AND `inboxTallSheet` class
- This dual-class approach may cause CSS specificity conflicts

**ActionSheet Props Comparison**:
- DepositChatSheet: `title=""`, `size` not specified (defaults to `'compact'`)
- FinancialInboxSheet: Uses `inboxTallSheet` class which may override size

**Root Cause**: DepositChatSheet doesn't specify `size="tall"` and may be missing the `inboxTallSheet` class that FinancialInboxSheet uses.

#### B) CSS Differences

**Current CSS** (`src/styles/action-sheet.css:70-79`):
```css
.as-sheet.financialInboxSheet {
  height: 85vh; /* Fallback */
  max-height: 85vh;
  min-height: 85vh;
  height: 85dvh; /* Preferred */
  max-height: 85dvh;
  min-height: 85dvh;
  ...
}
```

**Issue**: The CSS has both `85vh` and `85dvh` declarations. The second set should override, but this is redundant.

**Additional CSS** (`src/styles/action-sheet.css:82-87`):
```css
.as-sheet.inboxTallSheet {
  border-radius: 32px 32px 0 0;
  height: 85vh;
  max-height: 85vh;
  padding-bottom: 0;
}
```

**Root Cause**: FinancialInboxSheet uses both classes, so `.inboxTallSheet` may add additional styling (border-radius, padding-bottom) that DepositChatSheet lacks.

**Container CSS** (`src/components/Inbox/FinancialInboxChatSheet.module.css`):
- Both use same `.container`, `.messageArea`, `.usernameRow` classes ✅
- Both use same `ChatHeader` component ✅
- Both use same `ChatInputBar` component ✅

**Conclusion**: The main difference is DepositChatSheet missing `inboxTallSheet` class and potentially `size="tall"` prop.

---

### 2) Missing Send Button + Input Behavior Mismatch

#### Current Implementation

**DepositChatSheet** (`src/components/DepositChatSheet.tsx:362-368`):
```tsx
<ChatInputBar
  value={inputText}
  onChange={setInputText}
  onSend={handleSend}
  placeholder="Type a message..."
  disabled={isProcessing || !txId}  // ❌ DISABLED when txId is null
/>
```

**FinancialInboxSheet** (`src/components/Inbox/FinancialInboxSheet.tsx:1367-1374`):
```tsx
<ChatInputBar
  value={inputText}
  onChange={setInputText}
  onSend={handleSend}
  placeholder="Add a message"
  onRequireAuth={!isAuthed ? openAuthEntrySignup : undefined}
  // ✅ No disabled prop - always enabled (unless auth required)
/>
```

**ChatInputBar Behavior** (`src/components/Inbox/ChatInputBar.tsx:123-134`):
- Send button only appears when `hasText && !disabled`
- If `disabled={true}`, the input is disabled AND send button never shows

**Root Cause**: 
- DepositChatSheet disables input when `txId === null` (during transaction creation)
- This prevents the send button from appearing even after typing
- FinancialInboxSheet never disables the input (only requires auth)

**Fix Requirement**: 
- Only disable input during actual processing (`isProcessing`)
- Allow input when `txId === null` (user can type while waiting)
- Show send button when text exists (even if disabled, for visual consistency)

---

### 3) Duplicate / Repetitive Messages

#### Message Creation Analysis

**Message 1: SYSTEM Message** (`functions/src/tx/createBankDepositRequest.ts:109-120`):
```typescript
const message = {
  senderType: 'SYSTEM',
  text: `Bank deposit request created for R${amountZar.toFixed(2)}. Please deposit the funds and mark as sent.`,
  metadata: { status: 'AWAITING_DEPOSIT' },
}
```
**Purpose**: Internal system log
**Display**: Shows in chat (normalized as 'ai' message)
**Action**: ❌ REMOVE or hide from UI

**Message 2: SAMBA Intro** (`functions/src/tx/createBankDepositRequest.ts:160-161`):
```typescript
const introText = `Hi ${handleCustomer} — I'm Samba from GoBankless.\n\nTo confirm:\n\n• Deposit amount: ${amount}\n• Deposit method: Direct bank transfer\n• Country: ${countryName}\n• Bank: ${bankName}\n• You will receive: USDT (TRC-20)\n• Next step: After you send the bank transfer, reply "SENT" and upload proof of payment (screenshot or reference).\n\nWhen you're ready, send "SENT" + proof.`
```
**Purpose**: User-facing intro message
**Display**: Shows in chat
**Action**: ✅ KEEP (but rename "Samba" → "Ema")

**Message 3: Potential CTA Button** (`src/components/Inbox/ChatMessageBubble.tsx:58-76`):
- ChatMessageBubble supports `message.buttons` prop
- Buttons render as CTA buttons below message text
- **Current**: DepositChatSheet doesn't pass buttons to ChatMessageBubble
- **Inbox**: May have buttons for certain scenarios

**Root Cause**: 
1. SYSTEM message is redundant (user doesn't need to see "Bank deposit request created")
2. No CTA button is added to intro message (user must manually type "SENT")
3. Both messages show "reply SENT + proof" instruction (repetitive)

**Fix Requirement**:
- Hide SYSTEM messages from UI (filter in `normalizeTransactionMessage` or don't render)
- Add CTA button to intro message: "I've deposited" that auto-sends "SENT"
- OR remove "SENT + proof" instruction from intro and show it only in CTA

---

### 4) Rename "Samba" to "Ema"

#### Current Occurrences

**Server-Side** (`functions/src/tx/createBankDepositRequest.ts:161`):
```typescript
const introText = `Hi ${handleCustomer} — I'm Samba from GoBankless.`
```

**Client-Side Template** (`src/lib/depositChat/sambaMessages.ts:36`):
```typescript
return `Hi ${handleCustomer} — I'm Samba from GoBankless.\n\nTo confirm:...`
```

**Helper Response** (`src/lib/depositChat/sambaMessages.ts:68`):
```typescript
return `Good question — happy to clarify.\n\nOnce you've made the transfer, just reply **SENT** here and I'll take you to the next step.`
```

**Sender Display**:
- `senderUid: 'samba'` in server function (line 169)
- `participants: [userId, receiverId, 'samba']` (line 75)
- ChatHeader shows: `"Ama — Investment Manager"` (hardcoded, not from senderUid)

**Root Cause**: 
- Message text contains "Samba" in multiple places
- `senderUid` is 'samba' (backend identifier, may be safe to keep)
- Display name is hardcoded as "Ama" in ChatHeader (not derived from sender)

**Fix Requirement**:
- Replace "Samba" → "Ema" in all message templates
- Keep `senderUid: 'samba'` for backend compatibility (or rename if safe)
- Ensure ChatHeader shows "Ema" (currently shows "Ama")

---

## Patch Plan

### Priority 1: UI Parity (Height/Width/Layout)

**File**: `src/components/DepositChatSheet.tsx`
- **Line 299**: Add `size="tall"` prop to ActionSheet
- **Line 299**: Add `inboxTallSheet` to className (or ensure `financialInboxSheet` has all needed styles)

**File**: `src/styles/action-sheet.css`
- **Line 70-79**: Clean up duplicate height declarations (keep only `85dvh` with `85vh` fallback using `@supports` or proper cascade)

### Priority 2: Send Button Fix

**File**: `src/components/DepositChatSheet.tsx`
- **Line 367**: Change `disabled={isProcessing || !txId}` → `disabled={isProcessing}`
- **Rationale**: Allow typing while `txId` is null (transaction creating), only disable during actual send processing

### Priority 3: Remove Duplicate Messages

**File**: `src/components/DepositChatSheet.tsx`
- **Line 41-64**: Update `normalizeTransactionMessage` to filter out SYSTEM messages OR
- **Line 308**: Filter messages before mapping: `messages.filter(m => m.senderType !== 'SYSTEM')`

**File**: `functions/src/tx/createBankDepositRequest.ts`
- **Line 109-120**: Consider removing SYSTEM message entirely OR mark it as internal-only

**File**: `src/components/DepositChatSheet.tsx`
- **Line 308-316**: Add CTA button to intro message:
  ```tsx
  {message.id === introMessageId && transaction?.chatStep === 'INTRO_CONFIRM_INTENT' && (
    <ChatMessageBubble
      message={{
        ...message,
        buttons: [{
          label: "I've deposited",
          onClick: () => handleSendCTA("SENT"),
          variant: 'primary'
        }]
      }}
    />
  )}
  ```

### Priority 4: Rename "Samba" → "Ema"

**File**: `functions/src/tx/createBankDepositRequest.ts`
- **Line 161**: Replace `"I'm Samba from GoBankless"` → `"I'm Ema from GoBankless"`

**File**: `src/lib/depositChat/sambaMessages.ts`
- **Line 36**: Replace `"I'm Samba from GoBankless"` → `"I'm Ema from GoBankless"`
- **File rename consideration**: `sambaMessages.ts` → `emaMessages.ts` (or keep filename, rename internal functions)

**File**: `src/components/DepositChatSheet.tsx`
- **Line 304**: Change `name="Ama — Investment Manager"` → `name="Ema — Investment Manager"`

**File**: `src/components/Inbox/FinancialInboxSheet.tsx`
- **Line 921**: Change `"Ama — Investment Manager"` → `"Ema — Investment Manager"` (if used for deposit chat)

**Backend consideration**: 
- `senderUid: 'samba'` can remain for backend compatibility
- `participants: [..., 'samba']` can remain
- Only UI-facing text needs to change

---

## Acceptance Tests

### iOS Safari Verification

1. **Sheet Height Consistency**:
   - Open deposit chat → verify sheet is 85vh immediately (not smaller)
   - Wait for typing indicator → verify height unchanged
   - Wait for first message → verify no height jump
   - Compare side-by-side with Inbox chat → verify identical height

2. **Send Button Behavior**:
   - Open deposit chat with `txId: null` → verify input is enabled
   - Type text → verify send button appears
   - Tap send → verify button disabled during processing
   - Compare with Inbox chat → verify identical behavior

3. **Message Count**:
   - Create new deposit → verify only ONE intro message appears
   - Verify no SYSTEM message visible
   - Verify CTA button appears on intro message (if implemented)

4. **Naming**:
   - Verify all messages say "Ema" not "Samba"
   - Verify ChatHeader shows "Ema — Investment Manager"
   - Verify no "Samba" in any user-facing text

---

## Exact File Edits

### Edit 1: Fix ActionSheet props and className
**File**: `src/components/DepositChatSheet.tsx`
**Line 299**:
```tsx
// BEFORE:
<ActionSheet open={open} onClose={onClose} title="" className="financialInboxSheet">

// AFTER:
<ActionSheet open={open} onClose={onClose} title="" className="financialInboxSheet inboxTallSheet" size="tall">
```

### Edit 2: Fix disabled prop
**File**: `src/components/DepositChatSheet.tsx`
**Line 367**:
```tsx
// BEFORE:
disabled={isProcessing || !txId}

// AFTER:
disabled={isProcessing}
```

### Edit 3: Filter SYSTEM messages
**File**: `src/components/DepositChatSheet.tsx`
**Line 286**:
```tsx
// BEFORE:
const normalizedMessages = messages.map(normalizeTransactionMessage)

// AFTER:
const normalizedMessages = messages
  .filter(m => m.senderType !== 'SYSTEM') // Hide internal system messages
  .map(normalizeTransactionMessage)
```

### Edit 4: Rename Samba → Ema in server
**File**: `functions/src/tx/createBankDepositRequest.ts`
**Line 161**:
```tsx
// BEFORE:
const introText = `Hi ${handleCustomer} — I'm Samba from GoBankless.\n\nTo confirm:...`

// AFTER:
const introText = `Hi ${handleCustomer} — I'm Ema from GoBankless.\n\nTo confirm:...`
```

### Edit 5: Rename Samba → Ema in client template
**File**: `src/lib/depositChat/sambaMessages.ts`
**Line 36**:
```tsx
// BEFORE:
return `Hi ${handleCustomer} — I'm Samba from GoBankless.\n\nTo confirm:...`

// AFTER:
return `Hi ${handleCustomer} — I'm Ema from GoBankless.\n\nTo confirm:...`
```

### Edit 6: Rename ChatHeader
**File**: `src/components/DepositChatSheet.tsx`
**Line 304**:
```tsx
// BEFORE:
name="Ama — Investment Manager"

// AFTER:
name="Ema — Investment Manager"
```

### Edit 7: Clean up CSS (optional)
**File**: `src/styles/action-sheet.css`
**Line 70-79**: Remove redundant height declarations, use proper fallback pattern

---

## Summary

**Root Causes**:
1. DepositChatSheet missing `inboxTallSheet` class and `size="tall"` prop
2. Input disabled when `txId === null` prevents send button from appearing
3. SYSTEM message shows in UI (should be hidden)
4. "Samba" appears in message text and ChatHeader shows "Ama" instead of "Ema"

**Risk Level**: Low (mostly UI/text changes, no backend schema changes)

**Estimated Effort**: 30 minutes (7 small edits)


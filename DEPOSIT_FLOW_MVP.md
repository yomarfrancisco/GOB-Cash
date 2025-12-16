# Deposit Flow MVP - Email Notification Setup

## Overview

This document describes the MVP email notification system for deposit flow. When a user marks their deposit as "SENT", an email is automatically sent to `info@brics.ninja` with deposit details.

## Components

### 1. Client-Side: "I've deposited" CTA Button

**File**: `src/components/DepositChatSheet.tsx`

**Function**: `handleCTAClick` (lines ~320-334)

**Flow**:
1. User clicks "I've deposited" button
2. `tx_appendUserMessage(txId, 'SENT')` - Adds "SENT" message to chat
3. `tx_userMarkDepositSent(txId)` - Marks deposit as sent server-side
4. `tx_appendEmaMessage(txId, '...')` - Adds immediate acknowledgement from Ema

**Note**: All functions use Firebase callable functions (`.https.onCall`), which eliminates CORS issues.

### 2. Server-Side: Email Notification Trigger

**File**: `functions/src/tx/onDepositSentEmail.ts`

**Trigger**: Firestore `onCreate` on `transactions/{txId}/messages/{msgId}`

**Conditions**:
- Message `senderType` is `'USER'` or `'CUSTOMER'`
- Message `text` normalized equals `"SENT"`
- Transaction `type` is `'BANK_DEPOSIT_TO_USDT_TRON'`
- Transaction `depositSentEmailAt` is not set (idempotency)

**Email Provider**: Resend API

**Email Recipient**: `info@brics.ninja`

**Email Content Includes**:
- Transaction ID
- User handle, email, UID
- Deposit amount and currency
- Country and bank name
- Reference number
- Timestamp

### 3. Acknowledgement Message

**File**: `functions/src/tx/appendEmaMessage.ts`

**Purpose**: Allows client to append Ema (AI assistant) messages for immediate user feedback.

**Usage**: Called after `tx_userMarkDepositSent` to provide instant confirmation.

## Setup Instructions

### 1. Install Resend Package (if not already installed)

```bash
cd functions
npm install resend
```

### 2. Configure Firebase Functions Config

Set the Resend API key and email from address:

```bash
firebase functions:config:set resend.api_key="re_xxxxxxxxxxxxx"
firebase functions:config:set email.from="noreply@gobankless.com"
```

Or for local development, add to `.env` or `functions/.env`:

```
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=noreply@gobankless.com
```

### 3. Deploy Functions

```bash
cd functions
npm run build
firebase deploy --only functions
```

### 4. Verify Email Trigger

1. Create a test deposit transaction
2. Mark it as SENT via the "I've deposited" button
3. Check `info@brics.ninja` inbox for email
4. Verify transaction document has `depositSentEmailAt` timestamp set

## Testing Locally

### Using Firebase Emulators

1. Start emulators:
```bash
firebase emulators:start --only functions,firestore
```

2. Set local config:
```bash
firebase functions:config:get > .runtimeconfig.json
# Edit .runtimeconfig.json to add resend.api_key and email.from
```

3. Test the flow:
- Create a deposit transaction
- Send "SENT" message
- Check emulator logs for email trigger execution
- Verify email would be sent (or use a test email service)

### Manual Testing

1. **Test CTA Button**:
   - Open deposit chat
   - Click "I've deposited" button
   - Verify "SENT" message appears
   - Verify Ema acknowledgement appears immediately

2. **Test Email Trigger**:
   - Check Firestore: `transactions/{txId}/messages` for new "SENT" message
   - Check Firestore: `transactions/{txId}` for `depositSentEmailAt` timestamp
   - Check `info@brics.ninja` inbox for email

3. **Test Idempotency**:
   - Send "SENT" message again (manually via Firestore or UI)
   - Verify email is NOT sent again
   - Verify `depositSentEmailAt` remains unchanged

## Environment Variables

### Required (Firebase Functions Config)

- `resend.api_key` - Resend API key (get from https://resend.com)
- `email.from` - Email sender address (must be verified in Resend)

### Optional

- `project.id` - Firebase project ID (auto-detected if not set)

## Troubleshooting

### CORS Errors

**Issue**: Browser blocks `tx_appendUserMessage` with CORS error.

**Solution**: Ensure all transaction functions use `.https.onCall` (not `.https.onRequest`). The current implementation already uses callable functions, so CORS should not be an issue.

**If CORS persists**:
1. Check browser console for exact error
2. Verify Firebase Functions are deployed
3. Check Firebase project configuration
4. Ensure user is authenticated

### Email Not Sending

**Check**:
1. Firebase Functions logs: `firebase functions:log`
2. Verify `RESEND_API_KEY` is set correctly
3. Verify `EMAIL_FROM` is verified in Resend dashboard
4. Check Resend API dashboard for delivery status
5. Verify transaction `depositSentEmailAt` is not already set (idempotency)

### Duplicate Emails

**Prevention**: The trigger checks `tx.depositSentEmailAt` before sending. If this field exists, email is skipped.

**If duplicates occur**:
1. Check Firestore transaction document
2. Verify `depositSentEmailAt` is being set correctly
3. Check trigger execution logs for race conditions

## Future Improvements

1. **Email Templates**: Move email HTML to a template file
2. **Retry Logic**: Add retry mechanism for failed email sends
3. **Email Queue**: Use a queue system for better reliability
4. **Multiple Recipients**: Support multiple email recipients
5. **Email Preferences**: Allow users to configure notification preferences

## Related Files

- `src/components/DepositChatSheet.tsx` - Client-side CTA button
- `src/lib/transactions/clientFunctions.ts` - Client function wrappers
- `functions/src/tx/appendEmaMessage.ts` - Ema message appender
- `functions/src/tx/onDepositSentEmail.ts` - Email trigger
- `functions/src/tx/appendUserMessage.ts` - User message appender
- `functions/src/tx/userMarkDepositSent.ts` - Mark deposit as sent


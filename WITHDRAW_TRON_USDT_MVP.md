# TRON USDT Custodial Withdrawal Flow - MVP

## Overview

This document describes the MVP implementation of the TRON USDT custodial withdrawal flow with instant withdrawal, partial fill on treasury shortfall, per-user derived TRON addresses, Firestore accounting/ledger, and Resend email notifications to CoreAgent.

## Architecture

### Components

1. **HD Wallet Derivation** (`functions/src/utils/tronHdWallet.ts`)
   - Derives per-user TRON addresses from HD mnemonic seed
   - Path: `m/44'/195'/0'/0/{index}`
   - Uses `system/counters` doc to track `tronIndex`
   - Stores address on user doc: `chain_addresses.tron`

2. **Treasury Balance Check** (`functions/src/utils/tronUtils.ts`)
   - On-chain USDT balance query via TRON network
   - Uses USDT TRC-20 contract: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`
   - USDT decimals: 6

3. **Withdrawal Function** (`functions/src/tx/withdrawTronUsdt.ts`)
   - Callable Cloud Function: `tx_withdrawTronUSDT`
   - Handles instant withdrawal, partial fill, and zero treasury cases
   - Atomic Firestore transaction for balance debits
   - On-chain broadcast via TronWeb

4. **Email Notifications** (`functions/src/utils/resendEmail.ts`)
   - Reuses existing Resend infrastructure
   - Sends to CoreAgent on treasury shortfall (partial or zero fill)

5. **UI Components**
   - `WithdrawTronUsdtSheet.tsx`: Withdrawal form
   - Integrated into `WithdrawSheet` flow (crypto option)

## Environment Variables

### Required (Firebase Functions Config)

```bash
# TRON Configuration
firebase functions:config:set tron.treasury_private_key="<treasury_private_key>"
firebase functions:config:set tron.master_seed="<bip39_mnemonic_12_or_24_words>"
firebase functions:config:set tron.fullhost="https://api.trongrid.io"  # Optional, defaults to this
firebase functions:config:set tron.api_key="<tron_pro_api_key>"  # Optional, for rate limits

# Email Configuration (reuse existing)
firebase functions:config:set resend.api_key="<resend_api_key>"
firebase functions:config:set email.from="noreply@gobankless.com"
firebase functions:config:set email.to="ygor.francisco@gmail.com"  # Optional, defaults to CoreAgent email
```

### Local Development

For local development, add to `functions/.env` or `.runtimeconfig.json`:

```json
{
  "tron": {
    "treasury_private_key": "...",
    "master_seed": "...",
    "fullhost": "https://api.trongrid.io",
    "api_key": "..."
  },
  "resend": {
    "api_key": "..."
  },
  "email": {
    "from": "noreply@gobankless.com",
    "to": "ygor.francisco@gmail.com"
  }
}
```

## Firestore Schema

### Withdrawals Collection

**Path:** `/withdrawals/{withdrawalId}`

**Fields:**
```typescript
{
  id: string
  userId: string
  toAddress: string  // TRON address
  requestedAmountUSDT: number
  sendAmountUSDT: number  // Amount actually sent (may be 0)
  feeUSDT: number  // Currently 0
  status: 'PENDING' | 'BROADCAST_PARTIAL' | 'BROADCAST_FULL' | 'FAILED_ZERO_TREASURY' | 'CONFIRMED'
  txId: string | null  // TRON transaction hash
  treasuryBalanceAtAttemptUSDT: number
  shortfallUSDT: number
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### User TRON Address

**Path:** `/users/{userId}/chain_addresses.tron`

**Fields:**
```typescript
{
  address: string  // TRON address
  index: number  // HD wallet index
  path: string  // Derivation path (e.g., "m/44'/195'/0'/0/0")
  createdAt: Timestamp
}
```

### System Counters

**Path:** `/system/counters`

**Fields:**
```typescript
{
  tronIndex: number  // Next available index for TRON address derivation
}
```

### Wallet Balance (Updated)

**Path:** `/users/{userId}/wallets/cashZAR`

**Fields:**
```typescript
{
  usdtBalance: number  // Decremented by (sendAmountUSDT + feeUSDT) on withdrawal
  updatedAt: Timestamp  // Updated timestamp triggers SlotCounter remount
}
```

## API Functions

### `wallet_ensureTronAddress`

**Type:** Callable Cloud Function

**Auth:** Required

**Input:** `{}`

**Output:**
```typescript
{
  address: string
  index: number
  path: string
}
```

**Behavior:**
- Idempotent: returns existing address if already assigned
- Creates new address if missing (derives from HD wallet)
- Increments `system/counters.tronIndex`

### `tx_withdrawTronUSDT`

**Type:** Callable Cloud Function

**Auth:** Required

**Input:**
```typescript
{
  toAddress: string  // TRON address (validated)
  amountUSDT: number  // Must be > 0
}
```

**Output:**
```typescript
{
  withdrawalId: string
  requestedAmountUSDT: number
  sendAmountUSDT: number
  feeUSDT: number
  treasuryBalanceAtAttemptUSDT: number
  shortfallUSDT: number
  txId: string | null
  status: 'PENDING' | 'BROADCAST_PARTIAL' | 'BROADCAST_FULL' | 'FAILED_ZERO_TREASURY' | 'CONFIRMED'
}
```

**Behavior:**
1. Validates input (amount > 0, valid TRON address)
2. Reads user USDT balance from `cashZAR.usdtBalance`
3. Checks treasury on-chain balance
4. Calculates `sendAmountUSDT = min(userAvailable, requested, treasuryAvailable)`
5. If treasury insufficient:
   - Creates withdrawal record with `FAILED_ZERO_TREASURY` or `BROADCAST_PARTIAL`
   - Sends email to CoreAgent
   - Does NOT debit user if zero treasury
6. If treasury sufficient:
   - Atomic Firestore transaction:
     - Debits user `usdtBalance` by `(sendAmountUSDT + feeUSDT)`
     - Creates withdrawal record
   - Broadcasts on-chain transfer
   - Updates withdrawal record with `txId`
   - Sends email if partial fill

## Testing

### Local Testing

1. **Start Firebase Emulators:**
   ```bash
   firebase emulators:start --only functions,firestore
   ```

2. **Set Local Config:**
   ```bash
   firebase functions:config:get > functions/.runtimeconfig.json
   # Edit .runtimeconfig.json to add TRON config
   ```

3. **Test Withdrawal:**
   - Use Firebase Console or client app
   - Call `tx_withdrawTronUSDT` with test parameters
   - Verify Firestore updates
   - Check email logs (or use test email service)

### Production Testing

1. **Allocate User USDT Balance:**
   - Use existing admin functions or direct Firestore write
   - Set `users/{uid}/wallets/cashZAR.usdtBalance` to test amount

2. **Test Scenarios:**

   **Scenario A: Full Fill (Treasury Has Plenty)**
   - User requests 100 USDT
   - Treasury has 1000 USDT
   - Expected: Full 100 USDT sent, user debited 100 USDT, withdrawal status `BROADCAST_FULL`

   **Scenario B: Partial Fill (Treasury Insufficient)**
   - User requests 100 USDT
   - Treasury has 50 USDT
   - Expected: 50 USDT sent, user debited 50 USDT, withdrawal status `BROADCAST_PARTIAL`, CoreAgent email sent

   **Scenario C: Zero Treasury**
   - User requests 100 USDT
   - Treasury has 0 USDT
   - Expected: 0 USDT sent, user NOT debited, withdrawal status `FAILED_ZERO_TREASURY`, CoreAgent email sent

   **Scenario D: Insufficient User Balance**
   - User has 10 USDT, requests 100 USDT
   - Expected: Error `failed-precondition`, no withdrawal record created

3. **Verify Balance Updates:**
   - Check that `cashZAR.usdtBalance` updates immediately
   - Verify UI updates without refresh (SlotCounter remounts via `updatedAt` key)
   - Confirm header and card balances match

### Reproducing Partial Fill Scenario

To test partial fill:

1. **Drain Treasury:**
   - Manually send USDT from treasury wallet to another address
   - Or set treasury balance to a low amount in test environment

2. **Request Withdrawal:**
   - User requests amount > treasury balance
   - Verify partial fill occurs
   - Check CoreAgent email

3. **Verify Accounting:**
   - Check withdrawal record: `sendAmountUSDT < requestedAmountUSDT`
   - Verify user debited only by `sendAmountUSDT` (not requested amount)
   - Confirm `shortfallUSDT` is correct

## UI Flow

1. User clicks "Withdraw" from Transact sheet
2. `WithdrawSheet` opens with options (Bank account, External crypto wallet)
3. User selects "External crypto wallet" (crypto option)
4. `WithdrawTronUsdtSheet` opens
5. User enters:
   - Amount (USDT)
   - TRON address (or uses "Use my TRON address" checkbox)
6. User clicks "Withdraw"
7. Function called: `tx_withdrawTronUSDT`
8. On success:
   - Sheet closes
   - Notification banner shows result (full or partial)
   - Balance updates immediately (via Firestore subscription)
9. On error:
   - Error message shown in sheet
   - User can retry

## Balance Update Mechanism

### SlotCounter Key Fix

To ensure card balances update immediately after withdrawal (not just on refresh), the `SlotCounter` key includes `updatedAt`:

```typescript
const balanceKey = authState === 'authed' && isBalanceReady && walletId
  ? `${walletId}-${cents}-${updatedAtMillis}`
  : `${walletId}-not-ready`
```

This forces `SlotCounter` to remount when Firestore `updatedAt` changes, ensuring the component resets its internal state and displays the new balance.

## Security Considerations

1. **Private Keys:**
   - Treasury private key stored in Firebase Functions config (encrypted at rest)
   - HD wallet mnemonic stored in Firebase Functions config
   - Never exposed to client

2. **Address Validation:**
   - TRON address format validated server-side
   - Basic format check: starts with `T`, ~34 characters, base58

3. **Balance Checks:**
   - User balance checked before withdrawal
   - Treasury balance checked on-chain (real-time)
   - Double-spend protection via Firestore transactions

4. **Auth:**
   - All functions require authentication
   - User can only withdraw their own balance

## Known Limitations

1. **Fee:**
   - Currently set to 0 USDT (`WITHDRAWAL_FEE_USDT = 0`)
   - Can be made configurable in future

2. **Confirmation:**
   - Withdrawal status goes to `BROADCAST_FULL`/`BROADCAST_PARTIAL` immediately
   - No on-chain confirmation tracking (can be added later)

3. **Multiple Partial Fills:**
   - If user requests 100 USDT and only 50 is sent, remaining 50 is not automatically retried
   - User must make a new withdrawal request

4. **Error Recovery:**
   - If broadcast fails after user balance is debited, withdrawal status remains `PENDING`
   - Manual intervention may be required

## Future Enhancements

1. **Automatic Retry:**
   - Queue partial withdrawals for retry when treasury is replenished

2. **Confirmation Tracking:**
   - Monitor on-chain transaction confirmations
   - Update status to `CONFIRMED` after N confirmations

3. **Fee Configuration:**
   - Make withdrawal fee configurable
   - Support dynamic fees based on network conditions

4. **Multi-Network Support:**
   - Extend to other networks (Ethereum, Solana, etc.)

5. **Withdrawal Limits:**
   - Add daily/weekly withdrawal limits
   - KYC verification for large withdrawals


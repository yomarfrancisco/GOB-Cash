# Ama Tools Smoke Test

Quick verification commands and test cases for Ama intent routing and formatting.

## Prerequisites

1. Get a valid Firebase ID token:
```bash
# In browser console (signed in):
const user = firebase.auth().currentUser
const token = await user.getIdToken(true)
console.log(token)
# Copy the token
```

2. Set TOKEN variable:
```bash
export TOKEN="<your-token-here>"
```

## Test Commands

### 1. get_user_wallets

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"get_user_wallets","args":{}}' \
  https://gobankless.app/api/ama/tools | jq
```

**Expected response:**
```json
{
  "ok": true,
  "data": {
    "cashZAR": {
      "walletId": "cashZAR",
      "displayCurrency": "ZAR",
      "fiatBalance": 150.50,
      "usdtBalance": 0,
      "apy": 5.2,
      "updatedAt": "2025-12-20T10:00:00.000Z"
    },
    "btc": {
      "walletId": "btc",
      "displayCurrency": "BTC",
      "fiatBalance": 0,
      "usdtBalance": 0.5,
      "apy": 3.1,
      "updatedAt": "2025-12-20T10:00:00.000Z"
    },
    "eth": {
      "walletId": "eth",
      "displayCurrency": "ETH",
      "fiatBalance": 0,
      "usdtBalance": 2.3,
      "apy": 2.8,
      "updatedAt": "2025-12-20T10:00:00.000Z"
    }
  }
}
```

### 2. get_user_profile

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"get_user_profile","args":{}}' \
  https://gobankless.app/api/ama/tools | jq
```

**Expected response:**
```json
{
  "ok": true,
  "data": {
    "userId": "xHKmkizXhPOU25vwTIB6dxhMzSH2",
    "handle": "@ygor-francisco-6120",
    "email": "ygor.francisco@gmail.com",
    "createdAt": "2025-12-01T10:00:00.000Z"
  }
}
```

### 3. list_recent_payments

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"list_recent_payments","args":{"limit":3}}' \
  https://gobankless.app/api/ama/tools | jq
```

**Expected response:**
```json
{
  "ok": true,
  "data": [
    {
      "ref": "abc123...",
      "userId": "xHKmkizXhPOU25vwTIB6dxhMzSH2",
      "status": "COMPLETE",
      "amountZAR": 50.00,
      "currency": "ZAR",
      "createdAt": "2025-12-20T10:00:00.000Z"
    },
    {
      "ref": "def456...",
      "userId": "xHKmkizXhPOU25vwTIB6dxhMzSH2",
      "status": "PENDING",
      "amountZAR": 25.00,
      "currency": "ZAR",
      "createdAt": "2025-12-19T10:00:00.000Z"
    }
  ]
}
```

**OR if index missing:**
```json
{
  "ok": false,
  "error": "Payments query requires a Firestore index. Please create the index: Collection: payments, Fields: userId (Ascending), createdAt (Descending). Or visit: https://console.firebase.google.com/project/gobankless-dev/firestore/indexes"
}
```

## UI Test Scenarios

### 10 Messy Wallet Queries

| Query | Expected Intent | Expected Tool | Expected Response Contains |
|-------|----------------|---------------|----------------------------|
| "show me crypto balances" | `wallets_crypto` | `get_user_wallets` | BTC and ETH only (0 if 0), NOT ZAR |
| "list my wallets and balances" | `wallets_all` | `get_user_wallets` | ALL wallets including zeros |
| "what's my balance" | `wallets_all` | `get_user_wallets` | ALL wallets |
| "how much money do I have" | `wallets_all` | `get_user_wallets` | ALL wallets |
| "show all my wallets" | `wallets_all` | `get_user_wallets` | ALL wallets |
| "what wallets do I have" | `wallets_all` | `get_user_wallets` | ALL wallets |
| "my balances" | `wallets_all` | `get_user_wallets` | ALL wallets |
| "wallet list" | `wallets_all` | `get_user_wallets` | ALL wallets |
| "holdings" | `wallets_all` | `get_user_wallets` | ALL wallets |
| "what do I have" | `wallets_all` | `get_user_wallets` | ALL wallets |

### 5 Crypto-Only Queries

| Query | Expected Intent | Expected Tool | Expected Response Contains |
|-------|----------------|---------------|----------------------------|
| "show me crypto balances" | `wallets_crypto` | `get_user_wallets` | BTC and ETH only (0 if 0) |
| "what's my btc and eth" | `wallets_crypto` | `get_user_wallets` | BTC and ETH only |
| "crypto balances" | `wallets_crypto` | `get_user_wallets` | BTC and ETH only |
| "bitcoin and ethereum" | `wallets_crypto` | `get_user_wallets` | BTC and ETH only |
| "my crypto" | `wallets_crypto` | `get_user_wallets` | BTC and ETH only |

### 5 Profile Queries

| Query | Expected Intent | Expected Tool | Expected Response Contains |
|-------|----------------|---------------|----------------------------|
| "who am i logged in as" | `profile` | `get_user_profile` | Email, handle, uid |
| "what's my handle and email" | `profile` | `get_user_profile` | Email, handle |
| "my account info" | `profile` | `get_user_profile` | Email, handle |
| "who am i" | `profile` | `get_user_profile` | Email, handle |
| "what account is this" | `profile` | `get_user_profile` | Email, handle |

### 5 Payments Queries

| Query | Expected Intent | Expected Tool | Expected Response Contains |
|-------|----------------|---------------|----------------------------|
| "what was my last payment" | `payments` | `list_recent_payments` | Last payment or clean index message |
| "show my recent payments" | `payments` | `list_recent_payments` | Recent payments list |
| "last 3 payments" | `payments` | `list_recent_payments` | Last 3 payments |
| "my transactions" | `payments` | `list_recent_payments` | Payment/transaction list |
| "payment history" | `payments` | `list_recent_payments` | Payment list |

## Acceptance Tests

1. **"show me crypto balances"** → Returns BTC/ETH lines (0 if 0), NOT ZAR
2. **"list my wallets and balances"** → Shows all wallets including zeros
3. **"give me a portfolio snapshot"** → Asks clarifying question: "Do you want (1) balances, (2) crypto balances, or (3) recent payments?"
4. **"what was my last payment"** → Returns payment details (ref, status, amount, date) OR clean message if no payments exist

## Payment History Test Cases

### After Dual-Write Implementation

| Query | Expected Intent | Expected Tool | Expected Response |
|-------|----------------|---------------|-------------------|
| "what was my last payment" | `payments` | `list_recent_payments` | Last payment: ref, status, amount, date |
| "show the last 3 transactions" | `payments` | `list_recent_payments` | Last 3 payments with details |
| "second most recent payment — amount and status" | `payments` | `list_recent_payments` | Second payment: amount + status |
| "any deposits recently" | `payments` | `list_recent_payments` | Recent payment list |
| "last transaction — amount + status" | `payments` | `list_recent_payments` | Last payment: amount + status |
| "show pending vs completed payments" | `payments` | `list_recent_payments` | Payment list with statuses |

### Expected Behavior

- **After backfill**: All queries return payment data from `users/{uid}/payments` subcollection
- **Before backfill**: Queries return empty array (subcollection doesn't exist yet)
- **Fallback enabled**: If `AMA_PAYMENTS_FALLBACK_ENABLED=true`, falls back to global collection (requires index)
- **Error handling**: Never shows raw Firestore errors, always user-friendly messages

## Notes

- All wallet queries must include ALL wallets when asked (never only ZAR)
- Crypto queries must return BTC and ETH only (even if 0)
- Payments queries must not hard-fail (graceful index error messages)
- Profile queries must handle missing profile gracefully

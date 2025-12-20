# Ama Tools Smoke Test

Quick verification commands for testing Ama tools end-to-end.

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

1. **"List my wallets and balances"**
   - Expected: Returns ALL wallets (ZAR, BTC, ETH, etc.), not just ZAR

2. **"What's my BTC and ETH balance?"**
   - Expected: Returns BTC and ETH balances only, NOT ZAR

3. **"Show my wallet APYs"**
   - Expected: Lists APY per wallet (e.g., "ZAR: 5.2%, BTC: 3.1%")

4. **"What's my handle and email?"**
   - Expected: Returns handle and email from get_user_profile

5. **"List my last 3 payments"**
   - Expected: Returns last 3 payments OR clean index link message


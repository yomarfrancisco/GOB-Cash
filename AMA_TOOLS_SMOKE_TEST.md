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

## UI Test Scenarios (Deterministic Intents)

These queries bypass LLM and use deterministic routing for 100% reliability:

1. **"What's my ZAR balance and last updated time?"**
   - Intent: `WALLET_BALANCE_SINGLE`
   - Expected: "Your ZAR balance is R150.50. Last updated: Dec 20, 2025 at 10:30 AM."
   - Must include: balance + updatedAt timestamp

2. **"List my wallets and balances."**
   - Intent: `WALLETS_LIST`
   - Expected: All wallets with currency, balance, APY, updatedAt
   - Format: "Your wallets:\nZAR: R150.50 | APY: 5.2% | Updated: Dec 20, 2025 at 10:30 AM\nBTC: 0.5 BTC | APY: 3.1% | Updated: ..."
   - Must include: BTC/ETH even if zero

3. **"What's my BTC and ETH balance?"**
   - Intent: `CRYPTO_BALANCE_PAIR`
   - Expected: "BTC: 0.5 BTC (updated: Dec 20, 2025 at 10:30 AM)\nETH: 2.3 ETH (updated: ...)"
   - Must return: BTC and ETH only, NOT ZAR

4. **"Show my wallet APYs."**
   - Intent: `WALLET_APYS`
   - Expected: "Your wallet APYs:\nZAR: 5.2%\nBTC: 3.1%\nETH: 2.8%"
   - Must include: All wallets with APY (including zeros if present)

5. **"What's my handle and email?"**
   - Intent: `PROFILE_HANDLE_EMAIL`
   - Expected: "Handle: @ygor-francisco-6120\nEmail: ygor.francisco@gmail.com"
   - Must return: Values from get_user_profile

## Additional Test Scenarios (LLM Path)

6. **"List my last 3 payments"**
   - Intent: `UNKNOWN` (falls through to LLM)
   - Expected: Returns last 3 payments OR clean index link message


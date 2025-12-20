# Ama Messy Utterances Smoke Test

Test suite for 20 messy user utterances to verify robust intent handling and response validation.

## Test Cases

### 1. Crypto Balance Queries (Should return BTC/ETH only, NOT ZAR)

| Utterance | Expected Tool | Expected Response Contains |
|-----------|---------------|---------------------------|
| "what's my btc and eth" | `get_user_wallets` | BTC balance, ETH balance (NO ZAR) |
| "show me bitcoin and ethereum" | `get_user_wallets` | BTC balance, ETH balance (NO ZAR) |
| "btc eth balance" | `get_user_wallets` | BTC balance, ETH balance (NO ZAR) |
| "my crypto balances" | `get_user_wallets` | BTC, ETH (if present) |
| "how much bitcoin do i have" | `get_user_wallets` | BTC balance only |

### 2. Wallet List Queries (Should return ALL wallets, even zeros)

| Utterance | Expected Tool | Expected Response Contains |
|-----------|---------------|---------------------------|
| "list my wallets and balances" | `get_user_wallets` | ALL wallets (ZAR, BTC, ETH, etc.) |
| "show all my wallets" | `get_user_wallets` | ALL wallets |
| "what wallets do i have" | `get_user_wallets` | ALL wallets |
| "wallets" | `get_user_wallets` | ALL wallets |
| "show balances" | `get_user_wallets` | ALL wallets |

### 3. Profile/Account Queries (Should return handle + email + uid)

| Utterance | Expected Tool | Expected Response Contains |
|-----------|---------------|---------------------------|
| "who am i logged in as" | `get_user_profile` | Email, handle, uid |
| "what account is this" | `get_user_profile` | Email, handle |
| "who am i" | `get_user_profile` | Email, handle |
| "my account info" | `get_user_profile` | Email, handle |
| "what's my email and handle" | `get_user_profile` | Email, handle |

### 4. Portfolio Snapshot Queries (Should return profile + wallets + payments)

| Utterance | Expected Tool | Expected Response Contains |
|-----------|---------------|---------------------------|
| "portfolio snapshot" | `get_user_snapshot` | Profile, all wallets, recent payments |
| "holdings" | `get_user_snapshot` | Profile, all wallets, recent payments |
| "net worth" | `get_user_snapshot` | Profile, all wallets, recent payments |
| "what do i have" | `get_user_snapshot` | Profile, all wallets, recent payments |
| "show everything" | `get_user_snapshot` | Profile, all wallets, recent payments |

## Validation Rules

### Response Validation Checks

1. **BTC/ETH Query Validation:**
   - If user asks for BTC/ETH and response contains ZAR → Auto-retry with filtered wallets
   - If user asks for BTC/ETH and response omits BTC/ETH → Auto-retry with filtered wallets
   - Response must contain ONLY requested currencies

2. **Wallet List Validation:**
   - If user asks "wallets and balances" and response only shows ZAR → Ensure ALL wallets are included
   - Response must include BTC/ETH even if balance is zero

3. **Profile Query Validation:**
   - If user asks "who am I logged in as" → Must return email + uid + handle (if exists)
   - Response must not be generic "I can't access that"

## Test Execution

Run these tests in the Ama chat UI and verify:

1. **Intent Classification:**
   - Each utterance routes to the correct tool
   - No "UNKNOWN" intents for these queries

2. **Response Content:**
   - Response includes requested currencies/fields
   - Response does NOT include unwanted data (e.g., ZAR when asking for BTC/ETH)
   - Response includes ALL requested data (e.g., all wallets when asking for "list wallets")

3. **Auto-Retry:**
   - If initial response is incorrect, system auto-retries with corrected data
   - Final response is correct even if initial LLM response was wrong

## Expected Pass Rate

- **Target:** 20/20 utterances route correctly
- **Minimum:** 18/20 utterances route correctly
- **Critical:** Crypto balance queries must NEVER return ZAR when asking for BTC/ETH

## Notes

- These tests verify robustness to messy user input
- Tests should pass even with typos, abbreviations, and informal language
- Response validation ensures LLM mistakes are auto-corrected


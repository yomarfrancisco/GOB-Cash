# Withdraw Balance Mismatch Diagnosis

## 1. Balance Check Implementation

### Withdraw Function Reads From:
**File**: `functions/src/tx/withdrawTronUsdt.ts:48-58`

```typescript
async function getUserUsdtBalance(userId: string): Promise<number> {
  const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
  const walletSnap = await walletRef.get()
  
  if (!walletSnap.exists) {
    return 0
  }
  
  const walletData = walletSnap.data()
  return walletData?.usdtBalance || 0
}
```

**Path**: `users/{userId}/wallets/cashZAR.usdtBalance`
**Field**: `usdtBalance` (number, in USDT)

### Balance Check Logic:
**File**: `functions/src/tx/withdrawTronUsdt.ts:161-170`

```typescript
const userAvailableUSDT = await getUserUsdtBalance(userId)

if (userAvailableUSDT < amountUSDT + WITHDRAWAL_FEE_USDT) {
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Insufficient user balance',
    { userAvailableUSDT, requestedAmountUSDT: amountUSDT }
  )
}
```

---

## 2. Deposit Credit Implementation

### Deposit Credit Function:
**File**: `functions/src/tx/creditAndLock.ts:70-81`

```typescript
await db.runTransaction(async (t) => {
  const wallet = walletSnap.exists ? walletSnap.data()! : { fiatBalance: 0, lockedBalance: 0 }

  // Credit locked balance
  t.set(walletRef, {
    ...wallet,
    fiatBalance: (wallet.fiatBalance || 0),
    lockedBalance: (wallet.lockedBalance || 0) + amount, // ← ZAR amount
    updatedAt: now,
  }, { merge: true })
})
```

**Path**: `users/{userId}/wallets/cashZAR`
**Fields Written**: `fiatBalance` (ZAR), `lockedBalance` (ZAR)
**Field NOT Written**: `usdtBalance` ❌

### Unlock Function:
**File**: `functions/src/tx/unlockSweep.ts:91-96`

```typescript
batch.set(walletRef, {
  ...wallet,
  fiatBalance: (wallet.fiatBalance || 0) + amount, // ← Moves from locked to fiat (ZAR)
  lockedBalance: Math.max(0, (wallet.lockedBalance || 0) - amount,
  updatedAt: now,
}, { merge: true })
```

**Path**: `users/{userId}/wallets/cashZAR`
**Fields Written**: `fiatBalance` (ZAR), `lockedBalance` (ZAR)
**Field NOT Written**: `usdtBalance` ❌

---

## 3. Side-by-Side Comparison

| Operation | Firestore Path | Field Written/Read | Value Type | Currency |
|-----------|----------------|-------------------|------------|----------|
| **Deposit Credit** | `users/{uid}/wallets/cashZAR` | `lockedBalance` | number | ZAR |
| **Deposit Unlock** | `users/{uid}/wallets/cashZAR` | `fiatBalance` | number | ZAR |
| **Withdraw Read** | `users/{uid}/wallets/cashZAR` | `usdtBalance` | number | USDT |

**Mismatch**: ❌ **Deposits write ZAR to `fiatBalance`/`lockedBalance`, but withdraw reads USDT from `usdtBalance`**

---

## 4. Root Cause (One Sentence)

**"Deposits credit ZAR to `fiatBalance`/`lockedBalance`, but withdraw checks `usdtBalance` which is never written by the deposit flow, so users have 0 USDT balance even after successful deposits."**

---

## 5. Minimal Fix Proposal

### Option A: Convert fiatBalance to USDT in withdraw (Recommended)

**File**: `functions/src/tx/withdrawTronUsdt.ts`

**Change**: Modify `getUserUsdtBalance()` to read `fiatBalance` and convert to USDT:

```typescript
async function getUserUsdtBalance(userId: string): Promise<number> {
  const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
  const walletSnap = await walletRef.get()
  
  if (!walletSnap.exists) {
    return 0
  }
  
  const walletData = walletSnap.data()
  const fiatBalance = walletData?.fiatBalance || 0
  
  // Convert ZAR to USDT using exchange rate
  // TODO: Get from config or transaction, for now use hardcoded rate
  const FX_RATE_ZAR_PER_USDT = 18.1
  const usdtBalance = fiatBalance / FX_RATE_ZAR_PER_USDT
  
  return usdtBalance
}
```

**Pros**:
- ✅ No changes to deposit flow
- ✅ Works with existing deposit data
- ✅ Minimal code change

**Cons**:
- ⚠️ Uses hardcoded exchange rate (should be configurable)
- ⚠️ Doesn't account for `lockedBalance` (only available after unlock)

### Option B: Credit usdtBalance during unlock

**File**: `functions/src/tx/unlockSweep.ts`

**Change**: When unlocking, also calculate and set `usdtBalance`:

```typescript
const FX_RATE_ZAR_PER_USDT = 18.1
const usdtAmount = amount / FX_RATE_ZAR_PER_USDT

batch.set(walletRef, {
  ...wallet,
  fiatBalance: (wallet.fiatBalance || 0) + amount,
  lockedBalance: Math.max(0, (wallet.lockedBalance || 0) - amount),
  usdtBalance: ((wallet.usdtBalance || 0) + usdtAmount), // ← Add this
  updatedAt: now,
}, { merge: true })
```

**Pros**:
- ✅ Keeps balances in sync
- ✅ Withdraw can read directly

**Cons**:
- ⚠️ Requires backfilling existing users
- ⚠️ Changes unlock flow (but minimal)

### Recommended: Option A (Immediate Fix)

Use Option A for immediate fix, then consider Option B for long-term consistency.

---

## 6. Treasury Address Verification

### Configuration:
**File**: `functions/src/utils/tronUtils.ts:44-52`

```typescript
export function getTreasuryAddress(): string {
  const privateKey = functions.config().tron?.treasury_private_key
  if (!privateKey) {
    throw new Error('TRON_TREASURY_PRIVATE_KEY not configured')
  }

  // Use TronWeb's static address utility
  return (TronWeb as any).address.fromPrivateKey(privateKey)
}
```

**Firebase Config**:
```json
{
  "tron": {
    "treasury_address": "TQpKs8c2cLcnPUkTq5LftRftusSBkgEwQX",
    "treasury_private_key": "bb786544d6b28ce9cc552a1181eb1b3374a91d56891218eecd090b20fddc1666",
    "usdt_contract": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
  }
}
```

### Treasury Balance Check:
**File**: `functions/src/utils/tronUtils.ts:57-85`

```typescript
export async function getTreasuryUsdtBalance(): Promise<number> {
  const tronWeb = getTronWeb()
  const treasuryAddress = getTreasuryAddress()

  try {
    const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS)
    const balanceResult: any = await contract.balanceOf(treasuryAddress).call()
    const balanceSun = Number(balanceResult?.toString() || '0')
    const balanceUSDT = balanceSun / Math.pow(10, USDT_DECIMALS)
    
    return balanceUSDT
  } catch (error: any) {
    throw new Error(`Failed to get treasury balance: ${error.message}`)
  }
}
```

**Treasury Address**: `TQpKs8c2cLcnPUkTq5LftRftusSBkgEwQX` ✅
**USDT Contract**: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` ✅
**TronScan Match**: Verified - address shows 8.379 USDT on TronScan

---

## 7. Diagnostic Logs Added

**File**: `functions/src/tx/withdrawTronUsdt.ts:160-195`

Added comprehensive logging before balance checks:
- `userId`
- `requestedAmountUSDT`
- `userAvailableUSDT` (from `usdtBalance` field)
- `walletFiatBalance` (from `fiatBalance` field)
- `walletLockedBalance` (from `lockedBalance` field)
- `walletUsdtBalance` (from `usdtBalance` field)
- `treasuryUsdt`
- `treasuryAddress`
- `contractAddress`

These logs will show the exact mismatch when withdraw is attempted.

---

## Summary

**Root Cause**: Deposits write ZAR to `fiatBalance`/`lockedBalance`, withdraw reads USDT from `usdtBalance` (never written).

**Fix**: Modify `getUserUsdtBalance()` to read `fiatBalance` and convert ZAR → USDT using exchange rate.

**Treasury**: Correctly configured and matches TronScan (8.379 USDT).


# PayFast Missing m_payment_id Analysis

## Root Cause Identified

**Problem:** ITN callbacks show "Missing m_payment_id" because `m_payment_id` is **NOT being sent** to PayFast during payment creation.

## Evidence

### Current Code State (commit b412ae1)

**File:** `src/app/api/payfast/create/route.ts`  
**Lines:** 74-83

```typescript
const rawParams: Record<string, string> = {
  merchant_id: config.merchantId,
  merchant_key: config.merchantKey,
  return_url: `${config.returnUrl}?ref=${ref}`,
  cancel_url: `${config.cancelUrl}?cancel=true`,
  notify_url: config.notifyUrl,
  amount: amount_zar.toFixed(2),
  item_name: `GoBankless Deposit - ${ref.substring(0, 8)}`,
  // Passphrase is included in signature calculation but NOT in final params
}
```

**Critical Finding:** `m_payment_id` is **MISSING** from `rawParams`.

### What Should Be There

According to PayFast documentation and previous fix attempts (commit 5ebfcec), `m_payment_id` should be included:

```typescript
const rawParams: Record<string, string> = {
  merchant_id: config.merchantId,
  merchant_key: config.merchantKey,
  return_url: `${config.returnUrl}?ref=${ref}`,
  cancel_url: `${config.cancelUrl}?cancel=true`,
  notify_url: config.notifyUrl,
  amount: amount_zar.toFixed(2),
  item_name: `GoBankless Deposit - ${ref.substring(0, 8)}`,
  m_payment_id: ref, // ← THIS IS MISSING
}
```

### Why This Causes the Problem

1. **Payment Creation:** We generate `ref = crypto.randomUUID()` (line 67)
2. **We DON'T send `m_payment_id` to PayFast** (missing from rawParams)
3. **PayFast processes payment** but has no `m_payment_id` to echo back
4. **ITN Callback:** PayFast sends ITN with `m_payment_id=` (empty)
5. **ITN Handler:** Checks `params.m_payment_id` (line 66) → finds empty → returns 400

### Why It Was Removed

When we reverted to commit `b412ae1`, we went back to a state **before** the `m_payment_id` fix was added. The fix was in commit `5ebfcec` ("fix: Add missing m_payment_id parameter to PayFast payment creation"), which came **after** `b412ae1`.

**Timeline:**
- `b412ae1` - "fix: Complete wallet document creation" (current state) - **NO m_payment_id**
- `5ebfcec` - "fix: Add missing m_payment_id parameter" (later commit) - **HAS m_payment_id**
- We reverted to `b412ae1`, so we lost the `m_payment_id` fix

## Impact

1. **ITN Reconciliation Fails:** Can't match ITN callbacks to Firestore payments
2. **Payment Status Stuck:** Payments stay `PENDING` forever
3. **Wallet Never Credits:** Credit route can't find payment by `m_payment_id`
4. **Manual Intervention Required:** Payments complete on PayFast but never reflect in system

## Solution

**Add `m_payment_id` to `rawParams` in `src/app/api/payfast/create/route.ts`:**

```typescript
const rawParams: Record<string, string> = {
  merchant_id: config.merchantId,
  merchant_key: config.merchantKey,
  return_url: `${config.returnUrl}?ref=${ref}`,
  cancel_url: `${config.cancelUrl}?cancel=true`,
  notify_url: config.notifyUrl,
  amount: amount_zar.toFixed(2),
  item_name: `GoBankless Deposit - ${ref.substring(0, 8)}`,
  m_payment_id: ref, // PayFast will echo this back in ITN callback for reconciliation
}
```

**Why This Works:**
- PayFast will include `m_payment_id=<ref>` in ITN callback
- ITN handler can extract `ref` from `params.m_payment_id`
- Payment reconciliation works correctly
- Credit route can find payment by `ref`

## Verification Checklist

After fix:
1. ✅ Vercel logs show `[PayFast Create]` includes `m_payment_id` in params
2. ✅ ITN logs show `m_payment_id=<uuid>` (non-empty) in raw body
3. ✅ ITN handler no longer logs "Missing m_payment_id"
4. ✅ Firestore payment status updates from `PENDING` → `COMPLETE`
5. ✅ Wallet credits successfully

## Why This Wasn't Caught Earlier

- Payment creation **appears** to work (redirects to PayFast)
- PayFast **accepts** the payment (no signature mismatch)
- But ITN callbacks **fail silently** (400 error, no reconciliation)
- The issue only becomes visible when checking ITN logs or noticing payments never complete


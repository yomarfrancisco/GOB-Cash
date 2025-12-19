# PayFast Signature Mismatch After Adding m_payment_id - Analysis

## Problem

After adding `m_payment_id: ref` to `rawParams`, PayFast `/eng/process` endpoint returns:
- **400 Bad Request: "Generated signature does not match submitted signature"**

## Root Cause Hypothesis

### Hypothesis 1: Parameter Order Changed (MOST LIKELY)

**Current code (after fix):**
```typescript
const rawParams: Record<string, string> = {
  merchant_id: config.merchantId,
  merchant_key: config.merchantKey,
  return_url: `${config.returnUrl}?ref=${ref}`,
  cancel_url: `${config.cancelUrl}?cancel=true`,
  notify_url: config.notifyUrl,
  amount: amount_zar.toFixed(2),
  item_name: `GoBankless Deposit - ${ref.substring(0, 8)}`,
  m_payment_id: ref, // ← ADDED AT THE END
}
```

**Previous working code (b412ae1):**
```typescript
const rawParams: Record<string, string> = {
  merchant_id: config.merchantId,
  merchant_key: config.merchantKey,
  return_url: `${config.returnUrl}?ref=${ref}`,
  cancel_url: `${config.cancelUrl}?cancel=true`,
  notify_url: config.notifyUrl,
  amount: amount_zar.toFixed(2),
  item_name: `GoBankless Deposit - ${ref.substring(0, 8)}`,
  // NO m_payment_id
}
```

**Impact:**
- Adding `m_payment_id` at the end changes the parameter order in the signature base string
- `URLSearchParams.toString()` includes `m_payment_id` in the signature calculation
- PayFast might expect `m_payment_id` in a **specific position** (not at the end)
- Or PayFast might expect the signature to be calculated **without** `m_payment_id`, then `m_payment_id` added separately

### Hypothesis 2: PayFast Requires Specific Parameter Order

According to PayFast documentation, parameters should be in a specific order. The working version had:
1. merchant_id
2. merchant_key
3. return_url
4. cancel_url
5. notify_url
6. amount
7. item_name

When we add `m_payment_id` at position 8, it might break PayFast's expected order.

**Possible PayFast expectation:**
- `m_payment_id` should be earlier in the list (e.g., after `merchant_key` or after `amount`)
- Or `m_payment_id` should be excluded from signature calculation entirely

### Hypothesis 3: Signature Calculated Without m_payment_id

Some payment gateways calculate the signature **without** certain optional fields, then add those fields to the final request.

**Possible PayFast behavior:**
1. Calculate signature using: merchant_id, merchant_key, return_url, cancel_url, notify_url, amount, item_name
2. Add `m_payment_id` to the final request (not included in signature)
3. Add signature to final request

But this doesn't make sense because PayFast needs to validate the signature, and if `m_payment_id` is in the request, it should be in the signature.

### Hypothesis 4: URLSearchParams Encoding Issue

When `m_payment_id` contains a UUID (with hyphens), `URLSearchParams.toString()` might encode it differently than expected.

**Example:**
- `m_payment_id: "03bcdcf2-e1a2-44a2-b13a-39497286c123"`
- `URLSearchParams` might encode hyphens differently
- This changes the signature base string

## Evidence to Check

1. **Vercel logs:** Check `[PayFast Create]` logs to see:
   - Does `toSign` include `m_payment_id`?
   - What is the exact order of parameters in `toSign`?
   - Does the signature match what we're sending?

2. **Browser URL:** Check the actual redirect URL:
   - What order are parameters in?
   - Is `m_payment_id` present?
   - Is the signature at the end?

3. **Compare with working version:**
   - What was the exact `toSign` string in the working version (without `m_payment_id`)?
   - What is the `toSign` string now (with `m_payment_id`)?
   - The difference should show how adding `m_payment_id` changed the signature

## Most Likely Solution

**Option A: Add m_payment_id in a specific position**

Try adding `m_payment_id` earlier in the parameter list, e.g.:
```typescript
const rawParams: Record<string, string> = {
  merchant_id: config.merchantId,
  merchant_key: config.merchantKey,
  m_payment_id: ref, // ← ADD EARLIER
  return_url: `${config.returnUrl}?ref=${ref}`,
  cancel_url: `${config.cancelUrl}?cancel=true`,
  notify_url: config.notifyUrl,
  amount: amount_zar.toFixed(2),
  item_name: `GoBankless Deposit - ${ref.substring(0, 8)}`,
}
```

**Option B: Calculate signature without m_payment_id, then add it**

This is more complex and might not work, but worth testing:
1. Calculate signature using params without `m_payment_id`
2. Add `m_payment_id` to params after signature calculation
3. Build redirect URL with all params including `m_payment_id` and signature

**Option C: Check PayFast documentation for m_payment_id position**

PayFast might specify exactly where `m_payment_id` should appear in the parameter list.

## Recommended Next Steps (Analysis Only)

1. **Check Vercel logs** for the exact `toSign` string with and without `m_payment_id`
2. **Compare parameter order** - what was the working order vs current order
3. **Test different positions** - try adding `m_payment_id` at different positions in `rawParams`
4. **Check PayFast docs** - verify if `m_payment_id` has specific position requirements

## Key Question

**Why did the working version (b412ae1) work without `m_payment_id`, but adding it breaks the signature?**

Answer: Because adding `m_payment_id` changes the signature base string. PayFast expects the signature to match what it calculates, and if the parameter order or content changes, the signature changes.

The solution is to find the correct position for `m_payment_id` that PayFast expects, or to understand if PayFast has special handling for `m_payment_id` in signature calculation.


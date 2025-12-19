# PayFast Option 4 Test Checklist

## Overview
Option 4 adds a reference marker in `item_name` for backup reconciliation when `ref` is missing from query params.

## Test Scenarios

### ✅ Test 1: Normal Flow (ref in query params)
**Expected:** Should work as before, using ref from query params.

1. Create a payment via `/api/payfast/create`
2. Complete payment on PayFast
3. Verify return URL includes `?ref=<uuid>`
4. Check Vercel logs for `[PayFast Return] received` with `refSource: 'query_param'`
5. Verify payment is credited and wallet balance updates

### ✅ Test 2: Backup Flow (ref parsed from item_name)
**Expected:** Should parse ref from item_name when query param is missing.

1. Create a payment via `/api/payfast/create`
2. Note the `ref` UUID and first 8 characters
3. Manually construct return URL without `ref` param:
   ```
   /api/payfast/return?pf_payment_id=123&payment_status=COMPLETE&amount_gross=100.00&item_name=GoBankless Deposit | REF:12345678
   ```
4. Replace `12345678` with first 8 chars of actual ref
5. Access the URL (or simulate PayFast redirect)
6. Check Vercel logs for:
   - `[PayFast Return] ref missing from query params, attempting to parse from item_name`
   - `[PayFast Return] Found ref prefix in item_name`
   - `[PayFast Return] Matched payment by ref prefix`
   - `refSource: 'item_name_parsed'`
7. Verify payment is credited and wallet balance updates

### ✅ Test 3: Item Name Format Verification
**Expected:** item_name should contain REF: marker.

1. Create a payment via `/api/payfast/create`
2. Check response or Firestore payment doc
3. Verify `payfastParams.item_name` matches format:
   ```
   GoBankless Deposit | REF:12345678
   ```
4. Verify first 8 chars of ref match the REF: value

### ✅ Test 4: Multiple PENDING Payments (Edge Case)
**Expected:** Should match correct payment by ref prefix.

1. Create two payments (both PENDING)
2. Note their refs (should have different first 8 chars)
3. Test return handler with item_name containing one ref prefix
4. Verify it matches the correct payment (not the other one)

### ✅ Test 5: No Match Found (Error Handling)
**Expected:** Should log error and redirect with error message.

1. Create a payment
2. Access return URL with invalid ref prefix in item_name:
   ```
   /api/payfast/return?item_name=GoBankless Deposit | REF:00000000
   ```
3. Check Vercel logs for:
   - `[PayFast Return] Could not find payment matching ref prefix`
4. Verify redirect to `/profile?error=missing_ref`

## Verification Points

### Vercel Logs to Check
- `[PayFast Return] received` - should include `refSource` field
- `[PayFast Return] ref missing from query params` - when fallback is triggered
- `[PayFast Return] Found ref prefix in item_name` - when parsing succeeds
- `[PayFast Return] Matched payment by ref prefix` - when payment is found
- `[PayFast Return] reconciled` - final reconciliation result

### Firestore to Check
- `payments/{ref}.payfastParams.item_name` should contain `REF:` marker
- Payment should be marked `COMPLETE` after return handler
- Wallet balance should be credited

### Browser/Network to Check
- Return URL should redirect to `/profile?ref=...&credited=true`
- Profile page should show updated balance

## Success Criteria
✅ Payment credits successfully when ref is in query params  
✅ Payment credits successfully when ref is parsed from item_name  
✅ item_name format is correct: `GoBankless Deposit | REF:{ref8}`  
✅ Logs clearly show ref source (query_param vs item_name_parsed)  
✅ Error handling works when ref cannot be found  


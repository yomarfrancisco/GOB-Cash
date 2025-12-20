# Current State Analysis - Payment Dual-Write System

## Section A: Current Code State

### 1. Dual-Write/Mirror Functions

**File: `src/lib/payfast/paymentMirror.ts`**
- `upsertPayment()`: Uses batch write, but converts Date to Firestore Timestamp inconsistently
- `updatePaymentStatus()`: Uses batch write, but uses `new Date()` instead of Firestore Timestamp
- Both functions use `{ merge: true }` for idempotency (good)
- Both catch errors but don't throw (allows payment to succeed even if mirroring fails - needs review)

### 2. Payment Creation/Update Routes

**File: `src/app/api/payfast/create/route.ts`**
- ✅ Uses `upsertPayment()` from `paymentMirror.ts`
- ✅ Passes `createdAt: new Date()` (needs to be Firestore Timestamp)
- ✅ Dual-writes to both collections

**File: `src/app/api/payfast/credit/route.ts`**
- ⚠️ Updates global collection in transaction
- ⚠️ Calls `updatePaymentStatus()` AFTER transaction (non-blocking, may fail silently)
- ⚠️ Uses `new Date()` for timestamps

**File: `src/app/api/payfast/notify/route.ts`**
- ⚠️ Updates global collection directly
- ⚠️ Calls `updatePaymentStatus()` AFTER update (non-blocking)
- ⚠️ Uses `new Date()` for timestamps

**File: `src/app/api/payfast/return/route.ts`**
- ⚠️ Updates global collection in transaction
- ⚠️ Calls `updatePaymentStatus()` AFTER transaction (non-blocking)
- ⚠️ Uses `new Date()` for timestamps

### 3. DAL + Tool Paths

**File: `src/lib/ama/dal.ts` - `listRecentPayments()`**
- ⚠️ Has fallback logic to global collection (needs removal)
- ⚠️ Throws `PAYMENTS_NOT_SYNCED` when subcollection empty and fallback disabled
- ✅ Queries subcollection first (correct)

**File: `src/lib/ama/toolsExecutor.ts` - `list_recent_payments` case**
- ✅ Catches `PAYMENTS_NOT_SYNCED` and returns `{ ok: false, errorType: 'NOT_SYNCED' }`
- ✅ Re-throws other errors

**File: `src/lib/ama/router.ts` - payments intent**
- ✅ Routes to `list_recent_payments` tool
- ✅ Handles `NOT_SYNCED` with friendly message
- ⚠️ Needs to handle empty array case intelligently

### 4. Backfill Script

**File: `scripts/backfill-user-payments.ts`**
- ✅ Idempotent (checks if doc exists)
- ✅ Resumable (can resume from ref)
- ✅ Uses batch processing
- ⚠️ Uses `new Date()` for timestamps (should preserve original Firestore Timestamps)
- ✅ Excluded from Next build in `tsconfig.json`

## Issues Identified

1. **Timestamp Inconsistency**: All routes use `new Date()` instead of Firestore Timestamp
2. **Non-Atomic Updates**: Status updates happen in two steps (global first, then subcollection)
3. **Silent Failures**: Mirror functions catch errors but don't throw
4. **Fallback Logic**: DAL still has fallback to global collection (should be removed)
5. **Empty Array Handling**: Router doesn't handle empty array intelligently

## Required Fixes

### B) Fix Dual-Write Properly
- Use Firestore Timestamp for all timestamps
- Make status updates atomic (both collections in same batch)
- Ensure mirror functions throw on failure (or at least log clearly)

### C) Backfill
- Preserve original Firestore Timestamps from global collection
- Ensure script is build-safe (already excluded)

### D) Ama Behavior
- Remove fallback logic entirely
- Return empty array if subcollection empty (don't throw)
- Router handles empty array with intelligent message


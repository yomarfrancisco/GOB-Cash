# Zero Balance Enforcement for New Signups

## Summary

This implementation ensures that new signups start with $0 balances across all accounts and cards, with Firebase as the source of truth. The UI properly handles loading states without masking missing data.

## Server Truth Enforcement

### Primary Path: `ensureDefaultWallets()` in `src/lib/wallets.ts`

**Location:** `src/lib/wallets.ts` lines 83-112

**Function:** `ensureDefaultWallets(user: User): Promise<void>`

**What it does:**
1. Checks if user's wallets subcollection exists and is non-empty
2. If empty, creates all 6 default wallets with **$0 balances**:
   - `cashZAR` - fiatBalance: 0, usdtBalance: 0
   - `cashMZN` - fiatBalance: 0, usdtBalance: 0
   - `cashZWD` - fiatBalance: 0, usdtBalance: 0
   - `eth` - fiatBalance: 0, usdtBalance: 0
   - `btc` - fiatBalance: 0, usdtBalance: 0
   - `earnings` - fiatBalance: 0, usdtBalance: 0

**When it runs:**
- Called in `FirebaseAuthListener.tsx` after `ensureUserDocument()` completes
- **Awaited** before subscribing to wallet snapshots (ensures deterministic initialization)
- Runs on first authenticated session for new users

**Firestore Path:**
```
/users/{uid}/wallets/{walletId}
```

### Secondary Path: Wallet Subscription in `src/lib/wallets.ts`

**Location:** `src/lib/wallets.ts` lines 131-144

**Function:** `subscribeToWallets(userId: string, callback: (wallets: WalletMap) => void)`

**What it does:**
- Subscribes to real-time wallet snapshots from Firestore
- Firestore is the **source of truth** - all balance reads come from here
- Callback receives `WalletMap` with all wallet documents

## UI State Management

### Wallet Store (`src/store/wallets.ts`)

**New State:** `walletsStatus: 'loading' | 'ready'`

**Purpose:**
- Tracks whether wallets have been loaded from Firestore
- Prevents UI from treating placeholder data as final
- Cards show $0 while loading, but status indicates we're waiting for Firestore

**Flow:**
1. On sign-in: `walletsStatus = 'loading'`
2. After `ensureDefaultWallets()` completes: wallets exist in Firestore
3. Subscription fires: `walletsStatus = 'ready'`, wallets populated from Firestore

### Balance Calculation (`src/state/walletAlloc.tsx`)

**Location:** `src/state/walletAlloc.tsx` lines 261-301

**Function:** `syncFromWallets(wallets: WalletMap)`

**What it does:**
- Reads balances from Firestore wallets (source of truth)
- Treats missing wallets as 0: `(wallets as any)[id]?.fiatBalance ?? 0`
- Calculates total: `sum(all wallet balances)`
- If no wallets loaded yet → total = 0

**Robustness:**
- Missing wallets default to 0 (no NaN or undefined)
- Total is always calculated from known wallet balances
- Once Firestore subscription returns, placeholder is replaced with real data

## Implementation Details

### Files Changed

1. **`src/store/wallets.ts`**
   - Added `walletsStatus: 'loading' | 'ready'` state
   - Added `setWalletsStatus()` method
   - `setWallets()` now sets status to 'ready'
   - `clear()` resets status to 'loading'

2. **`src/components/FirebaseAuthListener.tsx`**
   - Removed `setWallets({} as any)` placeholder
   - Added `setWalletsStatus('loading')` before wallet initialization
   - **Awaits** `ensureDefaultWallets()` before subscribing
   - Ensures deterministic initialization: wallets exist in Firestore before UI reads them

3. **`src/components/HomeStreamSection.tsx`**
   - Changed title: "Become a cash agent" → "Find a cash agent"
   - Changed subtitle: "Explore opportunities. Show up. Earn" → "Private. Safe. Vetted agents"

### Verification Checklist

✅ **New signup flow:**
1. User signs up → `ensureUserDocument()` runs
2. `ensureDefaultWallets()` runs → creates 6 wallets with $0 in Firestore
3. Subscription fires → wallets loaded from Firestore
4. Cards show $0, total shows $0

✅ **Firestore verification:**
- All 6 wallets exist: `cashZAR`, `cashMZN`, `cashZWD`, `eth`, `btc`, `earnings`
- Each wallet has `fiatBalance: 0` and `usdtBalance: 0`
- Wallets created atomically (all or nothing)

✅ **UI verification:**
- Cards show $0 (not NaN, undefined, or blank)
- Total shows $0
- No demo values leak through
- Loading state properly tracked

✅ **Home page section 3:**
- Title: "Find a cash agent"
- Subtitle: "Private. Safe. Vetted agents"

## Key Principles

1. **Firebase is source of truth** - All balances read from Firestore
2. **Server-backed first** - Wallets created in Firestore before UI reads
3. **UI fallback never masks data** - Loading state tracked, placeholders not treated as final
4. **Robust calculations** - Missing wallets treated as 0, totals always valid


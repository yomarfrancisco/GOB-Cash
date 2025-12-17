# Set CoreAgent Balance - Simple Instructions

## Quick Fix: Set Balance to R10,000

**Paste this into browser console (as CoreAgent):**

```javascript
await window.gbkAdmin.setCoreAgentBalance(10000)
```

**That's it!** The balance is now R10,000 and will persist across sign-ins.

## How It Works

- **Global Helper:** `window.gbkAdmin.setCoreAgentBalance(amountZAR)`
- **Only Available:** When signed in as CoreAgent (UID: `xHKmkizXhPOU25vwTIB6dxhMzSH2`)
- **Location:** Exposed in `FirebaseAuthListener.tsx` after authentication
- **Auto-updates:** UI updates automatically via Firestore real-time subscription

## Usage Examples

```javascript
// Set balance to R10,000
await window.gbkAdmin.setCoreAgentBalance(10000)

// Set balance to R50,000
await window.gbkAdmin.setCoreAgentBalance(50000)

// Check if helper is available
if (window.gbkAdmin && window.gbkAdmin.setCoreAgentBalance) {
  console.log('✅ Admin helper available')
} else {
  console.log('❌ Not signed in as CoreAgent')
}
```

## Implementation Details

- **File:** `src/components/FirebaseAuthListener.tsx`
- **Gate:** Only exposes when `user.uid === AGENT_UID`
- **Function:** Calls `setCoreAgentBalance()` from `src/lib/transactions/clientFunctions.ts`
- **Cleanup:** Removed on sign-out or when non-CoreAgent signs in

## Verify It Worked

1. Check Firebase Console: `/users/xHKmkizXhPOU25vwTIB6dxhMzSH2/wallets/cashZAR`
   - Should show `fiatBalance: 10000`

2. Refresh page
   - UI should show R10,000 (not R0)

3. Sign out and sign back in
   - Balance should still be R10,000


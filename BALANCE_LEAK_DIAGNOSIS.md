# Balance Leak Diagnosis: New User Shows Balance > 0

## Root Cause

**The Problem:** When a new user signs in or refreshes, cards briefly show demo balances (> 0) before Firestore wallets load.

**The Issue Chain:**
1. `useWalletStore` is initialized with `demoWallets` (non-zero balances) and `demoMode: true`
2. When user signs in, `onAuthStateChanged` fires
3. `subscribeToWallets` is called, but `onSnapshot` is async - it doesn't fire immediately
4. Cards render with:
   - `isAuthed = true`
   - `wallets = demoWallets` (still has demo values!)
   - `demoMode = true` (still true!)
5. Card condition: `if (isAuthed && wallets && !demoMode && walletId)` → **FALSE** (because `demoMode` is still `true`)
6. Falls back to: `cents = (alloc as any)[allocKey] || 0`
7. But `alloc` might also have demo values if there's a timing issue with the reset

**The Fix Needed:**
- Clear demo wallets immediately when user signs in (before `subscribeToWallets` fires)
- Ensure `demoMode` is set to `false` immediately on sign-in
- OR: Make cards check `isAuthed` first and return 0 if `demoMode` is still true

## Current Code Flow

### 1. Wallet Store Initialization (`src/store/wallets.ts`)
```typescript
export const useWalletStore = create<WalletState>((set) => ({
  wallets: demoWallets,  // ← Starts with demo values (non-zero!)
  loading: false,
  demoMode: true,        // ← Starts in demo mode
  setWallets: (wallets) => set({ wallets, demoMode: false }), // ← Only clears when setWallets is called
  // ...
}))
```

### 2. Sign-In Flow (`src/components/FirebaseAuthListener.tsx`)
```typescript
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // ... ensure user doc ...
    
    // Ensure wallets and subscribe
    await ensureDefaultWallets(user)  // ← Creates wallets in Firestore (0 balances)
    const walletStore = useWalletStore.getState()
    unsubscribeWalletsRef.current = subscribeToWallets(user.uid, (wallets) => {
      walletStore.setWallets(wallets)  // ← This sets demoMode: false, but it's async!
    })
  } else {
    useWalletStore.getState().clear()  // ← Only clears on sign-out
  }
})
```

**Problem:** Between `onAuthStateChanged` firing and `subscribeToWallets` callback firing, the store still has:
- `wallets = demoWallets` (non-zero)
- `demoMode = true`

### 3. Card Display Logic (`src/components/CardStackCard.tsx`)
```typescript
const isAuthed = useAuthStore((state) => state.isAuthed)
const { wallets, demoMode } = useWalletStore()

let cents: number
if (isAuthed && wallets && !demoMode && walletId) {
  // Read from Firestore wallets
  const wallet = (wallets as any)[walletId]
  const fiatBalance = wallet?.fiatBalance ?? 0
  cents = Math.round(fiatBalance * 100)
} else {
  // Pre-auth: use alloc (demo values)
  cents = (alloc as any)[allocKey] || 0  // ← Falls back to alloc, which might have demo values
}
```

**Problem:** When `demoMode` is still `true` (during the race condition), it falls back to `alloc`, which might also have demo values if the reset hasn't happened yet.

## Solution

**Option 1 (Recommended): Clear demo wallets immediately on sign-in**
- When `isAuthed` becomes `true`, immediately clear the wallets store
- Set `demoMode = false` immediately
- This ensures cards show 0 until Firestore wallets load

**Option 2: Guard card display logic**
- If `isAuthed && demoMode`, return 0 (don't use demo wallets)
- This prevents demo values from showing during the race condition

**Option 3: Initialize wallets store with empty wallets for authed users**
- Check `isAuthed` in the store initialization
- If authed, start with empty wallets and `demoMode: false`

## Recommended Fix

Clear demo wallets immediately when user signs in, before `subscribeToWallets` fires:

```typescript
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Clear demo wallets immediately (before Firestore loads)
    const walletStore = useWalletStore.getState()
    walletStore.setWallets({} as WalletMap)  // ← Clear immediately, set demoMode: false
    walletStore.setDemoMode(false)  // ← Explicitly set to false
    
    // ... then subscribe to Firestore wallets ...
    unsubscribeWalletsRef.current = subscribeToWallets(user.uid, (wallets) => {
      walletStore.setWallets(wallets)  // ← This will now update with real Firestore data
    })
  } else {
    useWalletStore.getState().clear()
  }
})
```

This ensures:
- Cards immediately see `demoMode: false` and empty wallets
- Cards will show 0 until Firestore wallets load
- No demo values leak into authed user display


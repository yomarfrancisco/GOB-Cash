# Withdraw Flow Trace - Cash In/Out → Crypto Address Sheet

**Date**: 2025-01-27  
**Purpose**: Prove whether withdraw path is reachable from Cash In/Out button  
**Status**: READ-ONLY INSPECTION (no code changes)

---

## 0) Reproduce Path in Words

### Expected UX Path:
1. Tap "Cash-in / out" button (Profile page)
2. Keypad opens (AmountSheet) with dual buttons: "Withdraw" and "Deposit"
3. User enters amount
4. User taps "Withdraw" button
5. "Withdraw Method" sheet (WithdrawSheet) opens
6. User taps "External crypto wallet"
7. **Expected**: Address-entry modal (WithdrawCryptoAddressSheet) opens

### What Actually Happens:
1. ✅ Tap "Cash-in / out" → Keypad opens
2. ✅ Keypad shows dual buttons: "Withdraw" and "Deposit"
3. ✅ User enters amount
4. ✅ User taps "Withdraw" → WithdrawSheet opens
5. ✅ User taps "External crypto wallet"
6. ❌ **ACTUAL**: WithdrawSheet closes, keypad reopens (LOOPS BACK)
7. ❌ WithdrawCryptoAddressSheet **NEVER OPENS**

---

## 1) Cash In/Out Entrypoint

**File**: `src/app/profile/page.tsx` (lines 382-406)

**Button Code**:
```typescript
<button 
  className="btn profile-edit" 
  disabled={isRestricted}
  onClick={() => {
    if (isRestricted) return
    console.log('[UI] Cash-in/out clicked', { isAuthed })
    guardAuthed(() => {
      console.log('[UI] guardAuthed passed -> opening deposit keypad')
      // Open deposit keypad directly (no CashInOutSheet)
      setAmountMode('deposit')
      setAmountEntryPoint('depositKeypad')
      setTimeout(() => {
        setOpenAmount(true)
      }, 220)
    })
  }}
>
  Cash-in / out
</button>
```

**State Variables Set**:
- `setAmountMode('deposit')` - Sets mode to deposit
- `setAmountEntryPoint('depositKeypad')` - Marks entry point
- `setOpenAmount(true)` - Opens AmountSheet (keypad)

**Key Finding**: Button **always** sets `amountMode='deposit'`, never 'withdraw'

---

## 2) Keypad Navigation/State

**File**: `src/components/AmountSheet.tsx`

**Props Passed** (from `src/app/profile/page.tsx`, lines 647-720):
```typescript
<AmountSheet
  open={openAmount}
  mode={amountMode}  // 'deposit' (from button click)
  entryPoint={amountEntryPoint}  // 'depositKeypad'
  withdrawOnly={false}  // Always false when mode='deposit'
  onCashSubmit={amountMode === 'deposit' && amountEntryPoint === 'depositKeypad' ? ({ amountZAR }) => {
    // Deposit keypad: "Withdraw" button - open withdraw sheet
    setOpenAmount(false)
    setAmountEntryPoint(undefined)
    setTimeout(() => {
      openWithdrawSheet()
    }, 220)
  } : undefined}
  onCardSubmit={amountMode === 'deposit' && amountEntryPoint === 'depositKeypad' ? ({ amountZAR }) => {
    // Deposit keypad: "Deposit" button - store amount and proceed to DepositSheet
    setDepositAmountZAR(amountZAR)
    setOpenAmount(false)
    setAmountEntryPoint(undefined)
    setTimeout(() => {
      openDepositSheet()
    }, 220)
  } : undefined}
  onSubmit={amountMode !== 'send' && amountMode !== 'convert' ? ({ amountZAR, amountUSDT }) => {
    // ... deposit flow logic
  } : undefined}
/>
```

**Dual Button Rendering** (AmountSheet.tsx, lines 377-396):
```typescript
entryPoint === 'depositKeypad' ? (
  // Dual buttons for deposit keypad: "Withdraw" and "Deposit"
  <>
    <button 
      className="amount-keypad__cta amount-keypad__cta--cash" 
      onClick={handleCashSubmit}  // Calls onCashSubmit
      type="button"
      disabled={!isPositive}
    >
      Withdraw
    </button>
    <button 
      className="amount-keypad__cta amount-keypad__cta--card" 
      onClick={handleCardSubmit}  // Calls onCardSubmit
      type="button"
      disabled={!isPositive}
    >
      Deposit
    </button>
  </>
)
```

**Key Finding**: 
- "Withdraw" button calls `handleCashSubmit` → `onCashSubmit`
- `onCashSubmit` handler opens `WithdrawSheet` via `openWithdrawSheet()`
- **Amount is NOT stored** in `withdrawCryptoAmountUSDT` at this point

---

## 3) Withdraw Mode Setting

**Where is withdraw mode set?**

**Answer**: Withdraw mode is **NEVER set** from the Cash In/Out → Keypad → Withdraw button path.

**Evidence**:
1. Cash In/Out button sets `amountMode='deposit'` (line 391)
2. "Withdraw" button calls `onCashSubmit` which opens `WithdrawSheet` directly
3. `WithdrawSheet` `onSelect` handler (profile/page.tsx, line 641-645) sets `amountMode='withdraw'` but **only after** selecting a method, and it **loops back to keypad**:

```typescript
onSelect={(method) => {
  setOpenWithdraw(false)
  setAmountMode('withdraw')  // Sets withdraw mode
  setTimeout(() => setOpenAmount(true), 220)  // BUT REOPENS KEYPAD!
}}
```

**Key Finding**: 
- Withdraw mode is set **too late** (after method selection)
- It immediately loops back to keypad instead of proceeding
- **No way to switch to withdraw mode from keypad UI** - the keypad always starts in deposit mode

---

## 4) Submit Handler Branching

**File**: `src/app/profile/page.tsx` (lines 720-746)

**onSubmit Handler**:
```typescript
onSubmit={amountMode !== 'send' && amountMode !== 'convert' ? ({ amountZAR, amountUSDT }) => {
  // Card deposit flow: branch based on linked accounts
  if (amountMode === 'deposit' && amountEntryPoint === 'cardDeposit' && depositMethod === 'card') {
    // ... card deposit logic
  } else {
    // Other deposit methods (ATM, agent, etc.) - keep existing behavior
    setOpenAmount(false)
    setAmountEntryPoint(undefined)
    console.log('Amount chosen', { amountZAR, amountUSDT, mode: amountMode })
  }
} : undefined}
```

**Key Finding**: 
- **NO withdraw branch** in `onSubmit` handler
- When `amountMode='deposit'`, it just logs and closes
- The "Withdraw" button uses `onCashSubmit`, not `onSubmit`

**onCashSubmit Handler** (lines 696-703):
```typescript
onCashSubmit={amountMode === 'deposit' && amountEntryPoint === 'depositKeypad' ? ({ amountZAR }) => {
  // Deposit keypad: "Withdraw" button - open withdraw sheet
  setOpenAmount(false)
  setAmountEntryPoint(undefined)
  setTimeout(() => {
    openWithdrawSheet()  // Opens WithdrawSheet
  }, 220)
} : undefined}
```

**Key Finding**: 
- "Withdraw" button **does** open WithdrawSheet
- But **amount is NOT stored** in `withdrawCryptoAmountUSDT`
- Only `amountZAR` is passed, not `amountUSDT`

---

## 5) Withdraw Method Sheet Opening

**File**: `src/app/profile/page.tsx` (lines 634-646)

**WithdrawSheet Component**:
```typescript
<WithdrawSheet
  open={openWithdraw}
  onClose={closeWithdraw}
  onBack={() => {
    setOpenWithdraw(false)
    // Withdraw flow: close sheet (no keypad to return to from Cash-in/out entry point)
  }}
  onSelect={(method) => {
    setOpenWithdraw(false)
    setAmountMode('withdraw')
    setTimeout(() => setOpenAmount(true), 220)  // ❌ LOOPS BACK TO KEYPAD
  }}
/>
```

**Key Finding**: 
- WithdrawSheet **IS opened** from "Withdraw" button
- But `onSelect` handler **ALWAYS loops back to keypad** for ALL methods
- **NO branch for 'crypto' method**
- **NO WithdrawCryptoAddressSheet component** in profile/page.tsx

---

## 6) External Crypto Wallet Selection

**File**: `src/app/profile/page.tsx` (lines 641-645)

**onSelect Handler**:
```typescript
onSelect={(method) => {
  setOpenWithdraw(false)
  setAmountMode('withdraw')
  setTimeout(() => setOpenAmount(true), 220)  // ❌ REOPENS KEYPAD
}}
```

**Key Finding**: 
- **NO conditional logic** for `method === 'crypto'`
- **ALL methods** (bank, crypto, etc.) loop back to keypad
- **NO WithdrawCryptoAddressSheet** component exists in profile/page.tsx

**Comparison with page.tsx** (lines 761-777):
```typescript
onSelect={(method) => {
  console.log('[WithdrawSheet] onSelect called with method:', method, 'amountUSDT:', withdrawCryptoAmountUSDT)
  if (method === 'crypto') {
    // Open crypto address modal
    console.log('[WithdrawSheet] Opening crypto address sheet, amountUSDT:', withdrawCryptoAmountUSDT)
    setOpenWithdraw(false)
    setTimeout(() => {
      console.log('[WithdrawSheet] Setting openWithdrawCryptoAddress to true')
      setOpenWithdrawCryptoAddress(true)  // ✅ OPENS ADDRESS SHEET
    }, 220)
  } else {
    setOpenWithdraw(false)
    setAmountMode('withdraw')
    setAmountEntryPoint(undefined)
    setConvertAmount(0)
    setTimeout(() => setOpenAmount(true), 220)
  }
}}
```

**Key Finding**: 
- `page.tsx` **HAS** the correct crypto handler
- `profile/page.tsx` **MISSING** the crypto handler
- `profile/page.tsx` **MISSING** WithdrawCryptoAddressSheet component

---

## 7) Flow Wiring Map

### Deposit Flow (Working):
```
UI Action: Tap "Cash-in / out"
  → Handler: onClick sets amountMode='deposit', entryPoint='depositKeypad', opens AmountSheet
  → State: openAmount=true, amountMode='deposit', amountEntryPoint='depositKeypad'
  → Next Sheet: AmountSheet (keypad) opens

UI Action: Enter amount, tap "Deposit"
  → Handler: onCardSubmit stores amountZAR, opens DepositSheet
  → State: depositAmountZAR set, openAmount=false, openDeposit=true
  → Next Sheet: DepositSheet opens
```

### Withdraw Flow (BROKEN):
```
UI Action: Tap "Cash-in / out"
  → Handler: onClick sets amountMode='deposit', entryPoint='depositKeypad', opens AmountSheet
  → State: openAmount=true, amountMode='deposit', amountEntryPoint='depositKeypad'
  → Next Sheet: AmountSheet (keypad) opens

UI Action: Enter amount, tap "Withdraw"
  → Handler: onCashSubmit calls openWithdrawSheet()
  → State: openAmount=false, openWithdraw=true
  → Next Sheet: WithdrawSheet opens ✅

UI Action: Tap "External crypto wallet"
  → Handler: onSelect('crypto') sets amountMode='withdraw', opens AmountSheet
  → State: openWithdraw=false, amountMode='withdraw', openAmount=true
  → Next Sheet: AmountSheet (keypad) REOPENS ❌ LOOP!
  → Missing: WithdrawCryptoAddressSheet never opens ❌
```

**Root Cause**: 
- `profile/page.tsx` WithdrawSheet `onSelect` handler has **no crypto branch**
- `profile/page.tsx` **missing** WithdrawCryptoAddressSheet component
- Amount not stored in `withdrawCryptoAmountUSDT` when "Withdraw" button clicked

---

## 8) Proposed Minimal Fix (No Implementation)

### Problem Summary:
1. `profile/page.tsx` WithdrawSheet `onSelect` loops back to keypad for ALL methods
2. `profile/page.tsx` missing WithdrawCryptoAddressSheet component
3. Amount not stored in `withdrawCryptoAmountUSDT` when "Withdraw" button clicked

### Minimal Fix Plan:

#### Step 1: Store Amount When "Withdraw" Button Clicked
**File**: `src/app/profile/page.tsx` (line 696-703)

**Change**:
```typescript
onCashSubmit={amountMode === 'deposit' && amountEntryPoint === 'depositKeypad' ? ({ amountZAR, amountUSDT }) => {
  // Store USDT amount for crypto withdrawal
  if (amountUSDT) {
    setWithdrawCryptoAmountUSDT(amountUSDT)  // ADD THIS
  }
  // Deposit keypad: "Withdraw" button - open withdraw sheet
  setOpenAmount(false)
  setAmountEntryPoint(undefined)
  setTimeout(() => {
    openWithdrawSheet()
  }, 220)
} : undefined}
```

#### Step 2: Add WithdrawCryptoAddressSheet Component
**File**: `src/app/profile/page.tsx`

**Add import**:
```typescript
import WithdrawCryptoAddressSheet from '@/components/WithdrawCryptoAddressSheet'
```

**Add state**:
```typescript
const [openWithdrawCryptoAddress, setOpenWithdrawCryptoAddress] = useState(false)
const [withdrawCryptoAmountUSDT, setWithdrawCryptoAmountUSDT] = useState(0)
```

**Add component** (after WithdrawSheet):
```typescript
<WithdrawCryptoAddressSheet
  open={openWithdrawCryptoAddress}
  onClose={() => setOpenWithdrawCryptoAddress(false)}
  onBack={() => {
    setOpenWithdrawCryptoAddress(false)
    setTimeout(() => setOpenWithdraw(true), 220)
  }}
  onSubmit={async (address, network) => {
    // Copy onSubmit handler from page.tsx (lines 818-863)
    // ... same implementation
  }}
  amountUSDT={withdrawCryptoAmountUSDT}
/>
```

#### Step 3: Fix WithdrawSheet onSelect Handler
**File**: `src/app/profile/page.tsx` (line 641-645)

**Change**:
```typescript
onSelect={(method) => {
  if (method === 'crypto') {
    // Open crypto address modal
    setOpenWithdraw(false)
    setTimeout(() => {
      setOpenWithdrawCryptoAddress(true)  // OPEN ADDRESS SHEET
    }, 220)
  } else {
    // Other methods (bank, etc.) - existing behavior
    setOpenWithdraw(false)
    setAmountMode('withdraw')
    setTimeout(() => setOpenAmount(true), 220)
  }
}}
```

### Constraints Met:
- ✅ Withdraw external wallet opens new modal (WithdrawCryptoAddressSheet)
- ✅ Network dropdown defaults to TRON; Ethereum/Solana disabled (already in component)
- ✅ Hard-fail if treasury can't cover (backend already implements this)
- ✅ Uses global/custodial treasury address (backend already implements this)

### Files to Modify:
1. `src/app/profile/page.tsx` - Add state, component, fix handlers

### Files NOT to Modify:
- `src/app/page.tsx` - Already has correct implementation (reference)
- `src/components/WithdrawCryptoAddressSheet.tsx` - Already exists and works
- Deposit flow - Leave completely unchanged

---

## Conclusion

**Withdraw path is NOT reachable** from Cash In/Out button because:
1. `profile/page.tsx` WithdrawSheet handler loops back to keypad for all methods
2. `profile/page.tsx` missing WithdrawCryptoAddressSheet component
3. Amount not stored when "Withdraw" button clicked

**Fix is minimal**: Copy the working implementation from `page.tsx` to `profile/page.tsx`.


# Cash Deposit Flow Documentation (Profile Page)

**Purpose**: Detailed structural documentation of the cash deposit flow starting from the Profile page's "Cash-in / out" button. This describes the complete user journey from entry point to completion for all deposit methods.

**Date**: 2025-01-27

---

## Flow Overview

The cash deposit flow from the Profile page allows users to deposit money into their GoBankless account through multiple methods: bank transfer, card, crypto wallet, ATM, or agent network. The flow branches based on the selected deposit method, with different paths for each option.

---

## Entry Point

### Profile Page → "Cash-in / out" Button

**Location**: Profile page (`src/app/profile/page.tsx`, line 339-348)
- **Button**: "Cash-in / out" (first button in profile actions row)
- **Component**: `.btn.profile-edit` class
- **Action**: Click "Cash-in / out" button
- **Handler**: 
  ```typescript
  onClick={() => {
    guardAuthed(() => {
      setOpenCashInOut(true)
    })
  }}
  ```
- **Requires Auth**: Yes (wrapped in `guardAuthed()`)
- **Opens**: `CashInOutSheet` component

---

## Step 1: Cash-in / out Selection Sheet

**File**: `src/components/CashInOutSheet.tsx`

### Visual Structure

**Header**:
- **Title**: "Cash-in / out"
- **Close Button**: Standard ActionSheet close (X icon, top-right)

**Options** (ActionSheetItem list):
1. **Deposit**
   - **Icon**: `BanknoteArrowUp` (Lucide, size 24)
   - **Title**: "Deposit"
   - **Caption**: "Bring cash or bank money into GoBankless."
   - **Action**: Calls `onSelect('deposit')`

2. **Withdraw**
   - **Icon**: `BanknoteArrowDown` (Lucide, size 24)
   - **Title**: "Withdraw"
   - **Caption**: "Turn GoBankless balance back into cash or bank money."
   - **Action**: Calls `onSelect('withdraw')`

### Text Content

- Title: `"Cash-in / out"`
- Deposit option: `"Deposit"` / `"Bring cash or bank money into GoBankless."`
- Withdraw option: `"Withdraw"` / `"Turn GoBankless balance back into cash or bank money."`

### Functionality

**User selects "Deposit"**:
- Closes `CashInOutSheet`
- After 220ms delay, opens `DepositSheet` with `variant="deposit"`

**Handler** (`src/app/profile/page.tsx`, lines 511-528):
```typescript
<CashInOutSheet
  open={openCashInOut}
  onClose={() => setOpenCashInOut(false)}
  onSelect={(mode) => {
    setOpenCashInOut(false)
    if (mode === 'deposit') {
      setTimeout(() => {
        openDepositSheet()
      }, 220)
    } else {
      // Withdraw flow (not documented here)
      setTimeout(() => {
        openWithdrawSheet()
      }, 220)
    }
  }}
/>
```

---

## Step 2: Deposit Method Selection Sheet

**File**: `src/components/DepositSheet.tsx`

### Visual Structure

**Header**:
- **Title**: "Deposit method" (when `variant="deposit"`)
- **Close Button**: Standard ActionSheet close (X icon, top-right)

**Options** (ActionSheetItem list):
1. **Direct bank transfer**
   - **Icon**: `Landmark` (Lucide, size 22)
   - **Title**: "Direct bank transfer"
   - **Caption**: "Link your bank account. Deposits reflect in 2–3 days."
   - **Method**: `'bank'`

2. **Debit or Credit**
   - **Icon**: `CreditCard` (Lucide, size 22)
   - **Title**: "Debit or Credit"
   - **Caption**: "Link your card for instant deposits."
   - **Method**: `'card'`

3. **Crypto wallet**
   - **Icon**: `Wallet` (Lucide, size 22)
   - **Title**: "Crypto wallet"
   - **Caption**: "Receive USDT directly from an external wallet."
   - **Method**: `'crypto'`

4. **ATM**
   - **Icon**: `Receipt` (Lucide, size 22)
   - **Title**: "ATM"
   - **Caption**: "Deposit cash via ATM."
   - **Method**: `'atm'`

5. **Agent network**
   - **Icon**: `Users` (Lucide, size 22)
   - **Title**: "Agent network"
   - **Caption**: "Deposit cash with a nearby agent."
   - **Method**: `'agent'`

### Text Content

- Title: `"Deposit method"`
- Bank: `"Direct bank transfer"` / `"Link your bank account. Deposits reflect in 2–3 days."`
- Card: `"Debit or Credit"` / `"Link your card for instant deposits."`
- Crypto: `"Crypto wallet"` / `"Receive USDT directly from an external wallet."`
- ATM: `"ATM"` / `"Deposit cash via ATM."`
- Agent: `"Agent network"` / `"Deposit cash with a nearby agent."`

### Functionality

**Handler** (`src/app/profile/page.tsx`, lines 552-575):
```typescript
<DepositSheet
  open={openDeposit}
  onClose={closeDeposit}
  variant="deposit"
  onSelect={(method) => {
    setOpenDeposit(false)
    if (method === 'bank') {
      setDepositMethod('bank')
      setTimeout(() => setOpenCountrySelect(true), 220)
    } else if (method === 'crypto') {
      setDepositMethod('crypto')
      setTimeout(() => setOpenDepositCryptoWallet(true), 220)
    } else if (method === 'card') {
      setDepositMethod('card')
      setAmountMode('deposit')
      setAmountEntryPoint('cardDeposit')
      setTimeout(() => setOpenAmount(true), 220)
    } else if (method === 'atm' || method === 'agent') {
      setDepositMethod(method)
      setAmountMode('deposit')
      setTimeout(() => setOpenAmount(true), 220)
    }
  }}
/>
```

**Branching Logic**:
- **Bank** → Opens `CountrySelectSheet` (Step 3a)
- **Card** → Opens `AmountSheet` with `mode='deposit'` and `entryPoint='cardDeposit'` (Step 3b)
- **Crypto** → Opens `DepositCryptoWalletSheet` (Step 3c)
- **ATM/Agent** → Opens `AmountSheet` with `mode='deposit'` (Step 3d)

---

## Step 3a: Bank Transfer Flow

### 3a.1: Country Selection Sheet

**File**: `src/components/CountrySelectSheet.tsx`

**Visual Structure**:
- **Title**: "Choose country"
- **Options**: List of countries with flag icons
  - Each option shows: country flag (40x40px circular), country name, subtitle
  - Countries: MZ (Mozambique), ZA (South Africa), ZW (Zimbabwe), etc.

**Text Content**:
- Title: `"Choose country"`
- Options: Country names and subtitles from `COUNTRY_SELECT_OPTIONS` config

**Functionality**:
- User selects country → stores `bankTransferCountry` state
- Closes `CountrySelectSheet`
- After 220ms delay, opens `BankTransferDetailsSheet`

### 3a.2: Bank Transfer Details Sheet

**File**: `src/components/BankTransferDetailsSheet.tsx`

**Visual Structure**:
- **Header**: No title (empty string)
- **Reference Pill** (top):
  - Label: "Make a deposit using the reference"
  - Reference code: Displays reference number (e.g., "GOB123456")
- **Details Table**:
  - **Recipient**: Bank account recipient name
  - **Account number**: Bank account number
  - **Account type**: Account type (e.g., "Current")
  - **Bank**: Bank name
  - **SWIFT**: SWIFT code
  - **Reference number**: Reference code with copy button
- **Footer Text**: "Deposits may take up to 72 hours to clear. Use the exact reference above."
- **Close Button**: "CLOSE" button at bottom

**Text Content**:
- Reference label: `"Make a deposit using the reference"`
- Details labels: `"Recipient"`, `"Account number"`, `"Account type"`, `"Bank"`, `"SWIFT"`, `"Reference number"`
- Footer: `"Deposits may take up to 72 hours to clear. Use the exact reference above."`
- Close button: `"CLOSE"`

**Functionality**:
- Displays bank transfer details for selected country
- Copy button on reference number copies to clipboard
- User clicks "CLOSE" → closes sheet (flow ends)

---

## Step 3b: Card Deposit Flow

### 3b.1: Amount Entry Sheet (Card Deposit)

**File**: `src/components/AmountSheet.tsx`

**Visual Structure** (same as general AmountSheet, but with specific props):
- **Header**:
  - Balance: `"R {balance} balance"`
  - Title: Empty (no title shown)
- **Amount Display**: Large ZAR amount + USDT chip
- **Keypad**: Numeric keypad (0-9, decimal, backspace)
- **CTA Button**: "Transfer USDT" (single button, not dual)

**Text Content**:
- Balance: `"R {balance} balance"`
- Button: `"Transfer USDT"`

**Functionality**:
- User enters amount
- User taps "Transfer USDT"
- Handler checks if user has linked cards:
  - **Has linked cards**: Opens `CardDepositAccountSheet` (Step 3b.2)
  - **No linked cards**: Opens `CardDetailsSheet` to link a card first (then returns to account selection)

**Handler** (`src/app/profile/page.tsx`, lines 627-657):
```typescript
onSubmit={({ amountZAR, amountUSDT }) => {
  if (amountMode === 'deposit' && amountEntryPoint === 'cardDeposit' && depositMethod === 'card') {
    setOpenAmount(false)
    setAmountEntryPoint(undefined)
    
    const { linkedCards } = useUserProfileStore.getState().profile
    const hasLinkedAccounts = linkedCards.length > 0
    
    if (hasLinkedAccounts) {
      // User has linked cards, go directly to account selection
      setTimeout(() => {
        useCardDepositAccountSheet.getState().open(amountZAR)
      }, 220)
    } else {
      // User needs to link a card first
      useCardDepositAccountSheet.getState().setAmount(amountZAR)
      setTimeout(() => {
        useCardDetailsSheet.getState().open('create', null, 'depositCard')
      }, 220)
    }
  }
}}
```

### 3b.2: Card Deposit Account Selection Sheet

**File**: `src/components/CardDepositAccountSheet.tsx`

**Visual Structure**:
- **Header**: No title (empty string)
- **Input Section**:
  - Label: "Deposit into account"
  - Input: Read-only, shows selected account label
  - Underline: Standard input underline
- **Account List**:
  - **ZAR account**: Card image + "ZAR account" + balance
  - **MZN account**: Card image + "MZN account" + balance
  - Each account row shows: card preview (40x26px), account label, balance text
  - Selected account shows checkmark icon
- **Footer Button**: "Deposit" button (fixed at bottom)

**Text Content**:
- Input label: `"Deposit into account"`
- Account labels: `"ZAR account"`, `"MZN account"`
- Balance format: `"Balance: R {major}.{cents}"`
- Button: `"Deposit"`

**Functionality**:
- Default selection: ZAR account (savings)
- User can select different account
- User taps "Deposit" → calls `onConfirm` with `{ amountZAR, accountId, accountLabel }`
- Handler opens Ama chat with card deposit scenario

**Handler** (`src/app/profile/page.tsx`, lines 694-699):
```typescript
<CardDepositAccountSheet
  onConfirm={({ amountZAR, accountId, accountLabel }) => {
    openAmaChatWithCardDepositScenario(amountZAR, accountLabel)
  }}
/>
```

### 3b.3: Ama Chat (Card Deposit Confirmation)

**File**: `src/lib/cashDeposit/chatOrchestration.ts`

**Function**: `openAmaChatWithCardDepositScenario(amountZAR, accountLabel)`

**Actions**:
1. Ensures portfolio manager thread exists
2. Formats amount for display
3. Seeds initial chat messages:
   - **Message 1** (immediate): `"I've started your card deposit."`
   - **Message 2** (800ms delay): `"Your card deposit of {amountLabel} into {accountLabel} has been initiated."`
   - **Message 3** (1600ms delay): `"The funds should appear in your account shortly."`
4. Opens inbox sheet
5. Switches to chat view

**Text Content**:
- Message 1: `"I've started your card deposit."`
- Message 2: `"Your card deposit of R {amount} into {accountLabel} has been initiated."`
- Message 3: `"The funds should appear in your account shortly."`

---

## Step 3c: Crypto Wallet Deposit Flow

### 3c.1: Crypto Wallet Selection Sheet

**File**: `src/components/DepositCryptoWalletSheet.tsx`

**Visual Structure**:
- **Title**: "Deposit to crypto wallet"
- **Options** (ActionSheetItem list):
  1. **USDT SA wallet**
     - Card image: `/assets/cards/card-savings.jpg` (40x26px)
     - Title: "USDT SA wallet"
     - Caption: "Copy or scan the QR for this address to deposit USDT from South African accounts."
  
  2. **USDT MZN wallet**
     - Card image: `/assets/cards/card-MZN.jpg` (40x26px)
     - Title: "USDT MZN wallet"
     - Caption: "Copy or scan the QR for this address to deposit USDT from Mozambican accounts."
  
  3. **ETH wallet**
     - Card image: `/assets/cards/card-ETH.jpg` (40x26px)
     - Title: "ETH wallet"
     - Caption: "Copy or scan the QR for this address to deposit ETH directly into this profile."
  
  4. **BTC wallet**
     - Card image: `/assets/cards/card-BTC.jpg` (40x26px)
     - Title: "BTC wallet"
     - Caption: "Copy or scan the QR for this address to deposit BTC directly into this profile."
  
  - Each option has chevron-right icon (trailing)

**Text Content**:
- Title: `"Deposit to crypto wallet"`
- USDT SA: `"USDT SA wallet"` / `"Copy or scan the QR for this address to deposit USDT from South African accounts."`
- USDT MZN: `"USDT MZN wallet"` / `"Copy or scan the QR for this address to deposit USDT from Mozambican accounts."`
- ETH: `"ETH wallet"` / `"Copy or scan the QR for this address to deposit ETH directly into this profile."`
- BTC: `"BTC wallet"` / `"Copy or scan the QR for this address to deposit BTC directly into this profile."`

**Functionality**:
- User selects wallet → stores selected wallet in state
- Closes `DepositCryptoWalletSheet`
- After 220ms delay, opens `CryptoDepositAddressSheet`

### 3c.2: Crypto Deposit Address Sheet

**File**: `src/components/CryptoDepositAddressSheet.tsx`

**Visual Structure**:
- **Header**: No title (empty string)
- **QR Code Block**:
  - Large QR code (220x220px) generated from wallet address
  - Placeholder: "Generating QR code..." while loading
- **Address Text**:
  - Large text display of wallet address (e.g., "0x7F3A9b4C1D27e5f0b8931A2C45d8Bc920eA7F213")
- **Divider**: Horizontal line
- **Copy Row** (ActionSheetItem):
  - Icon: Coin icon (USDT/ETH/BTC logo, 40x40px)
  - Title: "{COIN} address" (e.g., "USDT address")
  - Caption: "Deposit {COIN} directly into this wallet via Ethereum network."
  - Trailing: Copy icon

**Text Content**:
- Copy row title: `"{COIN} address"` (USDT, ETH, or BTC)
- Copy row caption: `"Deposit {COIN} directly into this wallet via Ethereum network."`

**Functionality**:
- Generates QR code from wallet address on open
- User can copy address by tapping copy row
- Copy action shows notification: "Copied!" / "{COIN} address copied"
- User closes sheet when done (flow ends)

---

## Step 3d: ATM / Agent Deposit Flow

### 3d.1: Amount Entry Sheet (ATM/Agent)

**File**: `src/components/AmountSheet.tsx`

**Visual Structure** (same as card deposit, but different handler):
- **Header**:
  - Balance: `"R {balance} balance"`
  - Title: Empty (no title shown)
- **Amount Display**: Large ZAR amount + USDT chip
- **Keypad**: Numeric keypad
- **CTA Button**: "Transfer USDT" (single button)

**Text Content**:
- Balance: `"R {balance} balance"`
- Button: `"Transfer USDT"`

**Functionality**:
- User enters amount
- User taps "Transfer USDT"
- Handler logs amount and closes sheet (no further action currently implemented)

**Handler** (`src/app/profile/page.tsx`, lines 652-656):
```typescript
// Other deposit methods (ATM, agent, etc.) - keep existing behavior
setOpenAmount(false)
setAmountEntryPoint(undefined)
console.log('Amount chosen', { amountZAR, amountUSDT, mode: amountMode })
```

**Note**: ATM and Agent deposit flows are currently stubs - they collect the amount but don't proceed to a completion flow.

---

## Component Files & Responsibilities

### Core Components

1. **CashInOutSheet.tsx**
   - Initial deposit/withdraw selection
   - Two-option ActionSheet

2. **DepositSheet.tsx**
   - Deposit method selection (bank, card, crypto, ATM, agent)
   - Five-option ActionSheet

3. **CountrySelectSheet.tsx**
   - Country selection for bank transfers
   - Multi-option ActionSheet with flag icons

4. **BankTransferDetailsSheet.tsx**
   - Bank account details display
   - Reference number with copy functionality

5. **AmountSheet.tsx**
   - Amount entry keypad
   - Used for card, ATM, and agent deposits

6. **CardDepositAccountSheet.tsx**
   - Account selection for card deposits
   - Shows ZAR and MZN account options

7. **DepositCryptoWalletSheet.tsx**
   - Crypto wallet type selection
   - Four wallet options (USDT SA, USDT MZN, ETH, BTC)

8. **CryptoDepositAddressSheet.tsx**
   - Crypto address display with QR code
   - Copy functionality

### State Management

**Profile Page State** (`src/app/profile/page.tsx`):
- `openCashInOut: boolean` - Controls CashInOutSheet visibility
- `openDeposit: boolean` - Controls DepositSheet visibility
- `openCountrySelect: boolean` - Controls CountrySelectSheet visibility
- `openBankTransferDetails: boolean` - Controls BankTransferDetailsSheet visibility
- `openAmount: boolean` - Controls AmountSheet visibility
- `openDepositCryptoWallet: boolean` - Controls DepositCryptoWalletSheet visibility
- `showCryptoAddressSheet: boolean` - Controls CryptoDepositAddressSheet visibility
- `amountMode: 'deposit' | 'withdraw' | 'send' | 'convert'` - AmountSheet mode
- `amountEntryPoint: 'cardDeposit' | ...` - AmountSheet entry point
- `depositMethod: 'bank' | 'card' | 'crypto' | 'atm' | 'agent' | null` - Selected deposit method
- `bankTransferCountry: CountryCode` - Selected country for bank transfer
- `selectedCryptoDepositWallet: DepositCryptoWallet | null` - Selected crypto wallet

**Store-based State**:
- `useCardDepositAccountSheet` - Controls CardDepositAccountSheet visibility and amount
- `useUserProfileStore` - User profile data (linked cards, crypto addresses)

### Orchestration

1. **chatOrchestration.ts**
   - `openAmaChatWithCardDepositScenario(amountZAR, accountLabel)`
   - Opens inbox and seeds card deposit confirmation messages

---

## Text Content Summary

### CashInOutSheet
- Title: `"Cash-in / out"`
- Deposit: `"Deposit"` / `"Bring cash or bank money into GoBankless."`
- Withdraw: `"Withdraw"` / `"Turn GoBankless balance back into cash or bank money."`

### DepositSheet
- Title: `"Deposit method"`
- Bank: `"Direct bank transfer"` / `"Link your bank account. Deposits reflect in 2–3 days."`
- Card: `"Debit or Credit"` / `"Link your card for instant deposits."`
- Crypto: `"Crypto wallet"` / `"Receive USDT directly from an external wallet."`
- ATM: `"ATM"` / `"Deposit cash via ATM."`
- Agent: `"Agent network"` / `"Deposit cash with a nearby agent."`

### CountrySelectSheet
- Title: `"Choose country"`
- Options: Country names and subtitles from config

### BankTransferDetailsSheet
- Reference label: `"Make a deposit using the reference"`
- Details: `"Recipient"`, `"Account number"`, `"Account type"`, `"Bank"`, `"SWIFT"`, `"Reference number"`
- Footer: `"Deposits may take up to 72 hours to clear. Use the exact reference above."`
- Close: `"CLOSE"`

### AmountSheet (Card/ATM/Agent)
- Balance: `"R {balance} balance"`
- Button: `"Transfer USDT"`

### CardDepositAccountSheet
- Input label: `"Deposit into account"`
- Account labels: `"ZAR account"`, `"MZN account"`
- Balance: `"Balance: R {major}.{cents}"`
- Button: `"Deposit"`

### Ama Chat (Card Deposit)
- Message 1: `"I've started your card deposit."`
- Message 2: `"Your card deposit of R {amount} into {accountLabel} has been initiated."`
- Message 3: `"The funds should appear in your account shortly."`

### DepositCryptoWalletSheet
- Title: `"Deposit to crypto wallet"`
- USDT SA: `"USDT SA wallet"` / `"Copy or scan the QR for this address to deposit USDT from South African accounts."`
- USDT MZN: `"USDT MZN wallet"` / `"Copy or scan the QR for this address to deposit USDT from Mozambican accounts."`
- ETH: `"ETH wallet"` / `"Copy or scan the QR for this address to deposit ETH directly into this profile."`
- BTC: `"BTC wallet"` / `"Copy or scan the QR for this address to deposit BTC directly into this profile."`

### CryptoDepositAddressSheet
- Copy title: `"{COIN} address"` (USDT, ETH, or BTC)
- Copy caption: `"Deposit {COIN} directly into this wallet via Ethereum network."`
- Notification (on copy): `"Copied!"` / `"{COIN} address copied"`

---

## Flow Diagrams

### Bank Transfer Flow
```
Profile Page → "Cash-in / out" button
    ↓
CashInOutSheet → Select "Deposit"
    ↓
DepositSheet → Select "Direct bank transfer"
    ↓
CountrySelectSheet → Select country
    ↓
BankTransferDetailsSheet → View details, copy reference
    ↓
Flow Complete (user closes sheet)
```

### Card Deposit Flow
```
Profile Page → "Cash-in / out" button
    ↓
CashInOutSheet → Select "Deposit"
    ↓
DepositSheet → Select "Debit or Credit"
    ↓
AmountSheet → Enter amount, tap "Transfer USDT"
    ↓
[If no linked cards: CardDetailsSheet → Link card first]
    ↓
CardDepositAccountSheet → Select account (ZAR/MZN), tap "Deposit"
    ↓
Ama Chat → Confirmation messages
    ↓
Flow Complete
```

### Crypto Wallet Flow
```
Profile Page → "Cash-in / out" button
    ↓
CashInOutSheet → Select "Deposit"
    ↓
DepositSheet → Select "Crypto wallet"
    ↓
DepositCryptoWalletSheet → Select wallet type (USDT SA/MZN, ETH, BTC)
    ↓
CryptoDepositAddressSheet → View QR code and address, copy if needed
    ↓
Flow Complete (user closes sheet)
```

### ATM / Agent Flow
```
Profile Page → "Cash-in / out" button
    ↓
CashInOutSheet → Select "Deposit"
    ↓
DepositSheet → Select "ATM" or "Agent network"
    ↓
AmountSheet → Enter amount, tap "Transfer USDT"
    ↓
Flow Complete (amount logged, no further action)
```

---

## Edge Cases & Validation

### Amount Validation
- **Format**: Supports decimals (e.g., "250.50")
- **Display**: Real-time USDT conversion (ZAR / 18.1)
- **No minimum**: No minimum amount validation for deposit flows

### Card Deposit Branching
- **Has linked cards**: Goes directly to account selection
- **No linked cards**: Opens card linking flow first, then returns to account selection

### Crypto Address Generation
- **QR Code**: Generated asynchronously on sheet open
- **Fallback**: Uses example addresses if profile addresses not available
- **Error Handling**: Shows error notification if QR generation fails

### Authentication
- **Requirement**: All entry points require authentication
- **Guard**: `guardAuthed()` wrapper prevents unauthenticated access

---

## Files to Review/Edit

### Primary Flow Files
- `src/app/profile/page.tsx` - Main profile page, entry point handlers, sheet orchestration
- `src/components/CashInOutSheet.tsx` - Initial deposit/withdraw selection
- `src/components/DepositSheet.tsx` - Deposit method selection
- `src/components/CountrySelectSheet.tsx` - Country selection for bank transfers
- `src/components/BankTransferDetailsSheet.tsx` - Bank transfer details display
- `src/components/AmountSheet.tsx` - Amount entry keypad
- `src/components/CardDepositAccountSheet.tsx` - Account selection for card deposits
- `src/components/DepositCryptoWalletSheet.tsx` - Crypto wallet selection
- `src/components/CryptoDepositAddressSheet.tsx` - Crypto address display

### State Management
- `src/store/useCardDepositAccountSheet.ts` - Card deposit account sheet store
- `src/store/userProfile.ts` - User profile store (linked cards, crypto addresses)

### Orchestration
- `src/lib/cashDeposit/chatOrchestration.ts` - Card deposit chat orchestration

### Configuration
- `src/config/depositBankAccounts.ts` - Bank account details by country

---

**End of Documentation**

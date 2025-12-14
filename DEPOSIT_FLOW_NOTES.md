# Deposit Flow Implementation Notes

## Files Changed

1. **src/app/profile/page.tsx**
   - Added `depositAmountZAR` state to persist deposit amount through the flow
   - Modified `CashInOutSheet` onSelect to open deposit keypad instead of DepositSheet directly
   - Added `depositKeypad` entryPoint handling in AmountSheet callbacks
   - Updated `BankTransferDetailsSheet` onNext to use persisted `depositAmountZAR` when creating transaction
   - Clear `depositAmountZAR` when flow completes or is cancelled

2. **src/components/AmountSheet.tsx**
   - Added `depositKeypad` to entryPoint type union
   - Added dual button rendering for `depositKeypad` entryPoint with "Withdraw" and "Deposit" labels
   - Updated dual button CSS class condition to include `depositKeypad`

3. **src/lib/depositChat/sambaMessages.ts**
   - Updated `getSambaMessage` function signature to accept `amount`, `currency`, `country`, `displayName`
   - Updated Message 1 (INTRO_CONFIRM_INTENT) template to include amount, currency, country, bank, reference
   - Added Message 2 (WAITING_FOR_SENT_PROOF) template
   - Updated Message 3 (DEPOSIT_CONFIRMED_LOCKED_DONE) template to include amount, currency, reference

4. **src/components/DepositChatSheet.tsx**
   - Updated `sendSambaMessage` to extract and pass amount, currency, country to `getSambaMessage`
   - Updated chatStep transition from `INTRO_CONFIRM_INTENT` to `WAITING_FOR_SENT_PROOF` when user says "SENT"

## How Amount is Persisted

The deposit amount is persisted using React state (`depositAmountZAR`) in the ProfilePage component:

1. **Entry**: User enters amount on deposit keypad (AmountSheet with `depositKeypad` entryPoint)
2. **Storage**: When "Deposit" button is tapped, amount is stored in `depositAmountZAR` state
3. **Flow**: Amount persists through:
   - DepositSheet (method selection)
   - CountrySelectSheet
   - BankSelectSheet
   - BankTransferDetailsSheet
4. **Transaction Creation**: Amount is used when creating the bank deposit transaction via `tx_createBankDepositRequest`
5. **Chat**: Amount is passed to Samba messages via transaction `amountZar` field
6. **Cleanup**: Amount is cleared when:
   - BankTransferDetailsSheet is closed
   - DepositChatSheet is closed

The amount is **not** stored in global wallet balances - it's a pending deposit intent amount that exists only during the flow.

## How to Test

1. **Start from Profile page**
   - Click "Cash-in / out" button
   - Select "Deposit"

2. **Deposit Keypad**
   - Verify keypad shows with "Withdraw" and "Deposit" buttons at bottom
   - Enter an amount (e.g., 5000)
   - Tap "Deposit" button
   - Should proceed to Deposit method selection

3. **Bank Selection Flow**
   - Select "Direct bank transfer"
   - Choose country (Mozambique or South Africa)
   - Choose bank (MZ: ABSA/BCI, ZA: FNB)
   - Verify bank details sheet shows correct information

4. **Bank Details Sheet**
   - Verify back button works (returns to bank selection)
   - Verify bottom button shows "NEXT" (not "CLOSE")
   - Tap "NEXT"

5. **Samba Chat**
   - Verify chat opens automatically
   - Verify Samba Message 1 is auto-posted with:
     - Correct amount (from keypad)
     - Currency (ZAR or MZN based on country)
     - Country name
     - Bank name
     - Reference number
   - Type "SENT" and verify Samba Message 2 appears
   - (Message 3 will appear when agent confirms - test separately)

6. **Regression Check**
   - Verify map/home cash flows ($ button) still work correctly
   - Verify "Request" and "Pay" buttons on $ button keypad unchanged
   - Verify other deposit methods (card, crypto) still work


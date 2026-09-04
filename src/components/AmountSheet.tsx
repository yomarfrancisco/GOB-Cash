'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import AmountKeypad from './AmountKeypad'
import FitAmount from './FitAmount'
import { exceedsAvailableMzn, exceedsAvailableZar, formatMZN, formatMZNWithDot, formatZAR, formatZARWithDot } from '@/lib/money'
import { MZN_PER_ZAR, mznToZar, zarToMzn, zarToUsdt } from '@/lib/mznZar'
import { formatAgentCashTitle, saveCashPayResume } from '@/lib/agentCashQr'
import { useAuthStore } from '@/store/auth'
import { useWalletAlloc } from '@/state/walletAlloc'
import '@/styles/amount-sheet.css'

const CURRENCY_FLAG = {
  ZAR: { src: '/assets/south%20africa.svg', alt: 'South Africa' },
  MZN: { src: '/assets/mozambique.svg', alt: 'Mozambique' },
} as const

type AmountSheetProps = {
  open: boolean
  onClose: () => void
  mode: 'deposit' | 'withdraw' | 'send' | 'depositCard' | 'convert' // for header text (e.g., "Buy", "Withdraw", "Convert")
  flowType?: 'payment' | 'transfer' // default 'payment'
  balanceMZN?: number
  fxRateMZNperZAR?: number
  ctaLabel?: string
  onSubmit?: (payload: {
    amountMZN: number
    amountZAR: number
    amountUSDT?: number
    mode?: 'deposit' | 'withdraw' | 'send' | 'depositCard' | 'convert'
  }) => void
  onAmountSubmit?: (amountZAR: number) => void // simpler callback for send/transfer flow
  showDualButtons?: boolean // if true, show "Cash" and "Card" buttons instead of single CTA
  onCashSubmit?: (payload: { amountMZN: number; amountZAR: number; amountUSDT?: number; mode?: string }) => void // callback for Cash button
  onCardSubmit?: (payload: { amountMZN: number; amountZAR: number; amountUSDT?: number; mode?: string }) => void | Promise<void> // callback for Card button
  entryPoint?: 'helicopter' | 'cashButton' | 'cardDeposit' | 'sponsorButton' | 'depositKeypad' | 'conversionKeypad' | 'withdrawKeypad'
  conversionDestination?: 'ZAR' | 'MZN'
  onToggleConversion?: () => void
  sponsorHandle?: string // profile handle for sponsor flow (e.g. '@ama')
  onWeeklySubmit?: (payload: { amountMZN: number; amountZAR: number; amountUSDT?: number; mode?: string }) => void // callback for Weekly button (sponsor flow)
  onMonthlySubmit?: (payload: { amountMZN: number; amountZAR: number; amountUSDT?: number; mode?: string }) => void // callback for Monthly button (sponsor flow)
  onScanClick?: () => void // scan icon on lime / pink conversion keypads
  initialAmount?: number // optional initial amount to pre-fill (for back navigation)
  withdrawOnly?: boolean // if true, force single CTA button and skip dual-button logic
  onHelicopterWithdraw?: (payload: { amountMZN: number; amountZAR: number; amountUSDT?: number }) => void // callback for helicopter "Withdraw Cash" button
  depositMethod?: 'bank' | 'card' | 'crypto' | 'atm' | 'agent' | null // deposit method for card deposit flow customization
  customFeeText?: string // custom fee text override (for card deposit: "excl. 3% transaction fee")
  agentCash?: boolean // agent QR conversion: header says "Cash" instead of wallet balance
  agentCashHandle?: string | null // scanned Cash ID handle, shown as Cash@[handle]
}

export default function AmountSheet({
  open,
  onClose,
  mode,
  flowType = 'payment',
  balanceMZN,
  fxRateMZNperZAR = MZN_PER_ZAR,
  ctaLabel,
  onSubmit,
  onAmountSubmit,
  showDualButtons = false,
  onCashSubmit,
  onCardSubmit,
  entryPoint,
  conversionDestination,
  onToggleConversion,
  onScanClick,
  initialAmount,
  withdrawOnly = false,
  onHelicopterWithdraw,
  sponsorHandle,
  onWeeklySubmit,
  onMonthlySubmit,
  depositMethod,
  customFeeText,
  agentCash = false,
  agentCashHandle = null,
}: AmountSheetProps) {
  const [amount, setAmount] = useState('0')
  const [conversionBusy, setConversionBusy] = useState(false)
  const { isAuthed, requireAuth } = useAuthStore()
  const { alloc } = useWalletAlloc()
  const gateGuestPay = agentCash && !isAuthed
  const blockGuestPay = () => {
    requireAuth(() => {})
    if (agentCashHandle) saveCashPayResume(agentCashHandle)
  }
  
  const isWithdrawKeypad = entryPoint === 'withdrawKeypad'
  const isZarPrimaryKeypad =
    (entryPoint === 'depositKeypad' && mode === 'withdraw') ||
    (entryPoint === 'conversionKeypad' && conversionDestination === 'MZN') ||
    (isWithdrawKeypad && conversionDestination === 'ZAR')
  const isConversionKeypad = entryPoint === 'conversionKeypad'
  const displayBalanceMZN = isAuthed ? (alloc.mznCents ?? 0) / 100 : (balanceMZN ?? 0)
  const displayBalanceZAR = isAuthed ? (alloc.cashCents ?? 0) / 100 : 0

  // Reset amount when sheet opens, or use initialAmount if provided
  useEffect(() => {
    if (open) {
      if (initialAmount !== undefined && initialAmount > 0) {
        // Format initial amount (remove trailing zeros, but keep decimals if needed)
        const formatted = initialAmount % 1 === 0 
          ? initialAmount.toString() 
          : initialAmount.toFixed(2).replace(/\.?0+$/, '')
        setAmount(formatted)
      } else {
        setAmount('0')
      }
      setConversionBusy(false)
    }
  }, [open, initialAmount])

  const typedAmount = parseFloat(amount) || 0
  const amountZAR = isZarPrimaryKeypad
    ? typedAmount
    : mznToZar(typedAmount, fxRateMZNperZAR)
  const amountMZN = isZarPrimaryKeypad
    ? Math.round(zarToMzn(typedAmount, fxRateMZNperZAR) * 100) / 100
    : typedAmount
  // Still needed by the explicitly selected external-crypto withdrawal path.
  const amountUSDT = zarToUsdt(amountZAR)

  const handleNumberChange = (next: string) => {
    // Enforce max 2 decimal places
    if (next.includes('.')) {
      const [whole, decimal] = next.split('.')
      if (decimal && decimal.length > 2) {
        return
      }
    }
    // Prevent multiple dots
    if ((next.match(/\./g) || []).length > 1) {
      return
    }
    // Prevent leading zeros except "0."
    if (next.length > 1 && next[0] === '0' && next[1] !== '.') {
      return
    }
    setAmount(next)
  }

  const handleBackspace = () => {
    if (amount.length <= 1) {
      setAmount('0')
    } else {
      setAmount(amount.slice(0, -1))
    }
  }

  const handleDot = () => {
    if (!amount.includes('.')) {
      setAmount(amount + '.')
    }
  }

  const handleSubmit = () => {
    console.debug('[AMOUNT CTA] handleSubmit', { mode, withdrawOnly, hasOnSubmit: !!onSubmit, hasOnAmountSubmit: !!onAmountSubmit })
    if (onAmountSubmit && (mode === 'send' || flowType === 'transfer')) {
      onAmountSubmit(amountZAR)
    } else if (onSubmit) {
      onSubmit({
        amountMZN,
        amountZAR,
        amountUSDT: mode !== 'depositCard' ? amountUSDT : undefined,
        mode,
      })
    }
  }

  const handleCashSubmit = () => {
    // ⛔️ Hard stop: never let "cash" path start a deposit while the sheet is in withdraw mode
    if (mode === 'withdraw' || withdrawOnly) {
      if (isZarPrimaryKeypad && exceedsAvailableZar(amountZAR, displayBalanceZAR)) {
        return
      }
      console.log('[AMOUNT CTA] handleCashSubmit blocked because mode=withdraw; delegating to handleSubmit', {
        modeFromProps: mode,
        withdrawOnly,
      })
      handleSubmit()
      return
    }

    console.debug('[AMOUNT CTA] handleCashSubmit', {
      modeFromProps: mode,
      entryPoint,
      withdrawOnly,
      hasOnCashSubmit: !!onCashSubmit,
      hasOnSubmit: !!onSubmit,
    })

    if (!amountMZN) return

    if (isZarPrimaryKeypad && exceedsAvailableZar(amountZAR, displayBalanceZAR)) {
      return
    }

    // For all non-withdraw flows, pass through the *prop* mode, not some hard-coded arg
    if (onCashSubmit) {
      onCashSubmit({
        amountMZN,
        amountZAR,
        amountUSDT,
        mode,
      })
    } else if (onSubmit) {
      // Fallback to existing onSubmit for backward compatibility
      onSubmit({
        amountMZN,
        amountZAR,
        amountUSDT,
        mode,
      })
    }
  }

  const handleCardSubmit = () => {
    // Handler for card payment flow ("Pay")
    if (onCardSubmit) {
      onCardSubmit({
        amountMZN,
        amountZAR,
        amountUSDT,
        mode: 'convert',
      })
    }
  }

  // Handler for "Request" button (cash convert flow)
  const handleRequestSubmit = () => {
    // Same as handleCashSubmit - triggers cash convert flow
    handleCashSubmit()
  }

  // Detect helicopter convert flow for dual buttons (only if not withdraw-only)
  const isHelicopterConvert = !withdrawOnly && mode === 'convert' && entryPoint === 'helicopter'
  
  // Detect $-button convert flow (Request/Pay) (only if not withdraw-only)
  const isCashButtonConvert = !withdrawOnly && mode === 'convert' && entryPoint === 'cashButton'
  
  // Detect card deposit flow for custom text
  const isCardDeposit = mode === 'deposit' && entryPoint === 'cardDeposit' && depositMethod === 'card'
  
  // Minimum amount for cash transactions (helicopter flow only)
  const MIN_CASH_MZN = 45
  const meetsMinCash = isHelicopterConvert ? amountMZN >= MIN_CASH_MZN : true
  
  const modeLabel = isCardDeposit
    ? 'Deposit'
    : mode === 'withdraw' && (entryPoint === 'depositKeypad' || entryPoint === 'withdrawKeypad')
    ? 'Withdraw'
    : mode === 'deposit' && entryPoint === 'depositKeypad'
    ? 'Deposit'
    : flowType === 'transfer' 
    ? 'Transfer' 
    : mode === 'deposit' || mode === 'depositCard' 
    ? 'Buy' 
    : mode === 'withdraw' 
    ? 'Withdraw' 
    : mode === 'convert'
    ? (isHelicopterConvert ? 'Cash Transactions' : entryPoint === 'cashButton' ? 'Pay or request' : entryPoint === 'sponsorButton' ? (sponsorHandle ? `Fund ${sponsorHandle}` : 'Fund') : 'Convert to crypto')
    : 'Send'
  const defaultCtaLabel = isCardDeposit
    ? 'Next'
    : mode === 'depositCard' 
    ? 'Deposit' 
    : mode === 'send' 
    ? 'Send' 
    : mode === 'convert'
    ? 'Request agent'
    : 'Continue'
  const finalCtaLabel = ctaLabel || defaultCtaLabel
  const isPositive = typedAmount > 0
  const exceedsZarBalance =
    !agentCash && isZarPrimaryKeypad && exceedsAvailableZar(amountZAR, displayBalanceZAR)
  const exceedsMznBalance =
    !agentCash &&
    ((isConversionKeypad && conversionDestination === 'ZAR') ||
      (isWithdrawKeypad && !isZarPrimaryKeypad)) &&
    exceedsAvailableMzn(amountMZN, displayBalanceMZN)
  const keypadFeeText = exceedsZarBalance
    ? 'Insufficient ZAR balance.'
    : exceedsMznBalance
    ? 'Insufficient MZN balance.'
    : customFeeText

  // Format amount for display (remove leading zeros except "0.")
  const displayAmount = amount === '0' ? '0' : amount.replace(/^0+(?=\d)/, '')

  const showScanIcon = Boolean(onScanClick) && (isConversionKeypad || entryPoint === 'cashButton')
  const hideModeLabel = entryPoint === 'cashButton' || entryPoint === 'depositKeypad' || isConversionKeypad || isWithdrawKeypad

  // Lime when converting from Metical; light pink when converting from Rand.
  const isSponsorButtonConvert = !withdrawOnly && mode === 'convert' && entryPoint === 'sponsorButton'
  const useLimeGreenBackground =
    isHelicopterConvert ||
    isCashButtonConvert ||
    isSponsorButtonConvert ||
    (isConversionKeypad && !isZarPrimaryKeypad) ||
    (isWithdrawKeypad && !isZarPrimaryKeypad)
  const usePinkKeypad =
    (isConversionKeypad && isZarPrimaryKeypad) || (isWithdrawKeypad && isZarPrimaryKeypad)

  const primaryFlag = isZarPrimaryKeypad ? CURRENCY_FLAG.ZAR : CURRENCY_FLAG.MZN
  const secondaryFlag = isZarPrimaryKeypad ? CURRENCY_FLAG.MZN : CURRENCY_FLAG.ZAR
  const secondaryAmount = isZarPrimaryKeypad ? formatMZN(amountMZN) : formatZAR(amountZAR)

  return (
    <ActionSheet
      open={open}
      onClose={onClose}
      onOverlayClick={gateGuestPay ? blockGuestPay : undefined}
      title=""
      className={`amount ${useLimeGreenBackground ? 'cash-keypad' : ''} ${usePinkKeypad ? 'pink-keypad' : ''} ${isHelicopterConvert ? 'cash-transactions' : ''}`}
      size="tall"
    >
      <div className={`amount-sheet amount-sheet-wrapper ${isHelicopterConvert ? 'amount-sheet--cash-transactions' : ''}`}>
        <div className={`amount-sheet__header ${showScanIcon ? 'amount-sheet__header--with-scan' : ''}`} style={{ height: 'var(--hdr-h, 118px)' }}>
          {showScanIcon && (
            <button
              onClick={() => {
                if (gateGuestPay) {
                  blockGuestPay()
                  return
                }
                onScanClick?.()
              }}
              className="amount-sheet__scan-button"
              aria-label="Scan QR code"
              type="button"
            >
              <Image src="/assets/core/scan.svg" alt="Scan" width={24} height={24} />
            </button>
          )}
          <div className="amount-sheet__header-content">
            <div
              className={`amount-sheet__balance${agentCash ? ' amount-sheet__balance--cash-handle' : ''}`}
              title={agentCash ? formatAgentCashTitle(agentCashHandle) : undefined}
            >
              {agentCash ? (
                formatAgentCashTitle(agentCashHandle)
              ) : (
                <>
                  {isZarPrimaryKeypad ? formatZARWithDot(displayBalanceZAR) : formatMZN(displayBalanceMZN)}{' '}
                  <span className="amount-sheet__balance-label">balance</span>
                </>
              )}
            </div>
            {!hideModeLabel && <div className="amount-sheet__title">{modeLabel}</div>}
          </div>
          {/* Close button is provided by ActionSheet (as-close-only) */}
        </div>
        <div className="amount-body">
          <div className="amount-sheet__amount-display">
            <div className="amount-sheet__primary-row">
              <img
                src={primaryFlag.src}
                alt={primaryFlag.alt}
                className="amount-sheet__flag amount-sheet__flag--lg"
                draggable={false}
              />
              <div className="amount-sheet__primary-amount">
                <FitAmount
                  text={isZarPrimaryKeypad ? formatZARWithDot(amountZAR) : formatMZNWithDot(amountMZN)}
                  maxPx={72}
                  minPx={28}
                  className="amount-sheet__zar amount-fit"
                />
              </div>
            </div>
            {isConversionKeypad && onToggleConversion ? (
              <button
                type="button"
                className="amount-sheet__usdt-chip amount-sheet__usdt-chip--swap"
                onClick={() => {
                  if (gateGuestPay) {
                    blockGuestPay()
                    return
                  }
                  onToggleConversion?.()
                }}
                aria-label={isZarPrimaryKeypad ? 'Switch to Metical keypad' : 'Switch to Rand keypad'}
              >
                <img
                  src={secondaryFlag.src}
                  alt=""
                  className="amount-sheet__flag amount-sheet__flag--sm"
                  draggable={false}
                />
                {secondaryAmount}
              </button>
            ) : (
              <div className="amount-sheet__usdt-chip">
                <img
                  src={secondaryFlag.src}
                  alt=""
                  className="amount-sheet__flag amount-sheet__flag--sm"
                  draggable={false}
                />
                {secondaryAmount}
              </div>
            )}
          </div>
          <AmountKeypad
            value={displayAmount}
            onChange={(next) => {
              if (gateGuestPay) {
                blockGuestPay()
                return
              }
              handleNumberChange(next)
            }}
            onBackspace={() => {
              if (gateGuestPay) {
                blockGuestPay()
                return
              }
              handleBackspace()
            }}
            onDot={() => {
              if (gateGuestPay) {
                blockGuestPay()
                return
              }
              handleDot()
            }}
            onSubmit={() => {
              if (gateGuestPay) {
                blockGuestPay()
                return
              }
              handleSubmit()
            }}
            ctaLabel={finalCtaLabel}
            hideCTA
            currencySymbol={isZarPrimaryKeypad ? 'R' : 'Mt'}
            isHelicopterConvert={isHelicopterConvert}
            amountMZN={amountMZN}
            customFeeText={keypadFeeText}
          />
        </div>
        <div className={`amount-cta ${(!withdrawOnly && (entryPoint === 'cashButton' || entryPoint === 'sponsorButton' || isHelicopterConvert || showDualButtons)) ? 'amount-cta--dual' : ''} ${useLimeGreenBackground ? 'amount-cta--lime-green' : ''} ${usePinkKeypad ? 'amount-cta--pink' : ''} ${isHelicopterConvert ? 'amount-cta--cash-transactions' : ''}`} style={{ ['--cta-h' as any]: '88px' }}>
          {withdrawOnly ? (
            // Force single button for withdrawal flow
            <button 
              className="amount-keypad__cta" 
              onClick={handleSubmit} 
              type="button"
              disabled={!isPositive}
            >
              {finalCtaLabel}
              <span className="amount-keypad__cta-arrow">→</span>
            </button>
          ) : isHelicopterConvert ? (
            // Dual buttons for helicopter/map entry point: "Deposit Cash" and "Withdraw Cash"
            <>
              <button 
                className="amount-keypad__cta amount-keypad__cta--cash" 
                onClick={handleCashSubmit} 
                type="button"
                disabled={!meetsMinCash}
              >
                Deposit Cash
              </button>
              <button 
                className="amount-keypad__cta amount-keypad__cta--card" 
                onClick={() => {
                  if (!amountMZN) return
                  if (onHelicopterWithdraw) {
                    onHelicopterWithdraw({ amountMZN, amountZAR, amountUSDT })
                  } else if (onSubmit) {
                    onSubmit({ amountMZN, amountZAR, amountUSDT, mode: 'withdraw' as any })
                  }
                }}
                type="button"
                disabled={!meetsMinCash}
              >
                Withdraw Cash
              </button>
            </>
          ) : entryPoint === 'sponsorButton' ? (
            // Dual buttons for sponsor entry point: "Weekly" and "Monthly"
            <>
              <button 
                className="amount-keypad__cta amount-keypad__cta--cash" 
                onClick={() => {
                  if (!amountMZN || !onWeeklySubmit) return
                  onWeeklySubmit({
                    amountMZN,
                    amountZAR,
                    amountUSDT,
                    mode: 'convert',
                  })
                }} 
                type="button"
                disabled={!isPositive}
              >
                Weekly
              </button>
              <button 
                className="amount-keypad__cta amount-keypad__cta--card" 
                onClick={() => {
                  if (!amountMZN || !onMonthlySubmit) return
                  onMonthlySubmit({
                    amountMZN,
                    amountZAR,
                    amountUSDT,
                    mode: 'convert',
                  })
                }} 
                type="button"
                disabled={!isPositive}
              >
                Monthly
              </button>
            </>
          ) : isConversionKeypad ? (
            <button
              className="amount-keypad__cta"
              onClick={() => {
                if (gateGuestPay) {
                  blockGuestPay()
                  return
                }
                if (!isPositive || exceedsZarBalance || exceedsMznBalance || conversionBusy) return
                setConversionBusy(true)
                onClose()
                void Promise.resolve(
                  onCardSubmit?.({
                    amountMZN,
                    amountZAR,
                    amountUSDT,
                    mode: 'convert',
                  })
                )
              }}
              type="button"
              disabled={!isPositive || exceedsZarBalance || exceedsMznBalance || conversionBusy}
            >
              Exchange
            </button>
          ) : entryPoint === 'cashButton' ? (
            // Dual buttons for $ button entry point: "Request" and "Pay"
            <>
              <button 
                className="amount-keypad__cta amount-keypad__cta--cash" 
                onClick={handleRequestSubmit} 
                type="button"
                disabled={!isPositive}
              >
                Request
              </button>
              <button 
                className="amount-keypad__cta amount-keypad__cta--card" 
                onClick={handleCardSubmit} 
                type="button"
                disabled={!isPositive}
              >
                Pay
              </button>
            </>
          ) : (entryPoint === 'depositKeypad' || isWithdrawKeypad) && mode === 'withdraw' ? (
            <button
              className="amount-keypad__cta"
              onClick={handleCashSubmit}
              type="button"
              disabled={!isPositive || exceedsZarBalance || exceedsMznBalance}
            >
              Withdraw
              <span className="amount-keypad__cta-arrow">→</span>
            </button>
          ) : entryPoint === 'depositKeypad' ? (
            <button
              className="amount-keypad__cta"
              onClick={handleCardSubmit}
              type="button"
              disabled={!isPositive}
            >
              Deposit
              <span className="amount-keypad__cta-arrow">→</span>
            </button>
          ) : showDualButtons ? (
            // Legacy dual button support (backward compatibility)
            <>
              <button 
                className="amount-keypad__cta amount-keypad__cta--cash" 
                onClick={handleCashSubmit} 
                type="button"
                disabled={!isPositive}
              >
                Cash
              </button>
              <button 
                className="amount-keypad__cta amount-keypad__cta--card" 
                onClick={handleCardSubmit} 
                type="button"
                disabled={!isPositive}
              >
                Card
              </button>
            </>
          ) : (
            // Default single button
            <button 
              className="amount-keypad__cta" 
              onClick={handleSubmit} 
              type="button"
              disabled={!isPositive}
            >
              {finalCtaLabel}
              <span className="amount-keypad__cta-arrow">→</span>
            </button>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}


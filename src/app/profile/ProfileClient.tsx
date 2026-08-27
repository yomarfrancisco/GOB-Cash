'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import TopGlassBar from '@/components/TopGlassBar'
import BottomGlassBar from '@/components/BottomGlassBar'
import DepositSheet from '@/components/DepositSheet'
import WithdrawSheet from '@/components/WithdrawSheet'
import WithdrawCryptoAddressSheet from '@/components/WithdrawCryptoAddressSheet'
// CashInOutSheet removed - Cash-in/out button now opens AmountSheet directly
import CountrySelectSheet from '@/components/CountrySelectSheet'
import BankSelectSheet, { type SelectedBank } from '@/components/BankSelectSheet'
import BankTransferDetailsSheet from '@/components/BankTransferDetailsSheet'
import DepositChatSheet from '@/components/DepositChatSheet'
import AgentInboxSheet from '@/components/AgentInboxSheet'
import { CountryCode } from '@/config/depositBankAccounts'
import { resolveAssignedDepositBank, completeAssignedDepositBank } from '@/lib/depositBankCycle'
import { uploadDepositProof, assertDepositProofPdf } from '@/lib/depositProof'
import { recordDepositProofPending, resolveDepositReference } from '@/lib/depositProofActivity'
import { AGENT_UID } from '@/types/transactions'
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import AmountSheet from '@/components/AmountSheet'
import SendDetailsSheet from '@/components/SendDetailsSheet'
import SuccessSheet from '@/components/SuccessSheet'
import { ScanOverlay } from '@/components/ScanOverlay'
import { ScanQrSheet } from '@/components/ScanQrSheet'
import { formatUSDT } from '@/lib/money'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'
import { useTransactSheet } from '@/store/useTransactSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { useWalletStore } from '@/store/wallets'
import { useSupportSheet } from '@/store/useSupportSheet'
import { useLinkedAccountsSheet } from '@/store/useLinkedAccountsSheet'
import { CreditCard, WalletCards, Phone, LogOut, PiggyBank, Receipt, Edit3, Inbox, BanknoteArrowDown, SmartphoneNfc, Bell } from 'lucide-react'
import LockOverlay from '@/components/LockOverlay'
// Crypto deposit removed - no longer needed
import PaymentsSheet from '@/components/PaymentsSheet'
import FinancialInboxSheet from '@/components/Inbox/FinancialInboxSheet'
import NotificationsSheet from '@/components/notifications/NotificationsSheet'
import { useNotificationsStore } from '@/state/notifications'
import { useNotificationStore } from '@/store/notifications'
import { useAuthStore } from '@/store/auth'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { usePaymentDetailsSheet } from '@/store/usePaymentDetailsSheet'
import { type ConversionDestination } from '@/store/usePayIntoSheet'
import PayIntoSheet from '@/components/PayIntoSheet'
import { submitInternalConversion } from '@/lib/transactions/submitInternalConversion'
import { useFxRates } from '@/lib/exchangeRates/useFxRates'
import { quotedMznPerZarForDestination } from '@/lib/mznZar'
import { useCardDepositAccountSheet } from '@/store/useCardDepositAccountSheet'
import { useCardDetailsSheet } from '@/store/useCardDetailsSheet'
import { useBankingDetailsSheet } from '@/store/useBankingDetailsSheet'
import { usePendingDeposit } from '@/store/usePendingDeposit'
import CardDepositAccountSheet from '@/components/CardDepositAccountSheet'
import { openAmaChatWithCardDepositScenario, openAmaChatWithAgentInduction } from '@/lib/cashDeposit/chatOrchestration'
import { useAgentOnboardingStore } from '@/state/agentOnboarding'
import { ChevronRight } from 'lucide-react'
import ProductivityHelperSheet from '@/components/ProductivityHelperSheet'
import { logout } from '@/lib/logout'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import { isRestrictedUser } from '@/lib/restrictions'
import { DEFAULT_COMPLIANCE_PERCENT } from '@/lib/didit'
import { prefetchDiditSdk, startDiditVerification } from '@/lib/startDiditVerification'
// Toggle flag to compare both scanner implementations
const USE_MODAL_SCANNER = false // Set to true to use sheet-based scanner, false for full-screen overlay

export default function ProfileClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthed, authReady, openAuthEntry } = useAuthStore()
  const { hasCompletedAgentOnboarding } = useAgentOnboardingStore()
  const [kycStatus, setKycStatus] = useState<string | null>(null)
  const [kycPercent, setKycPercent] = useState<number | null>(null)

  useEffect(() => {
    if (!isAuthed) {
      setKycStatus(null)
      setKycPercent(null)
      return
    }
    const uid = getFirebaseAuth().currentUser?.uid
    if (!uid) {
      setKycStatus(null)
      setKycPercent(null)
      return
    }
    return onSnapshot(doc(getFirestoreDb(), 'users', uid), (snap) => {
      const data = snap.data()
      const status = data?.kycStatus
      const percent = data?.kycPercent
      setKycStatus(typeof status === 'string' ? status : null)
      setKycPercent(typeof percent === 'number' && Number.isFinite(percent) ? percent : null)
    })
  }, [isAuthed])

  useEffect(() => {
    prefetchDiditSdk()
  }, [])
  
  // Redirect unauthenticated users to home (only after auth is ready to prevent race during hydration)
  useEffect(() => {
    if (authReady && !isAuthed) {
      router.replace('/')
    }
  }, [authReady, isAuthed, router])

  // Ref to prevent double-processing of credited return
  const handledCreditedReturnRef = useRef(false)

  // Handle PayFast return (ref query param) with retry logic
  useEffect(() => {
    const ref = searchParams.get('ref')
    const cancel = searchParams.get('cancel')
    const credited = searchParams.get('credited')
    
    if (cancel === 'true') {
      // User cancelled PayFast payment
      usePendingDeposit.getState().clear()
      router.replace('/profile')
      return
    }

    // Handle credited return (Option 5: return handler already credited)
    if (ref && credited === 'true' && isAuthed && authReady) {
      // Prevent double-processing on re-render
      if (handledCreditedReturnRef.current) {
        return
      }
      handledCreditedReturnRef.current = true

      const handleCreditedReturn = async () => {
        console.log('[PayFast Client] credited flow start', { ref })

        // Show "Confirming payment..." state
        const { pushNotification } = useNotificationStore.getState()
        pushNotification({
          kind: 'payment_sent',
          title: 'Confirming payment...',
          body: 'Please wait while we verify your payment',
        })

        try {
          // Get auth token
          const auth = getFirebaseAuth()
          if (!auth?.currentUser) {
            console.error('[PayFast Client] User not authenticated')
            router.replace('/profile')
            return
          }

          const token = await auth.currentUser.getIdToken()

          // Step 1: Fetch payment data from server (independent of Zustand store)
          let paymentData: { amountZAR: number | null; currency: string; status: string | null } | null = null
          let amountSource = 'none'

          try {
            const paymentResponse = await fetch(`/api/payfast/payment?ref=${ref}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            })

            if (paymentResponse.ok) {
              paymentData = await paymentResponse.json()
              amountSource = 'payment-doc'
              console.log('[PayFast Client] payment data fetched', {
                ref,
                amountZAR: paymentData?.amountZAR,
                status: paymentData?.status,
              })
            }
          } catch (error) {
            console.error('[PayFast Client] Failed to fetch payment data', error)
          }

          // Step 2: Get amountZAR from payment doc, fallback to store, then query params
          let amountZAR: number | null = null
          if (paymentData && paymentData.amountZAR) {
            amountZAR = paymentData.amountZAR
            amountSource = 'payment-doc'
          } else {
            // Fallback to Zustand store
            const storeAmount = usePendingDeposit.getState().amountZAR
            if (storeAmount) {
              amountZAR = storeAmount
              amountSource = 'store'
            } else {
              // Fallback to query params (amount_gross from PayFast return)
              const amountGross = searchParams.get('amount_gross')
              if (amountGross) {
                amountZAR = parseFloat(amountGross)
                amountSource = 'query-param'
              }
            }
          }

          console.log('[PayFast Client] amountZAR source', { amountZAR, amountSource })

          // Step 3: Optionally call credit API as "reconcile/ensure" step (will be no-op if already credited)
          try {
            const creditResponse = await fetch(`/api/payfast/credit?ref=${ref}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            })

            const creditData = await creditResponse.json()
            console.log('[PayFast Client] credit API called', {
              ref,
              credited: creditData.credited,
              alreadyCredited: creditData.alreadyCredited,
              newBalance: creditData.newBalance,
            })
          } catch (error) {
            console.error('[PayFast Client] Credit API call failed (non-fatal)', error)
          }

          // Step 4: Wait for wallet balance to update (if we have wallets store)
          const walletStore = useWalletStore.getState()
          const initialBalance = walletStore.wallets?.cashZAR?.fiatBalance || 0
          const expectedBalance = initialBalance + (amountZAR || 0)

          // Wait up to 2 seconds for balance to update
          const MAX_BALANCE_WAIT = 2000
          const BALANCE_CHECK_INTERVAL = 100
          let balanceWaitTime = 0

          while (balanceWaitTime < MAX_BALANCE_WAIT) {
            const currentBalance = useWalletStore.getState().wallets?.cashZAR?.fiatBalance || 0
            if (currentBalance >= expectedBalance || currentBalance > initialBalance) {
              console.log('[PayFast Client] Balance updated', {
                initialBalance,
                currentBalance,
                expectedBalance,
                waitTime: balanceWaitTime,
              })
              break
            }
            await new Promise(resolve => setTimeout(resolve, BALANCE_CHECK_INTERVAL))
            balanceWaitTime += BALANCE_CHECK_INTERVAL
          }

          // Step 5: Open Ama chat with confirmation (if we have amount)
          if (amountZAR) {
            openAmaChatWithCardDepositScenario(amountZAR, 'ZAR account')
            usePendingDeposit.getState().clear()
          } else {
            // Generic confirmation without amount
            pushNotification({
              kind: 'payment_sent',
              title: 'Payment confirmed',
              body: 'Your payment has been processed successfully.',
            })
          }

          console.log('[PayFast Client] credited flow end', { ref, amountZAR, amountSource })

          // Step 6: Clean up query params
          router.replace('/profile')
        } catch (error: any) {
          console.error('[PayFast Client] Credited return flow error', error)
          pushNotification({
            kind: 'payment_failed',
            title: 'Payment confirmation error',
            body: error.message || 'Please contact support if your payment was successful.',
          })
          router.replace('/profile')
        }
      }

      handleCreditedReturn()
      return
    }

    // Handle non-credited return (legacy flow - payment still pending)
    if (ref && !credited && isAuthed && authReady) {
      // User returned from PayFast - credit balance and open chat with retry
      const handlePayFastReturn = async () => {
        const MAX_RETRIES = 10
        const RETRY_DELAY = 1500
        let attempt = 0
        let isProcessing = true

        // Show "Confirming payment..." state
        const { pushNotification } = useNotificationStore.getState()
        pushNotification({
          kind: 'payment_sent',
          title: 'Confirming payment...',
          body: 'Please wait while we verify your payment',
        })

        while (attempt < MAX_RETRIES && isProcessing) {
          try {
            // Get auth token
            const auth = getFirebaseAuth()
            if (!auth?.currentUser) {
              console.error('[ProfilePage] User not authenticated for PayFast credit')
              isProcessing = false
              return
            }

            const token = await auth.currentUser.getIdToken()

            // Call credit API
            const response = await fetch(`/api/payfast/credit?ref=${ref}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            })

            const data = await response.json()

            if (response.ok && data.credited) {
              // Success - payment credited
              isProcessing = false
              
              // Open Ama chat with confirmation
              const { amountZAR } = usePendingDeposit.getState()
              if (amountZAR) {
                openAmaChatWithCardDepositScenario(amountZAR, 'ZAR account')
                usePendingDeposit.getState().clear()
              }

              // Remove query params from URL
              router.replace('/profile')
              return
            } else if (data.alreadyCredited) {
              // Already credited - open Ama chat if we have amount
              isProcessing = false
              const { amountZAR } = usePendingDeposit.getState()
              if (amountZAR) {
                openAmaChatWithCardDepositScenario(amountZAR, 'ZAR account')
                usePendingDeposit.getState().clear()
              }
              router.replace('/profile')
              return
            } else if (data.retry && data.status === 'PENDING') {
              // Payment still pending - retry
              attempt++
              if (attempt < MAX_RETRIES) {
                console.log(`[ProfilePage] Payment still pending, retry ${attempt}/${MAX_RETRIES}`)
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
                continue
              } else {
                // Max retries reached
                pushNotification({
                  kind: 'payment_failed',
                  title: 'Payment confirmation timeout',
                  body: 'Your payment is being processed. Balance will update shortly.',
                })
                router.replace('/profile')
                isProcessing = false
                return
              }
            } else {
              // Other error - don't retry
              throw new Error(data.error || 'Failed to credit balance')
            }
          } catch (error: any) {
            console.error(`[ProfilePage] PayFast credit attempt ${attempt + 1} failed:`, error)
            
            // If it's a retryable error and we haven't maxed out, continue
            if (attempt < MAX_RETRIES - 1 && error.message?.includes('not complete')) {
              attempt++
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
              continue
            } else {
              // Non-retryable error or max retries
              pushNotification({
                kind: 'payment_failed',
                title: 'Payment confirmation failed',
                body: error.message || 'Please contact support if your payment was successful.',
              })
              router.replace('/profile')
              isProcessing = false
              return
            }
          }
        }
      }

      handlePayFastReturn()
    }
  }, [searchParams, isAuthed, authReady, router])

  const { open: openProfileEdit } = useProfileEditSheet()
  const { setOnSelect, open } = useTransactSheet()
  const { profile, setProfile } = useUserProfileStore()
  const { open: openSupport } = useSupportSheet()
  const { open: openLinkedAccounts } = useLinkedAccountsSheet()
  const { open: openBankingDetails } = useBankingDetailsSheet()
  const { openNotifications } = useNotificationsStore()
  const { guardAuthed } = useRequireAuth()
  const { open: openPaymentDetails, close: closePaymentDetails } = usePaymentDetailsSheet()
  const { rates: fxRates } = useFxRates(['MZN'])
  const { open: openDepositAccountSheet } = useCardDepositAccountSheet()

  useEffect(() => {
    if (searchParams.get('activity') !== '1' || !authReady) return

    if (isAuthed) {
      openNotifications()
    }

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('activity')
    const nextQuery = nextParams.toString()
    router.replace(`/profile${nextQuery ? `?${nextQuery}` : ''}`, { scroll: false })
  }, [authReady, isAuthed, openNotifications, router, searchParams])

  const [openPayments, setOpenPayments] = useState(false)
  // openCashInOut removed - Cash-in/out button now opens AmountSheet directly
  const [openDeposit, setOpenDeposit] = useState(false)
  const [openWithdraw, setOpenWithdraw] = useState(false)
  const [openCountrySelect, setOpenCountrySelect] = useState(false)
  const [openBankSelect, setOpenBankSelect] = useState(false)
  const [openBankTransferDetails, setOpenBankTransferDetails] = useState(false)
  const [bankTransferCountry, setBankTransferCountry] = useState<CountryCode>('MZ')
  const [selectedBank, setSelectedBank] = useState<SelectedBank | undefined>(undefined)
  const [openDepositChat, setOpenDepositChat] = useState(false)
  const [depositChatTxId, setDepositChatTxId] = useState<string | null>(null)
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false)
  const [depositChatError, setDepositChatError] = useState<string | null>(null)
  const [openAgentInbox, setOpenAgentInbox] = useState(false)
  const [depositAmountMZN, setDepositAmountMZN] = useState(0)
  const [depositAmountZAR, setDepositAmountZAR] = useState(0) // Converted ZAR quote
  
  // Check if current user is agent
  const auth = getFirebaseAuth()
  const isAgent = auth.currentUser?.uid === AGENT_UID
  const currentUserId = auth.currentUser?.uid
  const isRestricted = isRestrictedUser(currentUserId)
  const [openAmount, setOpenAmount] = useState(false)
  const [openDirectPayment, setOpenDirectPayment] = useState(false)
  const [openSendDetails, setOpenSendDetails] = useState(false)
  const [openSendSuccess, setOpenSendSuccess] = useState(false)
  const [openDepositSuccess, setOpenDepositSuccess] = useState(false)
  const [openDepositFailure, setOpenDepositFailure] = useState(false)
  const depositProofInputRef = useRef<HTMLInputElement>(null)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [amountMode, setAmountMode] = useState<'deposit' | 'withdraw' | 'send' | 'convert'>('deposit')
  const [amountEntryPoint, setAmountEntryPoint] = useState<'helicopter' | 'cashButton' | 'cardDeposit' | 'depositKeypad' | 'conversionKeypad' | 'withdrawKeypad' | undefined>(undefined)
  const [conversionDestination, setConversionDestination] = useState<ConversionDestination>('ZAR')
  const [withdrawFrom, setWithdrawFrom] = useState<ConversionDestination>('MZN')
  const [depositMethod, setDepositMethod] = useState<'bank' | 'card' | 'crypto' | 'atm' | 'agent' | null>(null)
  const [sendAmountZAR, setSendAmountZAR] = useState(0)
  const [sendAmountUSDT, setSendAmountUSDT] = useState(0)
  const [sendRecipient, setSendRecipient] = useState('')
  const [sendMethod, setSendMethod] = useState<'email' | 'wallet' | 'brics' | null>(null)
  const [flowType, setFlowType] = useState<'payment' | 'transfer'>('payment')
  const [isPaySomeoneFlow, setIsPaySomeoneFlow] = useState(false) // Track if coming from "Pay someone" button
  // Crypto deposit removed - no longer needed
  const [isProductivityHelperOpen, setIsProductivityHelperOpen] = useState(false)
  const [openWithdrawCryptoAddress, setOpenWithdrawCryptoAddress] = useState(false)
  const [withdrawCryptoAmountUSDT, setWithdrawCryptoAmountUSDT] = useState(0)
  const [withdrawAmountMZN, setWithdrawAmountMZN] = useState(0)
  const [withdrawAmountZAR, setWithdrawAmountZAR] = useState(0) // Converted ZAR payout

  const openPaymentsSheet = useCallback(() => setOpenPayments(true), [])
  const closePaymentsSheet = useCallback(() => setOpenPayments(false), [])
  const openDepositSheet = useCallback(() => setOpenDeposit(true), [])
  const openBankDepositAccount = useCallback(() => {
    setDepositMethod('bank')
    openDepositAccountSheet(undefined, 'bank')
  }, [openDepositAccountSheet])
  const openBankWithdrawAccount = useCallback(() => {
    openDepositAccountSheet(undefined, 'withdraw')
  }, [openDepositAccountSheet])
  const openDirectPaymentSheet = useCallback(() => setOpenDirectPayment(true), [])
  const closeDirectPayment = useCallback(() => setOpenDirectPayment(false), [])
  const openWithdrawSheet = useCallback(() => setOpenWithdraw(true), [])
  const closeDeposit = useCallback(() => setOpenDeposit(false), [])
  const closeWithdraw = useCallback(() => setOpenWithdraw(false), [])
  const closeBankTransferDetails = useCallback(() => setOpenBankTransferDetails(false), [])
  const closeAmount = useCallback(() => {
    setOpenAmount(false)
    setAmountEntryPoint(undefined) // Reset entry point when closing
  }, [])
  const closeSendDetails = useCallback(() => {
    setOpenSendDetails(false)
    setIsPaySomeoneFlow(false) // Reset flag when closing
  }, [])
  const closeSendSuccess = useCallback(() => {
    setOpenSendSuccess(false)
    setSendRecipient('')
    setSendAmountZAR(0)
    setSendAmountUSDT(0)
  }, [])
  // Crypto deposit removed - handlers no longer needed
  // Crypto deposit removed - handlers no longer needed

  const handleDirectSelect = useCallback((method: 'bank' | 'card' | 'crypto' | 'email' | 'wallet' | 'brics' | 'atm' | 'agent') => {
    if (method === 'email' || method === 'wallet' || method === 'brics') {
      setAmountMode('send')
      setSendMethod(method)
      setOpenDirectPayment(false)
      setTimeout(() => setOpenAmount(true), 220)
    }
  }, [])

  const handleAmountSubmit = useCallback((amountZAR: number) => {
    if (amountMode === 'send' || flowType === 'transfer') {
      setSendAmountZAR(amountZAR)
      setOpenAmount(false)
      setAmountEntryPoint(undefined)
      setTimeout(() => setOpenSendDetails(true), 220)
    }
  }, [amountMode, flowType])

  // Register onSelect handler for global Transact sheet
  useEffect(() => {
    setOnSelect((action) => {
      if (action === 'deposit') {
        setTimeout(() => openBankDepositAccount(), 220)
      } else if (action === 'withdraw') {
        setTimeout(() => setOpenWithdraw(true), 220)
      } else if (action === 'payment') {
        setFlowType('payment')
        setTimeout(() => setOpenDirectPayment(true), 220)
      } else if (action === 'transfer') {
        setFlowType('transfer')
        setAmountMode('send')
        setSendMethod('brics') // Use GoBankless Handle flow like payment
        setTimeout(() => setOpenAmount(true), 220)
      }
    })
    
    return () => {
      setOnSelect(null) // Cleanup on unmount
    }
  }, [openBankDepositAccount, setOnSelect])

  const complianceFill =
    kycPercent == null ? DEFAULT_COMPLIANCE_PERCENT : Math.max(0, Math.min(100, kycPercent))
  const complianceLabel =
    kycStatus || kycPercent != null ? `${Math.round(complianceFill)}% compliant` : 'Compliance'

  const handleDepositProofFile = useCallback(async (file: File) => {
    const country = bankTransferCountry === 'ZA' ? 'ZA' : 'MZ'
    const reference = resolveDepositReference(country, selectedBank)
    setIsSubmittingDeposit(true)
    try {
      assertDepositProofPdf(file)
      if (!selectedBank) {
        throw new Error('No deposit account is assigned yet.')
      }
      const { proofId } = await uploadDepositProof({
        file,
        country,
        bankId: selectedBank,
        depositReference: reference,
      })
      await completeAssignedDepositBank(country)
      await recordDepositProofPending({
        outcome: 'uploaded',
        country,
        bankId: selectedBank,
        reference,
        proofId,
      })
      setOpenBankTransferDetails(false)
      setOpenDepositFailure(false)
      setTimeout(() => setOpenDepositSuccess(true), 220)
    } catch {
      try {
        await recordDepositProofPending({
          outcome: 'failed',
          country,
          bankId: selectedBank,
          reference,
        })
      } catch (activityError) {
        console.warn('[Deposit] Failed to record pending activity.', activityError)
      }
      setOpenBankTransferDetails(false)
      setOpenDepositSuccess(false)
      setTimeout(() => setOpenDepositFailure(true), 220)
    } finally {
      setIsSubmittingDeposit(false)
    }
  }, [selectedBank, bankTransferCountry])

  return (
    <div className="app-shell profile-page">
      <div className="mobile-frame">
        <div className="dashboard-container" style={{ position: 'relative' }}>
          {/* Overlay: Glass bars only */}
          <div className="overlay-glass">
            <div className="overlay-glass-inner">
              <TopGlassBar onScanClick={() => {
                guardAuthed(() => {
                  setIsScannerOpen(true)
                })
              }} />
              <BottomGlassBar 
                currentPath="/profile" 
                onDollarClick={() => {
                  guardAuthed(() => {
                    setConversionDestination('ZAR')
                    setAmountMode('convert')
                    setAmountEntryPoint('conversionKeypad')
                    setOpenAmount(true)
                  })
                }} 
              />
            </div>
          </div>

          {/* Scanner - toggle between overlay and sheet implementations */}
          {USE_MODAL_SCANNER ? (
            <ScanQrSheet isOpen={isScannerOpen} onClose={() => {
              setIsScannerOpen(false)
              // Ensure amount sheet stays closed when scanner closes
              setOpenAmount(false)
              setAmountEntryPoint(undefined)
            }} />
          ) : (
            <ScanOverlay isOpen={isScannerOpen} onClose={() => {
              setIsScannerOpen(false)
              // Ensure amount sheet stays closed when scanner closes
              setOpenAmount(false)
              setAmountEntryPoint(undefined)
            }} />
          )}

          {/* Profile backdrop: Benjamin image with white fade */}
          <div className="profile-backdrop">
            <img
              src="/assets/benjamin_grey.png"
              alt=""
              className="profile-backdrop-image"
            />
            <div className="profile-backdrop-fade" />
          </div>

          {/* Scrollable content */}
          <div className="scroll-content profile-scroll">
            <div className="content profile-content">
              {/* Handle (avatar lives on the bottom menu bar) */}
              <div className="profile-header">
                <h1 className="profile-name">
                  {profile.userHandle && profile.userHandle !== '@' && profile.userHandle.length > 1
                    ? profile.userHandle
                    : 'Loading...'}
                </h1>
              </div>

              <button
                type="button"
                className="profile-stats-card profile-stats-card--compliance"
                onClick={() => void startDiditVerification()}
              >
                <div className="network-pill">
                  <div className="network-track">
                    <div
                      className="network-fill"
                      style={{ width: `${complianceFill}%` }}
                    />
                  </div>
                  <div className="network-label">
                    <span>{complianceLabel}</span>
                    <ChevronRight className="network-chevron" size={16} strokeWidth={2.5} />
                  </div>
                </div>
              </button>

              {/* Buttons */}
              <div className="profile-actions">
                <button 
                  className="btn profile-edit" 
                  disabled={isRestricted}
                  onClick={() => {
                    if (isRestricted) return
                    guardAuthed(() => {
                      openBankDepositAccount()
                    })
                  }}
                  style={{ 
                    position: 'relative',
                    ...(isRestricted ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                  }}
                  aria-disabled={isRestricted}
                >
                  Deposit
                  <LockOverlay show={isRestricted} />
                </button>
                <button
                  className="btn profile-inbox"
                  disabled={isRestricted}
                  onClick={() => {
                    if (isRestricted) return
                    guardAuthed(() => {
                      openBankWithdrawAccount()
                    })
                  }}
                  style={{ 
                    position: 'relative',
                    ...(isRestricted ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                  }}
                  aria-disabled={isRestricted}
                >
                  Withdraw
                  <LockOverlay show={isRestricted} />
                </button>
              </div>

              {/* Earn as a cash agent tile — temporarily hidden; set to true to restore */}
              {false && (
              <div className="profile-social-task">
                <button
                  className="profile-social-task-row"
                  onClick={() => {
                    guardAuthed(() => {
                      // Open agent induction flow in Ama chat
                      openAmaChatWithAgentInduction()
                    })
                  }}
                  type="button"
                  aria-label={hasCompletedAgentOnboarding ? "Clock in as an agent" : "Earn as a cash agent"}
                >
                  <div className="profile-social-task-left">
                    <div className="profile-settings-icon">
                      <SmartphoneNfc size={22} strokeWidth={2} style={{ color: '#111' }} />
                    </div>
                    <div className="profile-social-task-text">
                      <span className="profile-social-task-title">
                        {hasCompletedAgentOnboarding ? 'Clock in as an agent' : 'Earn as a cash agent'}
                      </span>
                      <span className="profile-social-task-subtitle">
                        {hasCompletedAgentOnboarding ? 'Come online and boost your agent credit' : 'Clock in, earn productivity'}
                      </span>
                    </div>
                  </div>
                  <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
                </button>
              </div>
              )}
              <div className="profile-settings">
                <div className="profile-settings-card profile-settings-card--solo">
                  <button
                    className="profile-settings-row"
                    disabled={isRestricted}
                    onClick={() => {
                      if (isRestricted) return
                      guardAuthed(() => {
                        openNotifications()
                      })
                    }}
                    type="button"
                    style={{
                      position: 'relative',
                      ...(isRestricted ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                    }}
                    aria-disabled={isRestricted}
                  >
                    <div className="profile-settings-left">
                      <div className="profile-settings-icon">
                        <Inbox size={22} strokeWidth={2} style={{ color: '#111' }} />
                      </div>
                      <span className="profile-settings-label">Activity</span>
                    </div>
                    <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
                    <LockOverlay show={isRestricted} />
                  </button>
                </div>
                <h2 className="profile-settings-heading">Settings</h2>
                <div className="profile-settings-card">
                  {/* Notifications row - hidden for minimal UI */}
                  {false && (
                    <button
                      className="profile-settings-row"
                      onClick={() => {
                        guardAuthed(() => {
                          openNotifications()
                        })
                      }}
                      type="button"
                    >
                      <div className="profile-settings-left">
                        <div className="profile-settings-icon">
                          <Bell size={22} strokeWidth={2} style={{ color: '#111' }} />
                        </div>
                        <span className="profile-settings-label">Notifications</span>
                      </div>
                      <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
                    </button>
                  )}
                  <button
                    className="profile-settings-row"
                    onClick={() => {
                      guardAuthed(() => {
                        openProfileEdit()
                      })
                    }}
                    type="button"
                  >
                    <div className="profile-settings-left">
                      <div className="profile-settings-icon">
                        <Edit3 size={22} strokeWidth={2} style={{ color: '#111' }} />
                      </div>
                      <span className="profile-settings-label">Edit profile</span>
                    </div>
                    <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
                  </button>
                  <button
                    className="profile-settings-row"
                    onClick={() => {
                      guardAuthed(() => {
                        openLinkedAccounts()
                      })
                    }}
                    type="button"
                  >
                    <div className="profile-settings-left">
                      <div className="profile-settings-icon">
                        <WalletCards size={22} strokeWidth={2} style={{ color: '#111' }} />
                      </div>
                      <span className="profile-settings-label">Linked accounts</span>
                    </div>
                    <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
                  </button>
                  {/* Help and support row - hidden for minimal UI */}
                  {false && (
                    <button
                      className="profile-settings-row"
                      onClick={() => {
                        guardAuthed(() => {
                          openSupport()
                        })
                      }}
                      type="button"
                    >
                      <div className="profile-settings-left">
                        <div className="profile-settings-icon">
                          <Phone size={22} strokeWidth={2} style={{ color: '#111' }} />
                        </div>
                        <span className="profile-settings-label">Help and support</span>
                      </div>
                      <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
                    </button>
                  )}
                  <button
                    className="profile-settings-row"
                    onClick={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      
                      // Call comprehensive logout function
                      await logout()
                    }}
                    type="button"
                  >
                    <div className="profile-settings-left">
                      <div className="profile-settings-icon">
                        <LogOut size={22} strokeWidth={2} style={{ color: '#111' }} />
                      </div>
                      <span className="profile-settings-label">Log out</span>
                    </div>
                    <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
                  </button>
                </div>
            </div>
          </div>

          {/* Top fade overlay - fades content behind top glass/logo */}
          <div className="content-fade-top" />

          {/* Bottom fade overlay - fades content behind bottom glass nav */}
          <div className="content-fade-bottom" />

        </div>
      </div>
    </div>

      {/* Sheets */}
      {/* CashInOutSheet removed - Cash-in/out button now opens AmountSheet directly */}
      <PaymentsSheet
        open={openPayments}
        onClose={closePaymentsSheet}
        onPayment={() => {
          setFlowType('payment')
          setTimeout(() => setOpenDirectPayment(true), 220)
        }}
        onTransfer={() => {
          setFlowType('transfer')
          setAmountMode('send')
          setSendMethod('brics')
          setTimeout(() => setOpenAmount(true), 220)
        }}
        onDeposit={() => {
          setTimeout(() => openBankDepositAccount(), 220)
        }}
      />
      <DepositSheet
        open={openDirectPayment}
        onClose={closeDirectPayment}
        variant="direct-payment"
        onSelect={handleDirectSelect}
      />
      <DepositSheet
        open={openDeposit}
        onClose={closeDeposit}
        variant="deposit"
        onBack={() => {
          setOpenDeposit(false)
          setTimeout(() => {
            // Go back to deposit keypad with persisted amount
            setAmountMode('deposit')
            setAmountEntryPoint('depositKeypad')
            setOpenAmount(true)
          }, 220)
        }}
        onSelect={(method) => {
          setOpenDeposit(false)
          if (method === 'bank') {
            setDepositMethod('bank')
            setTimeout(() => openBankDepositAccount(), 220)
          } else if (method === 'card') {
            setDepositMethod('card')
            // Read pending deposit from store (committed when user tapped "Deposit")
            const pendingDeposit = usePendingDeposit.getState()
            let finalAmount = pendingDeposit.amountZAR
            
            // Belt-and-suspenders: if store is empty, try to use local state
            if (!finalAmount || finalAmount <= 0) {
              if (depositAmountZAR > 0) {
                console.log('[Card] Fallback: using depositAmountZAR', depositAmountZAR)
                finalAmount = depositAmountZAR
                usePendingDeposit.getState().setPendingDeposit({
                  direction: 'deposit',
                  amountZAR: depositAmountZAR,
                  source: 'keypad',
                })
              }
            }
            
            // Set method in store
            usePendingDeposit.getState().setPendingDeposit({
              method: 'card',
            })
            
            console.log('[Card] pendingDeposit=', { amountZAR: finalAmount, method: 'card' })
            
            // Directly redirect to PayFast (skip CardDetailsSheet - PayFast handles card details)
            if (finalAmount && finalAmount > 0) {
              setOpenDeposit(false)
              const handlePayFastRedirect = async () => {
                try {
                  // Get current user ID from Firebase Auth
                  const auth = getFirebaseAuth()
                  if (!auth?.currentUser) {
                    console.error('[PayFast Redirect] User not authenticated')
                    const { pushNotification } = useNotificationStore.getState()
                    pushNotification({
                      kind: 'payment_failed',
                      title: 'Authentication required',
                      body: 'You must be logged in to make a deposit.',
                    })
                    return
                  }

                  const userId = auth.currentUser.uid

                  // Call PayFast create API
                  const response = await fetch('/api/payfast/create', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      user_id: userId,
                      amount_zar: finalAmount,
                    }),
                  })

                  if (!response.ok) {
                    const error = await response.json()
                    throw new Error(error.error || 'Failed to create payment')
                  }

                  const data = await response.json()
                  const { redirect_url } = data

                  // Redirect to PayFast
                  window.location.href = redirect_url
                } catch (error: any) {
                  console.error('[PayFast Redirect] Failed:', error)
                  const { pushNotification } = useNotificationStore.getState()
                  pushNotification({
                    kind: 'payment_failed',
                    title: 'Payment setup failed',
                    body: error.message || 'Please try again.',
                  })
                }
              }

              handlePayFastRedirect()
            } else {
              // No amount yet - open amount keypad first
              setOpenDeposit(false)
              setAmountMode('deposit')
              setAmountEntryPoint('cardDeposit')
              setTimeout(() => setOpenAmount(true), 220)
            }
          }
          // Crypto wallet option removed - no longer handled
        }}
      />
      <WithdrawSheet
        open={openWithdraw}
        onClose={closeWithdraw}
        onBack={() => {
          setOpenWithdraw(false)
          // Withdraw flow: close sheet (no keypad to return to from Cash-in/out entry point)
        }}
        onSelect={(method) => {
          if (method === 'crypto') {
            // Open crypto address modal
            setOpenWithdraw(false)
            setTimeout(() => {
              setOpenWithdrawCryptoAddress(true)
            }, 220)
          } else if (method === 'bank') {
            // Open Banking Details sheet in withdrawal mode with keypad amount
            if (withdrawAmountZAR <= 0) {
              console.error('[WithdrawSheet] No withdrawal amount available')
              return
            }
            setOpenWithdraw(false)
            setTimeout(() => {
              openBankingDetails('withdraw', null, withdrawAmountZAR, undefined, withdrawAmountMZN)
            }, 220)
          } else {
            // Other methods - existing behavior (shouldn't happen with current options)
            setOpenWithdraw(false)
            setAmountMode('withdraw')
            setTimeout(() => setOpenAmount(true), 220)
          }
        }}
      />
      <WithdrawCryptoAddressSheet
        open={openWithdrawCryptoAddress}
        onClose={() => setOpenWithdrawCryptoAddress(false)}
        onBack={() => {
          setOpenWithdrawCryptoAddress(false)
          setTimeout(() => setOpenWithdraw(true), 220)
        }}
        onSubmit={async (address, network) => {
          const { pushNotification } = useNotificationStore.getState()
          const { tx_withdrawTronUSDT } = await import('@/lib/transactions/clientFunctions')
          
          // Open chat immediately with null txId (shows local typing bubble, no Firestore listeners yet)
          setOpenWithdrawCryptoAddress(false)
          setDepositChatTxId(null) // Start with null - will be updated when we have valid txId
          setDepositChatError(null) // Clear any previous errors
          setOpenDepositChat(true)
          
          // Track if we got a result (for timeout check)
          let hasResult = false
          
          // Set timeout fallback (15 seconds)
          const timeoutId = setTimeout(() => {
            if (!hasResult) {
              setDepositChatError('Still processing—please wait or try again.')
            }
          }, 15000)
          
          try {
            const result = await tx_withdrawTronUSDT({
              toAddress: address,
              amountUSDT: withdrawCryptoAmountUSDT,
              // requestId is optional, will be generated in clientFunctions if not provided
            })
            
            hasResult = true
            clearTimeout(timeoutId)
            
            // Only start Firestore listeners if we have a valid txId and successful status
            if (result.txId && result.status === 'BROADCAST_FULL') {
              // Update txId - this will trigger Firestore listeners in DepositChatSheet
              setDepositChatTxId(result.txId)
              
              // Success notification
              pushNotification({
                kind: 'transfer',
                title: 'USDT Withdrawal Sent',
                body: `${result.sentAmountUSDT.toFixed(6)} USDT sent to TRON address${result.txId ? ` (TxID: ${result.txId.slice(0, 8)}...)` : ''}`,
                amount: {
                  currency: 'USDT',
                  value: result.sentAmountUSDT,
                },
                direction: 'down',
                actor: { type: 'system', name: 'GoBankless' },
              })
            } else {
              // Failed status - show error in chat (no Firestore listeners)
              let errorMessage = 'Withdrawal failed. Please try again or contact support.'
              if (result.status === 'FAILED_INSUFFICIENT_TREASURY' || result.status === 'FAILED_ZERO_TREASURY') {
                errorMessage = 'Withdrawal failed: Treasury has insufficient balance. Please try again later or contact support.'
              } else if (result.status === 'FAILED_TREASURY_NO_TRX') {
                errorMessage = 'Withdrawal failed: Treasury lacks TRX to execute the transaction. Please contact support.'
              } else if (result.status === 'FAILED_BROADCAST') {
                errorMessage = 'Withdrawal failed: Transaction could not be broadcast. Please try again or contact support.'
              }
              setDepositChatError(errorMessage)
            }
            
            // Balance updates automatically via Firestore subscription
          } catch (error: any) {
            hasResult = true
            clearTimeout(timeoutId)
            
            // Log full error for debugging
            console.error('[WithdrawCryptoAddressSheet] Error details:', {
              code: error?.code,
              message: error?.message,
              details: error?.details,
              stack: error?.stack,
            })

            // Map Firebase error codes to user-friendly messages for chat display
            let errorMessage = 'Withdrawal failed. Please try again or contact support.'
            
            if (error?.code === 'functions/failed-precondition') {
              if (error.message?.includes('Insufficient treasury') || error.message?.includes('treasury') || error.message?.includes('Treasury')) {
                errorMessage = `Treasury has insufficient balance. Requested ${withdrawCryptoAmountUSDT.toFixed(6)} USDT. Please try again later or contact support.`
              } else if (error.message?.includes('Insufficient user balance') || error.message?.includes('user balance') || error.message?.includes('Insufficient balance')) {
                errorMessage = 'Insufficient USDT balance. Please check your balance and try again.'
              } else if (error.message?.includes('in progress') || error.message?.includes('already in progress')) {
                errorMessage = 'Withdrawal already in progress. Please wait and try again.'
              } else if (error.message?.includes('Invalid TRON address') || error.message?.includes('Invalid address')) {
                errorMessage = 'Invalid TRON address format. Please check the address and try again.'
              } else {
                errorMessage = error.message || 'Withdrawal cannot be processed at this time. Please try again.'
              }
            } else if (error?.code === 'functions/invalid-argument') {
              errorMessage = error.message || 'Invalid request parameters. Please try again.'
            } else if (error?.code === 'functions/internal') {
              if (error.message?.includes('broadcast') || error.message?.includes('Broadcast')) {
                errorMessage = 'Transaction failed to broadcast. Please try again or contact support.'
              } else {
                errorMessage = error.message || 'Withdrawal could not be processed. Please try again.'
              }
            } else if (error?.code === 'functions/unauthenticated') {
              errorMessage = 'You must be logged in to withdraw. Please log in and try again.'
            } else if (error?.code === 'functions/permission-denied') {
              errorMessage = 'You do not have permission to perform this action. Please contact support.'
            } else if (error?.message?.includes('CORS') || error?.message?.includes('cors')) {
              console.error('[WithdrawCryptoAddressSheet] CORS error detected - this should not happen with httpsCallable')
              errorMessage = 'Network error: Please check your connection and try again.'
            } else if (error?.message) {
              errorMessage = error.message
            }
            
            // Show error in chat (no Firestore listeners, chat is already open)
            setDepositChatError(errorMessage)
          }
        }}
        amountUSDT={withdrawCryptoAmountUSDT}
      />
      <AmountSheet
        open={openAmount}
        onClose={() => {
          // Special handling for card deposit flow: return to DepositSheet
          if (amountMode === 'deposit' && amountEntryPoint === 'cardDeposit' && depositMethod === 'card') {
            setOpenAmount(false)
            setAmountEntryPoint(undefined)
            setTimeout(() => {
              setOpenDeposit(true)
            }, 220)
          } else if (amountEntryPoint === 'withdrawKeypad') {
            setOpenAmount(false)
            setTimeout(() => openBankWithdrawAccount(), 220)
          } else if (amountEntryPoint === 'depositKeypad') {
            setOpenAmount(false)
            setAmountEntryPoint(undefined)
            setDepositAmountMZN(0)
            setDepositAmountZAR(0)
          } else {
            setOpenAmount(false)
            setAmountEntryPoint(undefined) // Reset entry point when closing
          }
        }}
        mode={amountMode}
        flowType={flowType}
        balanceMZN={0}
        ctaLabel={amountMode === 'deposit' && amountEntryPoint === 'cardDeposit' && depositMethod === 'card' ? 'Next' : amountMode === 'deposit' ? 'Continue' : amountMode === 'send' ? (flowType === 'transfer' ? 'Transfer' : 'Send') : 'Continue'}
        showDualButtons={amountMode === 'convert' && !amountEntryPoint} // Legacy support: only if entryPoint not set
        entryPoint={amountEntryPoint}
        conversionDestination={amountEntryPoint === 'withdrawKeypad' ? withdrawFrom : conversionDestination}
        onToggleConversion={amountEntryPoint === 'conversionKeypad' ? () => {
          const next = conversionDestination === 'ZAR' ? 'MZN' : 'ZAR'
          setOpenAmount(false)
          setTimeout(() => {
            setConversionDestination(next)
            setAmountMode('convert')
            setAmountEntryPoint('conversionKeypad')
            setOpenAmount(true)
          }, 600)
        } : undefined}
        fxRateMZNperZAR={
          amountEntryPoint === 'conversionKeypad'
            ? quotedMznPerZarForDestination(
                typeof fxRates?.rates?.MZN === 'number' ? fxRates.rates.MZN : 0,
                conversionDestination
              )
            : typeof fxRates?.rates?.MZN === 'number'
              ? fxRates.rates.MZN
              : undefined
        }
        depositMethod={depositMethod}
        customFeeText={amountMode === 'deposit' && amountEntryPoint === 'cardDeposit' && depositMethod === 'card' ? 'excl. 3% transaction fee' : undefined}
        onScanClick={amountEntryPoint === 'cashButton' ? () => {
          guardAuthed(() => {
            // 1) Close the keypad sheet first
            setOpenAmount(false)
            setAmountEntryPoint(undefined)
            
            // 2) After the close animation starts, open the scanner
            //    Small timeout (~220ms) to match other sheet transitions
            setTimeout(() => {
              setIsScannerOpen(true)
            }, 220)
          })
        } : undefined}
        onCashSubmit={amountMode === 'convert' ? ({ amountMZN, amountZAR }) => {
          // Cash convert flow ("Request" button): open PaymentDetailsSheet
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => {
            openPaymentDetails('request', amountMZN, amountZAR)
          }, 220)
        } : amountMode === 'deposit' && amountEntryPoint === 'depositKeypad' ? ({ amountMZN, amountZAR, amountUSDT }) => {
          // Deposit keypad: "Withdraw" button - store amount and open withdraw sheet
          setWithdrawAmountMZN(amountMZN)
          setWithdrawAmountZAR(amountZAR) // Store ZAR amount for bank withdrawals
          if (amountUSDT) {
            setWithdrawCryptoAmountUSDT(amountUSDT)
          }
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => {
            openWithdrawSheet()
          }, 220)
        } : undefined}
        onCardSubmit={amountEntryPoint === 'conversionKeypad' ? ({ amountMZN, amountZAR }) => {
          void submitInternalConversion({
            destination: conversionDestination,
            amountMZN,
            amountZAR,
          }).catch((error: any) => {
            const message = String(error?.message || '')
            useNotificationStore.getState().pushNotification({
              kind: 'payment_failed',
              title: 'Conversion failed',
              body: /insufficient/i.test(message)
                ? conversionDestination === 'ZAR'
                  ? 'Insufficient MZN balance.'
                  : 'Insufficient ZAR balance.'
                : 'Unable to convert.',
              actor: { type: 'system', name: 'MozPay' },
            })
          })
        } : amountMode === 'convert' ? ({ amountMZN, amountZAR }) => {
          // Card payment flow ("Pay someone"): open PaymentDetailsSheet
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => {
            openPaymentDetails('pay', amountMZN, amountZAR)
          }, 220)
        } : amountMode === 'deposit' && amountEntryPoint === 'depositKeypad' ? ({ amountMZN, amountZAR }) => {
          // Deposit keypad: "Deposit" button - commit amount to store and proceed to DepositSheet
          console.log('[Deposit] commit amount=', { amountMZN, amountZAR })
          if (amountMZN > 0) {
            // Commit to Zustand store
            usePendingDeposit.getState().setPendingDeposit({
              direction: 'deposit',
              amountZAR,
              source: 'keypad',
            })
          }
          setDepositAmountMZN(amountMZN)
          setDepositAmountZAR(amountZAR)
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => {
            openDepositSheet()
          }, 220)
        } : undefined}
        onSubmit={amountMode !== 'send' && amountMode !== 'convert' ? ({ amountMZN, amountZAR, amountUSDT }) => {
          // Withdraw mode: store amount and open withdraw method sheet
          if (amountMode === 'withdraw') {
            setWithdrawAmountMZN(amountMZN)
            setWithdrawAmountZAR(amountZAR)
            if (amountUSDT) {
              setWithdrawCryptoAmountUSDT(amountUSDT)
            }
            setOpenAmount(false)
            setTimeout(() => {
              openBankingDetails('withdraw', null, amountZAR, undefined, amountMZN, () => {
                setTimeout(() => {
                  setAmountMode('withdraw')
                  setAmountEntryPoint('withdrawKeypad')
                  setOpenAmount(true)
                }, 220)
              })
            }, 220)
            return
          }
          // Card deposit flow: non-tokenized v1 - directly redirect to PayFast (skip CardDetailsSheet)
          if (amountMode === 'deposit' && amountEntryPoint === 'cardDeposit' && depositMethod === 'card') {
            setOpenAmount(false)
            setAmountEntryPoint(undefined)
            
            // Store amount in pending deposit store (for Ama confirmation after return)
            usePendingDeposit.getState().setAmount(amountZAR)
            usePendingDeposit.getState().setMethod('card')
            
            // Directly call PayFast create and redirect (skip CardDetailsSheet - PayFast handles card details)
            const handlePayFastRedirect = async () => {
              try {
                // Get current user ID from Firebase Auth
                const auth = getFirebaseAuth()
                if (!auth?.currentUser) {
                  console.error('[PayFast Redirect] User not authenticated')
                  const { pushNotification } = useNotificationStore.getState()
                  pushNotification({
                    kind: 'payment_failed',
                    title: 'Authentication required',
                    body: 'You must be logged in to make a deposit.',
                  })
                  return
                }

                const userId = auth.currentUser.uid

                // Call PayFast create API
                const response = await fetch('/api/payfast/create', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    user_id: userId,
                    amount_zar: amountZAR,
                  }),
                })

                if (!response.ok) {
                  const error = await response.json()
                  throw new Error(error.error || 'Failed to create payment')
                }

                const data = await response.json()
                const { redirect_url } = data

                // Redirect to PayFast
                window.location.href = redirect_url
              } catch (error: any) {
                console.error('[PayFast Redirect] Failed:', error)
                const { pushNotification } = useNotificationStore.getState()
                pushNotification({
                  kind: 'payment_failed',
                  title: 'Payment setup failed',
                  body: error.message || 'Please try again.',
                })
              }
            }

            handlePayFastRedirect()
          } else {
            // Other deposit methods (ATM, agent, etc.) - keep existing behavior
            setOpenAmount(false)
            setAmountEntryPoint(undefined)
            console.log('Amount chosen', { amountZAR, amountUSDT, mode: amountMode })
          }
        } : undefined}
        onAmountSubmit={(amountMode === 'send' || flowType === 'transfer') ? handleAmountSubmit : undefined}
        initialAmount={
          amountMode === 'withdraw' && amountEntryPoint === 'withdrawKeypad' && withdrawFrom === 'ZAR' && withdrawAmountZAR > 0
            ? withdrawAmountZAR
            : amountMode === 'withdraw' && amountEntryPoint === 'withdrawKeypad' && withdrawAmountMZN > 0
              ? withdrawAmountMZN
              : amountMode === 'deposit' && amountEntryPoint === 'depositKeypad' && depositAmountMZN > 0
                ? depositAmountMZN
                : undefined
        }
      />
      <SendDetailsSheet
        open={openSendDetails}
        onClose={closeSendDetails}
        amountZAR={sendAmountZAR}
        amountUSDT={sendAmountUSDT}
        sendMethod={sendMethod}
        flowType={flowType}
        onBackToAmount={isPaySomeoneFlow ? () => {
          // Back chevron: return to keypad with same amount and mode
          setOpenSendDetails(false)
          // Reopen AmountSheet with preserved state
          setAmountMode('convert')
          setAmountEntryPoint('cashButton')
          setTimeout(() => setOpenAmount(true), 220)
        } : undefined}
        onPay={(payload) => {
          console.log('PAY', payload)
          setOpenSendDetails(false)
          
          // If coming from "Pay someone" flow, skip SuccessSheet and go to chat
          if (isPaySomeoneFlow) {
            setIsPaySomeoneFlow(false) // Reset flag
            // Skip SuccessSheet - go directly to Ama chat
            // This path is now handled by PaymentDetailsSheet, but keeping for other SendDetailsSheet uses
            setSendRecipient(payload.to)
            setTimeout(() => setOpenSendSuccess(true), 220)
          } else {
            // Regular send flow (not from $ button)
            setSendRecipient(payload.to)
            setTimeout(() => setOpenSendSuccess(true), 220)
          }
        }}
      />
      {/* PaymentDetailsSheet is now rendered in root layout */}
      <CardDepositAccountSheet
        onConfirm={({ amountZAR, accountId, accountLabel, source }) => {
          if (source === 'withdraw') {
            const from = accountId === 'mzn' ? 'MZN' : 'ZAR'
            setWithdrawFrom(from)
            setAmountMode('withdraw')
            setAmountEntryPoint('withdrawKeypad')
            setTimeout(() => setOpenAmount(true), 220)
            return
          }
          if (source === 'bank') {
            const country = accountId === 'mzn' ? 'MZ' : 'ZA'
            setBankTransferCountry(country)
            setDepositMethod('bank')
            void resolveAssignedDepositBank(country)
              .then((bank) => {
                setSelectedBank(bank)
                setTimeout(() => setOpenBankTransferDetails(true), 220)
              })
              .catch((error: any) => {
                alert(String(error?.message || 'Unable to open deposit details.'))
              })
            return
          }
          openAmaChatWithCardDepositScenario(amountZAR, accountLabel)
        }}
      />
      <SuccessSheet
        open={openSendSuccess}
        onClose={closeSendSuccess}
        amountZAR={sendMethod === 'wallet' ? formatUSDT(sendAmountUSDT) : `R ${sendAmountZAR.toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
        recipient={sendRecipient}
        flowType={flowType}
      />
      <SuccessSheet
        open={openDepositSuccess}
        onClose={() => setOpenDepositSuccess(false)}
        kind="deposit"
        amountZAR=""
        autoDownloadReceipt={false}
        suppressNotification
        headlineOverride="Proof attached"
        subtitleOverride="We'll match your deposit using the reference on your Proof."
        receiptOverride="You can close this and continue."
      />
      <SuccessSheet
        open={openDepositFailure}
        onClose={() => setOpenDepositFailure(false)}
        kind="deposit"
        amountZAR=""
        autoDownloadReceipt={false}
        suppressNotification
        variant="failure"
        headlineOverride="Attachment failed"
        subtitleOverride="Make sure you're uploading a PDF format, max 10 mb."
        receiptOverride="You can try again."
        buttonLabel="Upload Proof"
        onButtonClick={() => {
          if (isSubmittingDeposit) return
          depositProofInputRef.current?.click()
        }}
        isSubmitting={isSubmittingDeposit}
      />
      <input
        ref={depositProofInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          void handleDepositProofFile(file)
        }}
        style={{ display: 'none' }}
      />
      {/* Crypto deposit sheets removed - crypto wallet option no longer available */}
      {/* NOTE: FinancialInboxSheet is now accessible from Settings → Inbox */}
      <FinancialInboxSheet />
      <PayIntoSheet
        onConfirm={(destination) => {
          setConversionDestination(destination)
          setAmountMode('convert')
          setAmountEntryPoint('conversionKeypad')
          setTimeout(() => setOpenAmount(true), 220)
        }}
      />
      <NotificationsSheet />
      <CountrySelectSheet
        isOpen={openCountrySelect}
        onClose={() => setOpenCountrySelect(false)}
        onSelect={(countryCode) => {
          setBankTransferCountry(countryCode)
          setOpenCountrySelect(false)
          // For Mozambique and South Africa, show bank selection; for other countries, go directly to bank details
          if (countryCode === 'MZ' || countryCode === 'ZA') {
            setTimeout(() => setOpenBankSelect(true), 220)
          } else {
            setTimeout(() => setOpenBankTransferDetails(true), 220)
          }
        }}
      />
      <BankSelectSheet
        isOpen={openBankSelect}
        onClose={() => setOpenBankSelect(false)}
        onBack={() => {
          setOpenBankSelect(false)
          setTimeout(() => openBankDepositAccount(), 220)
        }}
        onSelect={(bank) => {
          setSelectedBank(bank)
          setOpenBankSelect(false)
          setTimeout(() => setOpenBankTransferDetails(true), 220)
        }}
        countryCode={bankTransferCountry}
      />
      <BankTransferDetailsSheet
        open={openBankTransferDetails}
        onClose={() => {
          setOpenBankTransferDetails(false)
          setDepositAmountMZN(0)
          setDepositAmountZAR(0)
        }}
        onBack={() => {
          setOpenBankTransferDetails(false)
          setTimeout(() => openBankDepositAccount(), 220)
        }}
        onAttachProof={handleDepositProofFile}
        isSubmitting={isSubmittingDeposit}
        countryCode={bankTransferCountry}
        bank={selectedBank}
      />
      <DepositChatSheet
        open={openDepositChat}
        onClose={() => {
          setOpenDepositChat(false)
          setDepositChatTxId(null)
          setDepositChatError(null)
          setDepositAmountMZN(0)
          setDepositAmountZAR(0) // Clear deposit amount when chat closes
        }}
        txId={depositChatTxId}
        error={depositChatError}
      />
      <AgentInboxSheet
        open={openAgentInbox}
        onClose={() => setOpenAgentInbox(false)}
      />
      <ProductivityHelperSheet
        isOpen={isProductivityHelperOpen}
        onClose={() => setIsProductivityHelperOpen(false)}
        onNextPage={() => {
          console.log('[ProductivityHelperSheet] Next page clicked')
        }}
      />
    </div>
  )
}


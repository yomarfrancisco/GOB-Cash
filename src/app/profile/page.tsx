'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { tx_createBankDepositRequest } from '@/lib/transactions/clientFunctions'
import { AGENT_UID, type BankDepositTransaction } from '@/types/transactions'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import AmountSheet from '@/components/AmountSheet'
import SendDetailsSheet from '@/components/SendDetailsSheet'
import SuccessSheet from '@/components/SuccessSheet'
import { ScanOverlay } from '@/components/ScanOverlay'
import { ScanQrSheet } from '@/components/ScanQrSheet'
import { formatUSDT } from '@/lib/money'
import { useActivityStore } from '@/store/activity'
import { useProfileEditSheet } from '@/store/useProfileEditSheet'
import { useTransactSheet } from '@/store/useTransactSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { useSupportSheet } from '@/store/useSupportSheet'
import { useLinkedAccountsSheet } from '@/store/useLinkedAccountsSheet'
import { CreditCard, WalletCards, Phone, LogOut, PiggyBank, Receipt, Edit3, Inbox, BanknoteArrowDown, SmartphoneNfc, Bell } from 'lucide-react'
import LockOverlay from '@/components/LockOverlay'
import Avatar from '@/components/Avatar'
import DepositCryptoWalletSheet, { type DepositCryptoWallet, getDepositCryptoWallets } from '@/components/DepositCryptoWalletSheet'
import CryptoDepositAddressSheet from '@/components/CryptoDepositAddressSheet'
import PaymentsSheet from '@/components/PaymentsSheet'
import FinancialInboxSheet from '@/components/Inbox/FinancialInboxSheet'
import { useFinancialInboxStore } from '@/state/financialInbox'
import NotificationsSheet from '@/components/notifications/NotificationsSheet'
import { useNotificationsStore } from '@/state/notifications'
import { useNotificationStore } from '@/store/notifications'
import { useAuthStore } from '@/store/auth'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { usePaymentDetailsSheet } from '@/store/usePaymentDetailsSheet'
import { useCardDepositAccountSheet } from '@/store/useCardDepositAccountSheet'
import { useCardDetailsSheet } from '@/store/useCardDetailsSheet'
import CardDepositAccountSheet from '@/components/CardDepositAccountSheet'
import { openAmaChatWithCardDepositScenario, openAmaChatWithAgentInduction } from '@/lib/cashDeposit/chatOrchestration'
import { useAgentOnboardingStore } from '@/state/agentOnboarding'
import { ChevronRight } from 'lucide-react'
import ProductivityHelperSheet from '@/components/ProductivityHelperSheet'
import { logout } from '@/lib/logout'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import { isRestrictedUser } from '@/lib/restrictions'
// Toggle flag to compare both scanner implementations
const USE_MODAL_SCANNER = false // Set to true to use sheet-based scanner, false for full-screen overlay

export default function ProfilePage() {
  const router = useRouter()
  const { isAuthed, authReady, openAuthEntry } = useAuthStore()
  const { hasCompletedAgentOnboarding } = useAgentOnboardingStore()
  
  // Redirect unauthenticated users to home (only after auth is ready to prevent race during hydration)
  useEffect(() => {
    if (authReady && !isAuthed) {
      router.replace('/')
    }
  }, [authReady, isAuthed, router])
  const activityCount = useActivityStore((s) => s.items.length)
  const { open: openProfileEdit } = useProfileEditSheet()
  const { setOnSelect, open } = useTransactSheet()
  const { profile, setProfile } = useUserProfileStore()
  const { open: openSupport } = useSupportSheet()
  const { open: openLinkedAccounts } = useLinkedAccountsSheet()
  const { openInbox, closeInbox, isInboxOpen } = useFinancialInboxStore()
  const { openNotifications } = useNotificationsStore()
  const { guardAuthed } = useRequireAuth()
  const { open: openPaymentDetails, close: closePaymentDetails } = usePaymentDetailsSheet()
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
  const [depositAmountZAR, setDepositAmountZAR] = useState(0) // Persist deposit amount through flow
  
  // Check if current user is agent
  const auth = getFirebaseAuth()
  const isAgent = auth.currentUser?.uid === AGENT_UID
  const currentUserId = auth.currentUser?.uid
  const isRestricted = isRestrictedUser(currentUserId)
  const [openAmount, setOpenAmount] = useState(false)
  const [openDirectPayment, setOpenDirectPayment] = useState(false)
  const [openSendDetails, setOpenSendDetails] = useState(false)
  const [openSendSuccess, setOpenSendSuccess] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [amountMode, setAmountMode] = useState<'deposit' | 'withdraw' | 'send' | 'convert'>('deposit')
  const [amountEntryPoint, setAmountEntryPoint] = useState<'helicopter' | 'cashButton' | 'cardDeposit' | 'depositKeypad' | undefined>(undefined)
  const [depositMethod, setDepositMethod] = useState<'bank' | 'card' | 'crypto' | 'atm' | 'agent' | null>(null)
  const [sendAmountZAR, setSendAmountZAR] = useState(0)
  const [sendAmountUSDT, setSendAmountUSDT] = useState(0)
  const [sendRecipient, setSendRecipient] = useState('')
  const [sendMethod, setSendMethod] = useState<'email' | 'wallet' | 'brics' | null>(null)
  const [flowType, setFlowType] = useState<'payment' | 'transfer'>('payment')
  const [isPaySomeoneFlow, setIsPaySomeoneFlow] = useState(false) // Track if coming from "Pay someone" button
  const [openDepositCryptoWallet, setOpenDepositCryptoWallet] = useState(false)
  const [selectedCryptoDepositWallet, setSelectedCryptoDepositWallet] = useState<DepositCryptoWallet | null>(null)
  const [showCryptoAddressSheet, setShowCryptoAddressSheet] = useState(false)
  const [isProductivityHelperOpen, setIsProductivityHelperOpen] = useState(false)
  const [openWithdrawCryptoAddress, setOpenWithdrawCryptoAddress] = useState(false)
  const [withdrawCryptoAmountUSDT, setWithdrawCryptoAmountUSDT] = useState(0)

  const openPaymentsSheet = useCallback(() => setOpenPayments(true), [])
  const closePaymentsSheet = useCallback(() => setOpenPayments(false), [])
  const openDepositSheet = useCallback(() => setOpenDeposit(true), [])
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
  const closeDepositCryptoWallet = useCallback(() => {
    setOpenDepositCryptoWallet(false)
  }, [])
  const handleSelectCryptoDepositWallet = useCallback((wallet: DepositCryptoWallet) => {
    setSelectedCryptoDepositWallet(wallet)
    setOpenDepositCryptoWallet(false)
    setTimeout(() => setShowCryptoAddressSheet(true), 220)
  }, [])
  const closeCryptoAddressSheet = useCallback(() => {
    setShowCryptoAddressSheet(false)
    setSelectedCryptoDepositWallet(null)
  }, [])

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
      // Calculate USDT amount (using same rate as AmountSheet: 18.1)
      const fxRateZARperUSDT = 18.1
      setSendAmountUSDT(amountZAR / fxRateZARperUSDT)
      setOpenAmount(false)
      
      setTimeout(() => setOpenSendDetails(true), 220)
    }
  }, [amountMode, flowType])

  // Register onSelect handler for global Transact sheet
  useEffect(() => {
    setOnSelect((action) => {
      if (action === 'deposit') {
        setTimeout(() => setOpenDeposit(true), 220)
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
  }, [setOnSelect])
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
                  // NOTE: $ button opens cash-to-crypto keypad with dual "Request" / "Pay someone" buttons
                  guardAuthed(() => {
                    setAmountMode('convert')
                    setAmountEntryPoint('cashButton')
                    setTimeout(() => setOpenAmount(true), 220)
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
              {/* Avatar + handle (full-name and meta rows removed) */}
              <div className="profile-header">
                <Avatar
                  name={profile.fullName}
                  email={profile.email}
                  avatarUrl={profile.avatarUrl}
                  size={72}
                  rounded={24}
                  className="profile-avatar"
                />
                <h1 className="profile-name">
                  {profile.userHandle && profile.userHandle !== '@' && profile.userHandle.length > 1
                    ? profile.userHandle
                    : 'Loading...'}
                </h1>
              </div>

              {/* Stats + network pill */}
              <div className="profile-stats-card">
                <div className="stats-row">
                  {(() => {
                    const rating = typeof profile?.rating === "number" ? profile.rating : 0;
                    const ratingCount = typeof profile?.ratingCount === "number" ? profile.ratingCount : 0;
                    const sponsors = typeof profile?.sponsors === "number" ? profile.sponsors : 0;
                    const sponsoring = typeof profile?.sponsoring === "number" ? profile.sponsoring : 0;
                    
                    return (
                      <>
                        <div className="stat">
                          <div className="stat-top">
                            <span className="stat-value">
                              {ratingCount > 0 ? rating.toFixed(1) : "0.0"}
                            </span>
                            <Image src="/assets/profile/star.svg" alt="" width={12} height={12} />
                          </div>
                          <div className="stat-sub">
                            ({ratingCount > 0 ? ratingCount.toLocaleString() : "0"})
                          </div>
                        </div>
                        <div className="stat-divider" />
                        <div className="stat">
                          <div className="stat-value">{sponsors.toLocaleString()}</div>
                          <div className="stat-sub">Backers</div>
                        </div>
                        <div className="stat-divider" />
                        <div className="stat">
                          <div className="stat-value">{sponsoring.toLocaleString()}</div>
                          <div className="stat-sub">Backing</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="network-pill">
                  <div className="network-track">
                    <div className="network-fill" />
                  </div>
                  <div className="network-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setIsProductivityHelperOpen(true)}>
                    <span>Productivity</span>
                    <ChevronRight size={16} strokeWidth={2} style={{ color: 'rgba(0, 0, 0, 0.4)' }} />
                  </div>
                </div>
              </div>

              {/* Social row */}
              <div className="profile-social">
                {profile.email ? (
                  <a
                    href={`mailto:${profile.email}`}
                    style={{ display: 'inline-flex', alignItems: 'center' }}
                    aria-label="Email"
                  >
                    <Image src="/assets/profile/email_outlined.svg" alt="Email" width={20} height={20} />
                  </a>
                ) : (
                  <Image
                    src="/assets/profile/email_outlined.svg"
                    alt="Email"
                    width={20}
                    height={20}
                    style={{ opacity: 0.3, pointerEvents: 'none' }}
                  />
                )}
                <Image src="/assets/profile/dot.svg" alt="" width={3} height={3} />
                {profile.instagramUrl ? (
                  <a
                    href={profile.instagramUrl.startsWith('http') ? profile.instagramUrl : `https://instagram.com/${profile.instagramUrl.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center' }}
                    aria-label="Instagram"
                  >
                    <Image src="/assets/profile/instagram.svg" alt="Instagram" width={20} height={20} />
                  </a>
                ) : (
                  <Image
                    src="/assets/profile/instagram.svg"
                    alt="Instagram"
                    width={20}
                    height={20}
                    style={{ opacity: 0.3, pointerEvents: 'none' }}
                  />
                )}
                <Image src="/assets/profile/dot.svg" alt="" width={3} height={3} />
                {profile.linkedinUrl ? (
                  <a
                    href={profile.linkedinUrl.startsWith('http') ? profile.linkedinUrl : `https://linkedin.com/in/${profile.linkedinUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center' }}
                    aria-label="LinkedIn"
                  >
                    <Image src="/assets/profile/linkedin.svg" alt="LinkedIn" width={20} height={20} />
                  </a>
                ) : (
                  <Image
                    src="/assets/profile/linkedin.svg"
                    alt="LinkedIn"
                    width={20}
                    height={20}
                    style={{ opacity: 0.3, pointerEvents: 'none' }}
                  />
                )}
              </div>

              {/* Buttons */}
              <div className="profile-actions">
                {/* Cash-in/out button with lock overlay */}
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
                  style={{ 
                    position: 'relative',
                    ...(isRestricted ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                  }}
                  aria-disabled={isRestricted}
                >
                  Cash-in / out
                  <LockOverlay show={isRestricted} />
                </button>
                {/* Inbox button with lock overlay */}
                <button
                  className="btn profile-inbox"
                  disabled={isRestricted}
                  onClick={() => {
                    if (isRestricted) return
                    guardAuthed(() => {
                      openInbox()
                    })
                  }}
                  style={{ 
                    position: 'relative',
                    ...(isRestricted ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                  }}
                  aria-disabled={isRestricted}
                >
                  Inbox
                  <LockOverlay show={isRestricted} />
                </button>
              </div>

              {/* Invite friends section */}
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

              {/* Settings section */}
              <div className="profile-settings">
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
          setTimeout(() => setOpenDeposit(true), 220)
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
            setTimeout(() => setOpenCountrySelect(true), 220)
          } else if (method === 'crypto') {
            setDepositMethod('crypto')
            // Skip DepositCryptoWalletSheet and go directly to USDT SA wallet
            const { profile } = useUserProfileStore.getState()
            const wallets = getDepositCryptoWallets({
              usdtSaAddress: profile.usdtSaAddress,
              usdtMznAddress: profile.usdtMznAddress,
              ethAddress: profile.ethAddress,
              btcAddress: profile.btcAddress,
            })
            // Select USDT SA wallet (first wallet in the list)
            const usdtSaWallet = wallets.find(w => w.key === 'usdt_sa') || wallets[0]
            setSelectedCryptoDepositWallet(usdtSaWallet)
            setTimeout(() => setShowCryptoAddressSheet(true), 220)
          } else if (method === 'card') {
            setDepositMethod('card')
            setAmountMode('deposit')
            setAmountEntryPoint('cardDeposit')
            setTimeout(() => setOpenAmount(true), 220)
          }
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
          } else {
            // Other methods (bank, etc.) - existing behavior
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
          } else if (amountMode === 'deposit' && amountEntryPoint === 'depositKeypad') {
            // Deposit keypad: close and clear amount
            setOpenAmount(false)
            setAmountEntryPoint(undefined)
            setDepositAmountZAR(0) // Clear amount on close
          } else {
            setOpenAmount(false)
            setAmountEntryPoint(undefined) // Reset entry point when closing
          }
        }}
        mode={amountMode}
        flowType={flowType}
        balanceZAR={200}
        fxRateZARperUSDT={18.1}
        ctaLabel={amountMode === 'deposit' && amountEntryPoint === 'cardDeposit' && depositMethod === 'card' ? 'Next' : amountMode === 'deposit' ? 'Transfer USDT' : amountMode === 'send' ? (flowType === 'transfer' ? 'Transfer' : 'Send') : 'Continue'}
        showDualButtons={amountMode === 'convert' && !amountEntryPoint} // Legacy support: only if entryPoint not set
        entryPoint={amountEntryPoint}
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
        onCashSubmit={amountMode === 'convert' ? ({ amountZAR }) => {
          // Cash convert flow ("Request" button): open PaymentDetailsSheet
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => {
            openPaymentDetails('request', amountZAR)
          }, 220)
        } : amountMode === 'deposit' && amountEntryPoint === 'depositKeypad' ? ({ amountZAR, amountUSDT }) => {
          // Deposit keypad: "Withdraw" button - store amount and open withdraw sheet
          if (amountUSDT) {
            setWithdrawCryptoAmountUSDT(amountUSDT)
          }
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => {
            openWithdrawSheet()
          }, 220)
        } : undefined}
        onCardSubmit={amountMode === 'convert' ? ({ amountZAR, amountUSDT }) => {
          // Card payment flow ("Pay someone"): open PaymentDetailsSheet
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => {
            openPaymentDetails('pay', amountZAR)
          }, 220)
        } : amountMode === 'deposit' && amountEntryPoint === 'depositKeypad' ? ({ amountZAR }) => {
          // Deposit keypad: "Deposit" button - store amount and proceed to DepositSheet
          setDepositAmountZAR(amountZAR)
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => {
            openDepositSheet()
          }, 220)
        } : undefined}
        onSubmit={amountMode !== 'send' && amountMode !== 'convert' ? ({ amountZAR, amountUSDT }) => {
          // Card deposit flow: branch based on linked accounts
          if (amountMode === 'deposit' && amountEntryPoint === 'cardDeposit' && depositMethod === 'card') {
            setOpenAmount(false)
            setAmountEntryPoint(undefined)
            
            // TODO: Replace with real check from wallet store
            const { linkedCards } = useUserProfileStore.getState().profile
            const hasLinkedAccounts = linkedCards.length > 0
            
            if (hasLinkedAccounts) {
              // User has linked cards, go directly to account selection
              setTimeout(() => {
                useCardDepositAccountSheet.getState().open(amountZAR)
              }, 220)
            } else {
              // User needs to link a card first
              // Store amount for after card linking (without opening the sheet)
              useCardDepositAccountSheet.getState().setAmount(amountZAR)
              // Open CardDetailsSheet directly with depositCard origin (skip LinkedAccountsSheet)
              setTimeout(() => {
                useCardDetailsSheet.getState().open('create', null, 'depositCard')
              }, 220)
            }
          } else {
            // Other deposit methods (ATM, agent, etc.) - keep existing behavior
            setOpenAmount(false)
            setAmountEntryPoint(undefined)
            console.log('Amount chosen', { amountZAR, amountUSDT, mode: amountMode })
          }
        } : undefined}
        onAmountSubmit={(amountMode === 'send' || flowType === 'transfer') ? handleAmountSubmit : undefined}
        initialAmount={amountMode === 'deposit' && amountEntryPoint === 'depositKeypad' && depositAmountZAR > 0 ? depositAmountZAR : undefined}
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
        onConfirm={({ amountZAR, accountId, accountLabel }) => {
          // Close sheet and open Ama chat
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
      <DepositCryptoWalletSheet
        open={openDepositCryptoWallet}
        onClose={closeDepositCryptoWallet}
        onSelectCryptoDepositWallet={handleSelectCryptoDepositWallet}
      />
      {selectedCryptoDepositWallet && (
        <CryptoDepositAddressSheet
          open={showCryptoAddressSheet}
          onClose={() => {
            setShowCryptoAddressSheet(false)
            // If opened from deposit flow, return to Deposit method sheet
            if (depositMethod === 'crypto') {
              setTimeout(() => {
                setOpenDeposit(true)
              }, 220)
            } else {
              // For other flows, just close (existing behavior)
              closeCryptoAddressSheet()
            }
          }}
          wallet={selectedCryptoDepositWallet}
        />
      )}
      {/* NOTE: FinancialInboxSheet is now accessible from Settings → Inbox */}
      <FinancialInboxSheet />
      <NotificationsSheet />
      <CountrySelectSheet
        isOpen={openCountrySelect}
        onClose={() => setOpenCountrySelect(false)}
        onBack={() => {
          setOpenCountrySelect(false)
          setTimeout(() => setOpenDeposit(true), 220)
        }}
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
          setTimeout(() => setOpenCountrySelect(true), 220)
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
          // Reset bank selection when closing
          setSelectedBank(undefined)
          setDepositAmountZAR(0) // Clear deposit amount when closing
        }}
        onBack={() => {
          setOpenBankTransferDetails(false)
          setTimeout(() => setOpenBankSelect(true), 220)
        }}
        onNext={async () => {
          setIsSubmittingDeposit(true)
          setDepositChatError(null)
          
          try {
            const auth = getFirebaseAuth()
            const user = auth.currentUser
            if (!user) {
              setIsSubmittingDeposit(false)
              alert('You must be signed in to create a deposit. Please sign in and try again.')
              return
            }

            if (depositAmountZAR <= 0) {
              setIsSubmittingDeposit(false)
              alert('Please enter a valid deposit amount.')
              return
            }

            // Close bank details sheet immediately
            setOpenBankTransferDetails(false)
            
            // Open chat sheet immediately with txId: null (shows typing indicator)
            setDepositChatTxId(null)
            setOpenDepositChat(true)

            // Get bank config for reference
            const { DEPOSIT_BANK_ACCOUNTS, MOZAMBIQUE_BANK_ACCOUNTS, SOUTH_AFRICA_BANK_ACCOUNTS, COUNTRY_SELECT_OPTIONS } = await import('@/config/depositBankAccounts')
            let config
            if (bankTransferCountry === 'MZ' && selectedBank && (selectedBank === 'BCI' || selectedBank === 'ABSA')) {
              config = MOZAMBIQUE_BANK_ACCOUNTS[selectedBank]
            } else if (bankTransferCountry === 'ZA' && selectedBank === 'FNB') {
              config = SOUTH_AFRICA_BANK_ACCOUNTS[selectedBank]
            } else {
              config = DEPOSIT_BANK_ACCOUNTS[bankTransferCountry]
            }
            const countryName = COUNTRY_SELECT_OPTIONS.find(c => c.code === bankTransferCountry)?.name || ''

            // Create transaction async (don't block sheet opening)
            const { txId } = await tx_createBankDepositRequest({
              receiverId: AGENT_UID,
              amountZar: depositAmountZAR,
              bankCountry: bankTransferCountry,
              bankId: selectedBank || (bankTransferCountry === 'MZ' ? 'BCI' : 'FNB'),
              depositCurrency: bankTransferCountry === 'MZ' ? 'MZN' : 'ZAR',
              depositReference: config.referencePrefix,
              chatStep: 'INTRO_CONFIRM_INTENT',
              depositDetails: {
                amount: depositAmountZAR,
                currency: bankTransferCountry === 'MZ' ? 'MZN' : 'ZAR',
                country: countryName,
                bankName: config.bankName,
                reference: config.referencePrefix,
              },
            })

            // Update txId when transaction is created
            setDepositChatTxId(txId)
          } catch (error: any) {
            setIsSubmittingDeposit(false)
            console.error('[Deposit] Failed to create transaction:', error)
            
            // Show error in chat sheet
            const errorMessage = error?.message || 'Unknown error'
            setDepositChatError('Failed to create transaction. Please try again.')
            
            // Close chat sheet on error (user can retry from bank details)
            setOpenDepositChat(false)
            setDepositChatTxId(null)
            
            // Also show alert for immediate feedback
            if (errorMessage.includes('CORS') || errorMessage.includes('network') || errorMessage.includes('fetch')) {
              alert('We couldn\'t start the deposit chat. Please check your connection and try again.')
            } else {
              alert('We couldn\'t start the deposit chat. Please try again.')
            }
          }
        }}
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
          // Placeholder for page 2 navigation
          console.log('[ProductivityHelperSheet] Next page clicked')
        }}
      />
    </div>
  )
}


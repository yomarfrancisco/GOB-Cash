'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import TopGlassBar from '@/components/TopGlassBar'
import BottomGlassBar from '@/components/BottomGlassBar'
import DepositSheet from '@/components/DepositSheet'
import WithdrawSheet from '@/components/WithdrawSheet'
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
import { CreditCard, WalletCards, Phone, LogOut, PiggyBank, Receipt, Edit3, Inbox } from 'lucide-react'
import Avatar from '@/components/Avatar'
import DepositCryptoWalletSheet, { type DepositCryptoWallet } from '@/components/DepositCryptoWalletSheet'
import CryptoDepositAddressSheet from '@/components/CryptoDepositAddressSheet'
import PaymentsSheet from '@/components/PaymentsSheet'
import FinancialInboxSheet from '@/components/Inbox/FinancialInboxSheet'
import { useFinancialInboxStore } from '@/state/financialInbox'
import { useAuthStore } from '@/store/auth'
import { useRequireAuth } from '@/hooks/useRequireAuth'

// Toggle flag to compare both scanner implementations
const USE_MODAL_SCANNER = false // Set to true to use sheet-based scanner, false for full-screen overlay

export default function ProfilePage() {
  const router = useRouter()
  const { isAuthed } = useAuthStore()
  
  // Redirect unauthenticated users to home
  useEffect(() => {
    if (!isAuthed) {
      router.replace('/')
    }
  }, [isAuthed, router])
  const activityCount = useActivityStore((s) => s.items.length)
  const { open: openProfileEdit } = useProfileEditSheet()
  const { setOnSelect, open } = useTransactSheet()
  const { profile } = useUserProfileStore()
  const { open: openSupport } = useSupportSheet()
  const { openInbox, closeInbox, isInboxOpen } = useFinancialInboxStore()
  const { guardAuthed } = useRequireAuth()
  const [openPayments, setOpenPayments] = useState(false)
  const [openDeposit, setOpenDeposit] = useState(false)
  const [openWithdraw, setOpenWithdraw] = useState(false)
  const [openAmount, setOpenAmount] = useState(false)
  const [openDirectPayment, setOpenDirectPayment] = useState(false)
  const [openSendDetails, setOpenSendDetails] = useState(false)
  const [openSendSuccess, setOpenSendSuccess] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [amountMode, setAmountMode] = useState<'deposit' | 'withdraw' | 'send' | 'convert'>('deposit')
  const [amountEntryPoint, setAmountEntryPoint] = useState<'helicopter' | 'cashButton' | undefined>(undefined)
  const [sendAmountZAR, setSendAmountZAR] = useState(0)
  const [sendAmountUSDT, setSendAmountUSDT] = useState(0)
  const [sendRecipient, setSendRecipient] = useState('')
  const [sendMethod, setSendMethod] = useState<'email' | 'wallet' | 'brics' | null>(null)
  const [flowType, setFlowType] = useState<'payment' | 'transfer'>('payment')
  const [isPaySomeoneFlow, setIsPaySomeoneFlow] = useState(false) // Track if coming from "Pay someone" button
  const [openDepositCryptoWallet, setOpenDepositCryptoWallet] = useState(false)
  const [selectedCryptoDepositWallet, setSelectedCryptoDepositWallet] = useState<DepositCryptoWallet | null>(null)
  const [showCryptoAddressSheet, setShowCryptoAddressSheet] = useState(false)

  const openPaymentsSheet = useCallback(() => setOpenPayments(true), [])
  const closePaymentsSheet = useCallback(() => setOpenPayments(false), [])
  const openDepositSheet = useCallback(() => setOpenDeposit(true), [])
  const openDirectPaymentSheet = useCallback(() => setOpenDirectPayment(true), [])
  const closeDirectPayment = useCallback(() => setOpenDirectPayment(false), [])
  const openWithdrawSheet = useCallback(() => setOpenWithdraw(true), [])
  const closeDeposit = useCallback(() => setOpenDeposit(false), [])
  const closeWithdraw = useCallback(() => setOpenWithdraw(false), [])
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

  const handleDirectSelect = useCallback((method: 'bank' | 'card' | 'crypto' | 'email' | 'wallet' | 'brics') => {
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
    <div className="app-shell">
      <div className="mobile-frame">
        <div className="dashboard-container">
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

          {/* Scrollable content */}
          <div className="scroll-content">
            <div className="content" style={{ background: '#fff' }}>
              {/* Avatar + name + handle */}
              <div className="profile-header">
                <Avatar
                  name={profile.fullName}
                  email={profile.email}
                  avatarUrl={profile.avatarUrl}
                  size={96}
                  rounded={24}
                  className="profile-avatar"
                />
                <h1 className="profile-name">{profile.fullName}</h1>
                <div className="profile-handle">{profile.userHandle}</div>

                {/* Bio */}
                <p className="profile-bio">
                  {profile.description || 'Member of the Crypto Stokvel community. Saving toward shared goals with trusted groups.'}
                </p>

                {/* Meta row */}
                <div className="profile-meta">
                  <div className="meta-item">
                    <Image src="/assets/profile/location-pin.svg" alt="" width={12} height={12} />
                    <span>South Africa</span>
                  </div>
                  <div className="meta-dot" />
                  <div className="meta-item">
                    <Image src="/assets/profile/calendar_month.svg" alt="" width={12} height={12} />
                    <span>Joined Feb 2024</span>
                  </div>
                </div>
              </div>

              {/* Stats + network pill */}
              <div className="profile-stats-card">
                <div className="stats-row">
                  <div className="stat">
                    <div className="stat-top">
                      <span className="stat-value">4.8</span>
                      <Image src="/assets/profile/star.svg" alt="" width={12} height={12} />
                    </div>
                    <div className="stat-sub">(11.5K)</div>
                  </div>
                  <div className="stat-divider" />
                  <div className="stat">
                    <div className="stat-value">8,122</div>
                    <div className="stat-sub">Clients</div>
                  </div>
                  <div className="stat-divider" />
                  <div className="stat">
                    <div className="stat-value">556</div>
                    <div className="stat-sub">Trips</div>
                  </div>
                </div>
                <div className="network-pill">
                  <div className="network-track">
                    <div className="network-fill" />
                  </div>
                  <div className="network-label">Insurance</div>
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
                <button 
                  className="btn profile-edit" 
                  onClick={() => {
                    guardAuthed(() => {
                      openDepositSheet()
                    })
                  }}
                >
                  Top up
                </button>
                <button
                  className="btn profile-inbox"
                  onClick={() => {
                    guardAuthed(() => {
                      openWithdrawSheet()
                    })
                  }}
                >
                  Cash out
                </button>
              </div>

              {/* Settings section */}
              <div className="profile-settings">
                <h2 className="profile-settings-heading">Settings</h2>
                <div className="profile-settings-card">
                  <button
                    className="profile-settings-row"
                    onClick={() => {
                      guardAuthed(() => {
                        router.push('/activity')
                      })
                    }}
                    type="button"
                  >
                    <div className="profile-settings-left">
                      <div className="profile-settings-icon">
                        <Receipt size={22} strokeWidth={2} style={{ color: '#111' }} />
                      </div>
                      <span className="profile-settings-label">Transactions</span>
                    </div>
                    <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
                  </button>
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
                        openInbox()
                      })
                    }}
                    type="button"
                  >
                    <div className="profile-settings-left">
                      <div className="profile-settings-icon">
                        <Inbox size={22} strokeWidth={2} style={{ color: '#111' }} />
                      </div>
                      <span className="profile-settings-label">Inbox</span>
                    </div>
                    <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
                  </button>
                  <button
                    className="profile-settings-row"
                    onClick={() => {
                      guardAuthed(() => {
                        console.log('Linked bank accounts')
                      })
                    }}
                    type="button"
                  >
                    <div className="profile-settings-left">
                      <div className="profile-settings-icon">
                        <PiggyBank size={22} strokeWidth={2} style={{ color: '#111' }} />
                      </div>
                      <span className="profile-settings-label">Linked bank accounts</span>
                    </div>
                    <Image src="/assets/next_ui.svg" alt="" width={18} height={18} style={{ opacity: 0.4 }} />
                  </button>
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
                  <button
                    className="profile-settings-row"
                    onClick={() => {
                      // Clear session/splash flag so intro shows again
                      try {
                        sessionStorage.removeItem('gob_splash_shown')
                      } catch {
                        // Ignore sessionStorage errors
                      }

                      // Clear profile state (optional - depends on requirements)
                      // For now, we'll keep profile data but could reset if needed
                      // useUserProfileStore.getState().reset()

                      // Navigate to home
                      router.push('/')
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
        onSelect={(method) => {
          setOpenDeposit(false)
          if (method === 'crypto') {
            setTimeout(() => setOpenDepositCryptoWallet(true), 220)
          } else {
            setAmountMode('deposit')
            setTimeout(() => setOpenAmount(true), 220)
          }
        }}
      />
      <WithdrawSheet
        open={openWithdraw}
        onClose={closeWithdraw}
        onSelect={(method) => {
          setOpenWithdraw(false)
          setAmountMode('withdraw')
          setTimeout(() => setOpenAmount(true), 220)
        }}
      />
      <AmountSheet
        open={openAmount}
        onClose={() => {
          setOpenAmount(false)
          setAmountEntryPoint(undefined) // Reset entry point when closing
        }}
        mode={amountMode}
        flowType={flowType}
        balanceZAR={200}
        fxRateZARperUSDT={18.1}
        ctaLabel={amountMode === 'deposit' ? 'Transfer USDT' : amountMode === 'send' ? (flowType === 'transfer' ? 'Transfer' : 'Send') : 'Continue'}
        showDualButtons={amountMode === 'convert' && !amountEntryPoint} // Legacy support: only if entryPoint not set
        entryPoint={amountEntryPoint}
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
          // Cash convert flow ("Request" button): for now, just log (map popup not implemented on profile)
          console.log('Cash convert requested', { amountZAR })
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          // TODO: Implement map popup flow on profile page if needed
        } : undefined}
        onCardSubmit={amountMode === 'convert' ? ({ amountZAR, amountUSDT }) => {
          // Card payment flow ("Pay someone"): close keypad, then show SendDetailsSheet
          setSendAmountZAR(amountZAR)
          setSendAmountUSDT(amountUSDT || 0)
          setSendMethod(null) // Default to email/phone input for "Pay someone"
          setIsPaySomeoneFlow(true) // Mark as "Pay someone" flow
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          // Open SendDetailsSheet
          setTimeout(() => setOpenSendDetails(true), 220)
        } : undefined}
        onSubmit={amountMode !== 'send' && amountMode !== 'convert' ? ({ amountZAR, amountUSDT }) => {
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          console.log('Amount chosen', { amountZAR, amountUSDT, mode: amountMode })
        } : undefined}
        onAmountSubmit={(amountMode === 'send' || flowType === 'transfer') ? handleAmountSubmit : undefined}
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
          
          // If coming from "Pay someone" flow, use card success sheet
          if (isPaySomeoneFlow) {
            setIsPaySomeoneFlow(false) // Reset flag
            // Note: Profile page doesn't have card success sheet yet, so use regular success
            // TODO: Add card success sheet to profile page if needed
            setSendRecipient(payload.to)
            setTimeout(() => setOpenSendSuccess(true), 220)
          } else {
            // Regular send flow
            setSendRecipient(payload.to)
            setTimeout(() => setOpenSendSuccess(true), 220)
          }
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
          onClose={closeCryptoAddressSheet}
          wallet={selectedCryptoDepositWallet}
        />
      )}
      {/* NOTE: FinancialInboxSheet is now accessible from Settings → Inbox */}
      <FinancialInboxSheet />
    </div>
  )
}


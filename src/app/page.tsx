'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import CardStack, { type CardStackHandle } from '@/components/CardStack'
import TopGlassBar from '@/components/TopGlassBar'
import BottomGlassBar from '@/components/BottomGlassBar'
import DepositSheet from '@/components/DepositSheet'
import WithdrawSheet from '@/components/WithdrawSheet'
import { useTransactSheet } from '@/store/useTransactSheet'
import AmountSheet from '@/components/AmountSheet'
import SendDetailsSheet from '@/components/SendDetailsSheet'
import SuccessSheet from '@/components/SuccessSheet'
import BankTransferDetailsSheet from '@/components/BankTransferDetailsSheet'
import { formatUSDT } from '@/lib/money'
import { useWalletAlloc } from '@/state/walletAlloc'
import { useAiActionCycle } from '@/lib/animations/useAiActionCycle'
import { formatZAR } from '@/lib/formatCurrency'
import { initPortfolioFromAlloc } from '@/lib/portfolio/initPortfolio'
import ConvertCashSection from '@/components/ConvertCashSection'
import BranchManagerFooter from '@/components/BranchManagerFooter'
import AgentListSheet from '@/components/AgentListSheet'
import { useWalletMode } from '@/state/walletMode'
import { ScanOverlay } from '@/components/ScanOverlay'
import { ScanQrSheet } from '@/components/ScanQrSheet'
import WalletHelperSheet from '@/components/WalletHelperSheet'
import MapHelperSheet from '@/components/MapHelperSheet'
import InternalTransferSheet from '@/components/InternalTransferSheet'
import DepositCryptoWalletSheet, { type DepositCryptoWallet } from '@/components/DepositCryptoWalletSheet'
import CryptoDepositAddressSheet from '@/components/CryptoDepositAddressSheet'
import { useNotificationStore } from '@/store/notifications'
import { startDemoNotificationEngine, stopDemoNotificationEngine } from '@/lib/demo/demoNotificationEngine'
import { useAuthStore } from '@/store/auth'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { getCardDefinition } from '@/lib/cards/cardDefinitions'
import CashMapPopup from '@/components/CashMapPopup'
import ConvertNotificationBanner from '@/components/ConvertNotificationBanner'
import TotalChangeBadge from '@/components/TotalChangeBadge'

// Toggle flag to compare both scanner implementations
const USE_MODAL_SCANNER = false // Set to true to use sheet-based scanner, false for full-screen overlay

export default function Home() {
  const [topCardType, setTopCardType] = useState<'pepe' | 'savings' | 'yield' | 'mzn' | 'btc'>('savings')
  const [isHelperOpen, setIsHelperOpen] = useState(false)
  const [helperWalletKey, setHelperWalletKey] = useState<'pepe' | 'savings' | 'yield' | 'mzn' | 'btc' | null>(null)
  const [isMapHelperOpen, setIsMapHelperOpen] = useState(false)
  const cardStackRef = useRef<CardStackHandle>(null)
  const { setOnSelect, open } = useTransactSheet()
  const { guardAuthed, isAuthed } = useRequireAuth()

  // Debug: verify card and map widths match - instrument parent chain
  useEffect(() => {
    const cardShells = document.querySelectorAll('.sectionShell')
    const card = cardShells[0]?.querySelector('.stack') as HTMLElement | null
    const mapCard = cardShells[1]?.querySelector('[id="mapbox-container"]')?.parentElement as HTMLElement | null
    
    if (card && mapCard) {
      const mapParent = mapCard.parentElement as HTMLElement | null
      const mapGrandparent = mapParent?.parentElement as HTMLElement | null
      
      const cardWidth = card.getBoundingClientRect().width
      const mapWidth = mapCard.getBoundingClientRect().width
      
      console.log('CARD width:', cardWidth)
      console.log('MAP  width:', mapWidth)
      console.log('MAP parent width:', mapParent?.getBoundingClientRect().width)
      console.log('MAP grandparent (.sectionShell?) width:', mapGrandparent?.getBoundingClientRect().width)
      
      if (Math.abs(cardWidth - mapWidth) > 1) {
        console.warn('⚠️ Width mismatch! Card vs Map')
      } else {
        console.log('✅ Widths match!')
      }
    }
  }, [])
  const [openDeposit, setOpenDeposit] = useState(false)
  const [openWithdraw, setOpenWithdraw] = useState(false)
  const [openAmount, setOpenAmount] = useState(false)
  const [openDirectPayment, setOpenDirectPayment] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [openSendDetails, setOpenSendDetails] = useState(false)
  const [openSendSuccess, setOpenSendSuccess] = useState(false)
  const [openDepositSuccess, setOpenDepositSuccess] = useState(false)
  const [openCardSuccess, setOpenCardSuccess] = useState(false)
  const [openBankTransferDetails, setOpenBankTransferDetails] = useState(false)
  const [amountMode, setAmountMode] = useState<'deposit' | 'withdraw' | 'send' | 'depositCard' | 'convert'>('deposit')
  const [amountEntryPoint, setAmountEntryPoint] = useState<'helicopter' | 'cashButton' | undefined>(undefined)
  const [sendAmountZAR, setSendAmountZAR] = useState(0)
  const [sendAmountUSDT, setSendAmountUSDT] = useState(0)
  const [depositAmountUSDT, setDepositAmountUSDT] = useState(0)
  const [sendRecipient, setSendRecipient] = useState('')
  const [sendMethod, setSendMethod] = useState<'email' | 'wallet' | 'brics' | null>(null)
  const [flowType, setFlowType] = useState<'payment' | 'transfer'>('payment')
  const [depositAmountZAR, setDepositAmountZAR] = useState(0)
  const [isAgentSheetOpen, setIsAgentSheetOpen] = useState(false)
  const [openInternalTransfer, setOpenInternalTransfer] = useState(false)
  const [transferFromWalletId, setTransferFromWalletId] = useState<'savings' | 'pepe' | 'yield' | 'mzn' | 'btc'>('savings')
  const [transferToWalletId, setTransferToWalletId] = useState<'savings' | 'pepe' | 'yield' | 'mzn' | 'btc'>('pepe')
  const [openDepositCryptoWallet, setOpenDepositCryptoWallet] = useState(false)
  const [selectedCryptoDepositWallet, setSelectedCryptoDepositWallet] = useState<DepositCryptoWallet | null>(null)
  const [showCryptoAddressSheet, setShowCryptoAddressSheet] = useState(false)
  // Convert cash flow state
  const [convertNotificationState, setConvertNotificationState] = useState<{
    type: 'request_sent' | 'request_accepted'
    amount: number
    handle: string
    agentHandle?: string
  } | null>(null)
  const [isMapOpen, setIsMapOpen] = useState(false)
  const [isAgentCardVisible, setIsAgentCardVisible] = useState(false)
  const [convertAmount, setConvertAmount] = useState(0)

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
        // Map topCardType to walletId for default FROM wallet
        const cardTypeToWalletId: Record<'pepe' | 'savings' | 'yield' | 'mzn' | 'btc', 'savings' | 'pepe' | 'yield' | 'mzn' | 'btc'> = {
          savings: 'savings',
          pepe: 'pepe',
          yield: 'yield',
          mzn: 'mzn',
          btc: 'btc',
        }
        setTransferFromWalletId(cardTypeToWalletId[topCardType])
        setTimeout(() => setOpenInternalTransfer(true), 220)
      }
    })
    
    return () => {
      setOnSelect(null) // Cleanup on unmount
    }
  }, [setOnSelect])
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
  const closeSendDetails = useCallback(() => setOpenSendDetails(false), [])
  const closeSendSuccess = useCallback(() => {
    setOpenSendSuccess(false)
    setSendRecipient('')
    setSendAmountZAR(0)
    setSendAmountUSDT(0)
    setFlowType('payment') // Reset to default
  }, [])
  const closeDepositSuccess = useCallback(() => {
    setOpenDepositSuccess(false)
    setDepositAmountZAR(0)
  }, [])
  const closeBankTransferDetails = useCallback(() => {
    setOpenBankTransferDetails(false)
  }, [])
  const closeInternalTransfer = useCallback(() => {
    setOpenInternalTransfer(false)
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
  const handleTransferNext = useCallback((fromWalletId: 'savings' | 'pepe' | 'yield' | 'mzn' | 'btc', toWalletId: 'savings' | 'pepe' | 'yield' | 'mzn' | 'btc') => {
    setTransferFromWalletId(fromWalletId)
    setTransferToWalletId(toWalletId)
    setOpenInternalTransfer(false)
    setTimeout(() => setOpenAmount(true), 220)
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
      
      // For transfers, skip SendDetailsSheet and go directly to success
      if (flowType === 'transfer') {
        // Set recipient to wallet name for display
        const walletNames: Record<'savings' | 'pepe' | 'yield' | 'mzn' | 'btc', string> = {
          savings: 'ZAR wallet',
          pepe: 'PEPE wallet',
          yield: 'ETH wallet',
          mzn: 'MZN wallet',
          btc: 'BTC wallet',
        }
        setSendRecipient(walletNames[transferToWalletId])
        setTimeout(() => setOpenSendSuccess(true), 220)
      } else {
        // For payments, still use SendDetailsSheet
        setTimeout(() => setOpenSendDetails(true), 220)
      }
    }
  }, [amountMode, flowType, transferToWalletId])

  // Get wallet allocation for funds available display
  const { alloc, getCash, getEth, getPepe, setCash, setEth, setPepe } = useWalletAlloc()
  const fundsAvailableZAR = alloc.totalCents / 100
  const formattedFunds = formatZAR(fundsAvailableZAR)

  // Initialize portfolio store from wallet allocation
  useEffect(() => {
    initPortfolioFromAlloc(alloc.cashCents, alloc.ethCents, alloc.pepeCents, alloc.totalCents)
  }, [alloc.cashCents, alloc.ethCents, alloc.pepeCents, alloc.totalCents])

  // Initialize AI action cycle - only run when NOT signed in (autonomous demo behavior)
  // When user signs in, isAuthed becomes true and animations stop
  useAiActionCycle(
    cardStackRef,
    {
      getCash,
      getEth,
      getPepe,
      setCash,
      setEth,
      setPepe,
    },
    !isAuthed // enable only when NOT authenticated
  )

  // Demo notification engine - only run in demo mode
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  useEffect(() => {
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
    
    if (isDemoMode) {
      // Stub callbacks for map panning and card animations
      const onMapPan = (lat: number, lng: number) => {
        // TODO: Wire up to MapboxMap component for actual panning
        console.log('[Demo] Map pan to:', { lat, lng })
      }

      const onCardAnimation = (type: 'ai_trade' | 'portfolio_rebalanced') => {
        // TODO: Trigger card animation (balance pulse, health bar wiggle)
        console.log('[Demo] Card animation:', type)
      }

      startDemoNotificationEngine(pushNotification, {
        onMapPan,
        onCardAnimation,
      })

      return () => {
        stopDemoNotificationEngine()
      }
    }
  }, [pushNotification])

  // Agent card visibility timing - show after map is open
  useEffect(() => {
    if (!isMapOpen) {
      setIsAgentCardVisible(false)
      return
    }
    // Once the map is up, show the agent card a moment later
    const timeout = setTimeout(() => {
      setIsAgentCardVisible(true)
    }, 400) // ~0.4s feels good
    return () => clearTimeout(timeout)
  }, [isMapOpen])

  const handleCloseMapPopup = () => {
    setIsMapOpen(false)
    setIsAgentCardVisible(false)
  }

  // Get title and subtitle - always use card definitions (same for both modes)
  const cardDef = getCardDefinition(topCardType)
  const { title } = cardDef
  
  // Calculate total ZAR amount across all cards for subtitle
  const totalZAR = alloc.totalCents / 100
  const subtitleText = `R ${totalZAR.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} available`

  // Demo-friendly daily % change that updates every 5 seconds with jitter
  const [dailyChangePct, setDailyChangePct] = useState(() => {
    // initial demo value between -1.0% and +1.0%
    return parseFloat(((Math.random() - 0.5) * 2).toFixed(2))
  })

  useEffect(() => {
    const id = setInterval(() => {
      setDailyChangePct((prev) => {
        const jitter = (Math.random() - 0.5) * 0.2 // +/-0.10% step
        const next = Math.max(-5, Math.min(5, prev + jitter)) // clamp to [-5, 5]
        return parseFloat(next.toFixed(2))
      })
    }, 5000) // every 5 seconds

    return () => clearInterval(id)
  }, [])

  return (
    <div className="app-shell">
      <div className="mobile-frame">
        <div className="dashboard-container" style={{ position: 'relative' }}>
          {/* Convert notification banner */}
          <ConvertNotificationBanner
            notification={convertNotificationState}
            onDismiss={() => setConvertNotificationState(null)}
          />

          {/* Overlay: Glass bars only */}
          <div className="overlay-glass">
            <TopGlassBar onScanClick={() => {
              guardAuthed(() => {
                setIsScannerOpen(true)
              })
            }} />
            <BottomGlassBar 
              currentPath="/" 
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

          {/* Scanner - toggle between overlay and sheet implementations */}
          {USE_MODAL_SCANNER ? (
            <ScanQrSheet isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} />
          ) : (
            <ScanOverlay isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} />
          )}

          {/* Scrollable content */}
          <div className="scroll-content">
            <div className="content">
              {/* Card section with shared shell */}
              <div className="sectionShell">
                <div className="frame-parent">
                  <div className="wallet-header">
                    <h1 className="wallet-title">{title}</h1>
                    <div
                      className="help-icon"
                      onClick={() => {
                        // ? info chips remain accessible without auth (read-only information)
                        if (!topCardType) return
                        setHelperWalletKey(topCardType)
                        setIsHelperOpen(true)
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          if (!topCardType) return
                          setHelperWalletKey(topCardType)
                          setIsHelperOpen(true)
                        }
                      }}
                      aria-label="Help"
                    >
                      ?
                    </div>
                  </div>
                  <div className="wallet-subtitle-container">
                    <span className="wallet-subtitle">{subtitleText}</span>
                    <TotalChangeBadge pctChange={dailyChangePct} />
                  </div>
                </div>

                {/* Card Stack */}
                <CardStack 
                  ref={cardStackRef} 
                  onTopCardChange={setTopCardType}
                  onCardClick={() => {
                    guardAuthed(() => {
                      // Card click allowed after auth
                    })
                  }}
                />
              </div>

              {/* Explore savings circles section with shared shell - directly under .content */}
              <ConvertCashSection onHelpClick={() => setIsMapHelperOpen(true)} />
              <BranchManagerFooter 
                onHelicopterClick={() => {
                  guardAuthed(() => {
                    // Helicopter button opens convert keypad with single "Convert" button
                    setAmountMode('convert')
                    setAmountEntryPoint('helicopter')
                    setTimeout(() => setOpenAmount(true), 220)
                  })
                }}
                onWhatsAppClick={() => {
                  guardAuthed(() => {
                    setIsAgentSheetOpen(true)
                  })
                }} 
              />

            </div>
          </div>
        </div>
      </div>

      {/* Sheets */}
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
          if (method === 'bank') {
            setTimeout(() => setOpenBankTransferDetails(true), 220)
          } else if (method === 'card') {
            setAmountMode('depositCard')
            setTimeout(() => setOpenAmount(true), 220)
          } else if (method === 'crypto') {
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
        ctaLabel={amountMode === 'depositCard' ? 'Deposit' : amountMode === 'deposit' ? 'Transfer USDT' : amountMode === 'send' ? (flowType === 'transfer' ? 'Transfer' : 'Send') : 'Continue'}
        showDualButtons={amountMode === 'convert' && !amountEntryPoint} // Legacy support: only if entryPoint not set
        entryPoint={amountEntryPoint}
        onScanClick={amountEntryPoint === 'cashButton' ? () => {
          guardAuthed(() => {
            setIsScannerOpen(true)
          })
        } : undefined}
        onCashSubmit={amountMode === 'convert' ? ({ amountZAR }) => {
          // Cash convert flow (used by both "Request" and "Convert" buttons): close keypad, then show map popup
          setConvertAmount(amountZAR)
          // Close keypad modal
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          
          // Reset states first
          setIsMapOpen(false)
          setIsAgentCardVisible(false)
          
          // Small delay to ensure modals are fully closed, then show map popup
          setTimeout(() => {
            setIsMapOpen(true)
          }, 220) // Match other modal transitions
        } : undefined}
        onCardSubmit={amountMode === 'convert' ? ({ amountZAR, amountUSDT }) => {
          // Card payment flow ("Pay someone"): close keypad, then show card success sheet
          setDepositAmountZAR(amountZAR)
          setDepositAmountUSDT(amountUSDT || 0)
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => setOpenCardSuccess(true), 220)
        } : undefined}
        onSubmit={amountMode === 'depositCard' ? ({ amountZAR, amountUSDT }) => {
          setDepositAmountZAR(amountZAR)
          setDepositAmountUSDT(amountUSDT || 0)
          setOpenAmount(false)
          setAmountEntryPoint(undefined)
          setTimeout(() => setOpenCardSuccess(true), 220)
        } : amountMode !== 'send' && amountMode !== 'convert' ? ({ amountZAR, amountUSDT }) => {
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
        onPay={(payload) => {
          console.log('PAY', payload)
          setSendRecipient(payload.to)
          setOpenSendDetails(false)
          setTimeout(() => setOpenSendSuccess(true), 220)
          // Note: notification is emitted in SuccessSheet when it opens
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
        kind="send"
        flowType={flowType}
      />
      <SuccessSheet
        open={openDepositSuccess}
        onClose={closeDepositSuccess}
        amountZAR={`R ${depositAmountZAR.toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
        recipient=""
        kind="deposit"
      />
      <SuccessSheet
        open={openCardSuccess}
        onClose={() => {
          setOpenCardSuccess(false)
          setDepositAmountZAR(0)
          setDepositAmountUSDT(0)
        }}
        amountZAR={`R ${depositAmountZAR.toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
        amountUSDT={depositAmountUSDT > 0 ? formatUSDT(depositAmountUSDT) : undefined}
        recipient=""
        kind="card"
      />
      <BankTransferDetailsSheet
        open={openBankTransferDetails}
        onClose={closeBankTransferDetails}
      />
              <CashMapPopup
                open={isMapOpen}
                onClose={handleCloseMapPopup}
                amount={convertAmount}
                showAgentCard={isAgentCardVisible}
                onComplete={() => {
                  // Reset convert flow state when deposit is completed
                  setConvertAmount(0)
                  setConvertNotificationState(null)
                }}
              />
      <AgentListSheet
        open={isAgentSheetOpen}
        onClose={() => setIsAgentSheetOpen(false)}
      />
      <WalletHelperSheet
        walletKey={helperWalletKey}
        onClose={() => {
          setIsHelperOpen(false)
          setHelperWalletKey(null)
        }}
      />
      <MapHelperSheet
        isOpen={isMapHelperOpen}
        onClose={() => setIsMapHelperOpen(false)}
      />
      <InternalTransferSheet
        open={openInternalTransfer}
        onClose={closeInternalTransfer}
        onNext={handleTransferNext}
        defaultFromWalletId={transferFromWalletId}
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
    </div>
  )
}

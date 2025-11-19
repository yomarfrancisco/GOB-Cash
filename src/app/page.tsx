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
import InternalTransferSheet from '@/components/InternalTransferSheet'
import DepositCryptoWalletSheet, { type DepositCryptoWallet } from '@/components/DepositCryptoWalletSheet'
import CryptoDepositAddressSheet from '@/components/CryptoDepositAddressSheet'
import { useNotificationStore } from '@/store/notifications'
import { startDemoNotificationEngine, stopDemoNotificationEngine } from '@/lib/demo/demoNotificationEngine'

// Toggle flag to compare both scanner implementations
const USE_MODAL_SCANNER = false // Set to true to use sheet-based scanner, false for full-screen overlay

export default function Home() {
  const [topCardType, setTopCardType] = useState<'pepe' | 'savings' | 'yield' | 'mzn' | 'btc'>('savings')
  const [isHelperOpen, setIsHelperOpen] = useState(false)
  const [helperWalletKey, setHelperWalletKey] = useState<'pepe' | 'savings' | 'yield' | 'mzn' | 'btc' | null>(null)
  const cardStackRef = useRef<CardStackHandle>(null)
  const { setOnSelect, open } = useTransactSheet()

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
  const [openBankTransferDetails, setOpenBankTransferDetails] = useState(false)
  const [amountMode, setAmountMode] = useState<'deposit' | 'withdraw' | 'send' | 'depositCard'>('deposit')
  const [sendAmountZAR, setSendAmountZAR] = useState(0)
  const [sendAmountUSDT, setSendAmountUSDT] = useState(0)
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
  const closeAmount = useCallback(() => setOpenAmount(false), [])
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

  // Get wallet mode to gate animations
  const { mode } = useWalletMode()

  // Initialize portfolio store from wallet allocation
  useEffect(() => {
    initPortfolioFromAlloc(alloc.cashCents, alloc.ethCents, alloc.pepeCents, alloc.totalCents)
  }, [alloc.cashCents, alloc.ethCents, alloc.pepeCents, alloc.totalCents])

  // Initialize AI action cycle - only run in autonomous mode
  useAiActionCycle(cardStackRef, {
    getCash,
    getEth,
    getPepe,
    setCash,
    setEth,
    setPepe,
  }, mode === 'autonomous')

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

  // Manual mode titles per card
  const MANUAL_TITLES: Record<'pepe' | 'savings' | 'yield' | 'mzn' | 'btc', { title: string; subtitle: string }> = {
    savings: { title: 'ZAR wallet', subtitle: 'South African business account' },
    mzn: { title: 'MZN wallet', subtitle: 'Mozambique business account' },
    pepe: { title: 'PEPE wallet', subtitle: 'PEPE investment account' },
    yield: { title: 'ETH wallet', subtitle: 'ETH investment account' },
    btc: { title: 'BTC wallet', subtitle: 'BTC investment account' },
  }

  // Get title and subtitle based on mode and current top card
  const getHeadings = () => {
    if (mode === 'manual') {
      return MANUAL_TITLES[topCardType]
    }
    // autonomous (existing behavior)
    return {
      title: 'Crypto Stokvel',
      subtitle: `R${formattedFunds.major}${formattedFunds.cents === '00' ? '' : ` ${formattedFunds.cents}`} available`,
    }
  }

  const { title, subtitle } = getHeadings()

  return (
    <div className="app-shell">
      <div className="mobile-frame">
        <div className="dashboard-container" style={{ position: 'relative' }}>
          {/* Overlay: Glass bars only */}
          <div className="overlay-glass">
            <TopGlassBar onScanClick={() => setIsScannerOpen(true)} />
            <BottomGlassBar currentPath="/" onDollarClick={() => open()} />
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
                  <p className="wallet-subtitle">{subtitle}</p>
                </div>

                {/* Card Stack */}
                <CardStack ref={cardStackRef} onTopCardChange={setTopCardType} />
              </div>

              {/* Explore savings circles section with shared shell - directly under .content */}
              <ConvertCashSection />
              <BranchManagerFooter onWhatsAppClick={() => setIsAgentSheetOpen(true)} />

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
        onClose={closeAmount}
        mode={amountMode}
        flowType={flowType}
        balanceZAR={200}
        fxRateZARperUSDT={18.1}
        ctaLabel={amountMode === 'depositCard' ? 'Deposit' : amountMode === 'deposit' ? 'Transfer USDT' : amountMode === 'send' ? (flowType === 'transfer' ? 'Transfer' : 'Send') : 'Continue'}
        onSubmit={amountMode === 'depositCard' ? ({ amountZAR }) => {
          setDepositAmountZAR(amountZAR)
          setOpenAmount(false)
          setTimeout(() => setOpenDepositSuccess(true), 220)
        } : amountMode !== 'send' ? ({ amountZAR, amountUSDT }) => {
          setOpenAmount(false)
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
      <BankTransferDetailsSheet
        open={openBankTransferDetails}
        onClose={closeBankTransferDetails}
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

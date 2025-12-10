'use client'

import Image from 'next/image'
import { Landmark, Wallet } from 'lucide-react'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import '@/styles/send-details-sheet.css'

type Props = {
  open: boolean
  onClose: () => void
  onSelect?: (method: 'bank' | 'card' | 'crypto' | 'atm' | 'agent') => void
  onBack?: () => void // Callback for back button
}

export default function WithdrawSheet({ open, onClose, onSelect, onBack }: Props) {
  const handleSelect = (method: 'bank' | 'card' | 'crypto' | 'atm' | 'agent') => {
    if (onSelect) {
      onSelect(method)
    }
  }

  // Show back button when onBack is provided
  const showBackButton = !!onBack

  return (
    <ActionSheet open={open} onClose={onClose} title="" className={showBackButton ? 'withdraw-sheet-with-back' : ''} size="tall">
      {showBackButton && (
        <div className="send-details-header">
          <button className="send-details-back" onClick={onBack} aria-label="Back">
            <Image src="/assets/back_ui.svg" alt="" width={24} height={24} />
          </button>
          <h3 className="send-details-title">Withdraw method</h3>
          {/* Spacer to push title to center */}
          <div style={{ width: '32px', height: '32px' }} />
        </div>
      )}
      {!showBackButton && (
        <div style={{ paddingTop: 'var(--sheet-header-offset, 64px)' }}>
          <h3 style={{ 
            font: '300 22px/1.2 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            letterSpacing: '-0.22px',
            color: '#0a0a0a',
            margin: '0 20px 16px 20px',
            textAlign: 'center'
          }}>Withdraw method</h3>
        </div>
      )}
      <ActionSheetItem
        icon={<Landmark size={22} strokeWidth={2} />}
        title="Bank account"
        caption="Send ZAR to your linked bank account."
        onClick={() => handleSelect('bank')}
      />
      <ActionSheetItem
        icon={<Wallet size={22} strokeWidth={2} />}
        title="External crypto wallet"
        caption="Send USDT to an external wallet."
        onClick={() => handleSelect('crypto')}
      />
    </ActionSheet>
  )
}


'use client'

import Image from 'next/image'
import { MailPlus, Globe, AtSign, Landmark, CreditCard, Wallet, Receipt, Users } from 'lucide-react'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import '@/styles/send-details-sheet.css'

type Props = {
  open: boolean
  onClose: () => void
  onSelect?: (method: 'bank' | 'card' | 'crypto' | 'email' | 'wallet' | 'brics' | 'atm' | 'agent') => void
  variant?: 'deposit' | 'direct-payment' // 'deposit' for Deposit button, 'direct-payment' for $ icon
  onBack?: () => void // Callback for back button (only used for variant="deposit")
}

export default function DepositSheet({ open, onClose, onSelect, variant = 'deposit', onBack }: Props) {
  const handleSelect = (method: 'bank' | 'card' | 'crypto' | 'email' | 'wallet' | 'brics' | 'atm' | 'agent') => {
    if (onSelect) {
      onSelect(method)
    }
  }

  // Text content based on variant
  const title = variant === 'direct-payment' ? 'Direct USDT Payment' : 'Deposit method'
  
  const options = variant === 'direct-payment' 
    ? [
        {
          title: 'Email or WhatsApp',
          caption: 'Send a link to pay via email or WhatsApp.',
          method: 'email' as const,
          icon: (
            <Image
              src="/assets/WhatsApp_Balck.png"
              alt="WhatsApp"
              width={24}
              height={24}
              style={{ objectFit: 'contain' }}
              unoptimized
            />
          )
        },
        {
          title: 'USDT Wallet',
          caption: 'Transfer to any wallet on Tron, Ethereum, or Solana.',
          method: 'wallet' as const,
          icon: <Globe size={22} strokeWidth={2} />
        },
        {
          title: 'GoBankless Handle',
          caption: 'Send to another BRICS or GoBankless user.',
          method: 'brics' as const,
          icon: <AtSign size={22} strokeWidth={2} />
        }
      ]
    : [
        {
          title: 'Direct bank transfer',
          caption: 'Link your bank account. Deposits reflect in 2–3 days.',
          method: 'bank' as const,
          icon: <Landmark size={22} strokeWidth={2} />
        },
        {
          title: 'Debit or Credit',
          caption: 'Link your card for instant deposits.',
          method: 'card' as const,
          icon: <CreditCard size={22} strokeWidth={2} />
        },
        {
          title: 'Crypto wallet',
          caption: 'Receive USDT directly from an external wallet.',
          method: 'crypto' as const,
          icon: <Wallet size={22} strokeWidth={2} />
        }
      ]

  // Show back button only for deposit variant when onBack is provided
  const showBackButton = variant === 'deposit' && !!onBack

  return (
    <ActionSheet open={open} onClose={onClose} title="" className={showBackButton ? 'deposit-sheet-with-back' : ''} size="tall">
      {showBackButton && (
        <div className="send-details-header">
          <button className="send-details-back" onClick={onBack} aria-label="Back">
            <Image src="/assets/back_ui.svg" alt="" width={24} height={24} />
          </button>
          <h3 className="send-details-title">{title}</h3>
          {/* Spacer to push title to center */}
          <div style={{ width: '32px', height: '32px' }} />
        </div>
      )}
      {!showBackButton && title && (
        <div style={{ paddingTop: 'var(--sheet-header-offset, 64px)' }}>
          <h3 style={{ 
            font: '300 22px/1.2 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            letterSpacing: '-0.22px',
            color: '#0a0a0a',
            margin: '0 20px 16px 20px',
            textAlign: 'center'
          }}>{title}</h3>
        </div>
      )}
      {options.map((option) => {
        const hasIcon = 'icon' in option && option.icon
        return (
          <ActionSheetItem
            key={option.method}
            iconSrc={hasIcon ? undefined : '/assets/up right.svg'}
            icon={hasIcon ? option.icon : undefined}
            title={option.title}
            caption={option.caption}
            onClick={() => handleSelect(option.method)}
          />
        )
      })}
    </ActionSheet>
  )
}


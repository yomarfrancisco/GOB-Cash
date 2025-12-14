'use client'

import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import Image from 'next/image'
import '@/styles/send-details-sheet.css'

export type MozambiqueBank = 'BCI' | 'ABSA'

type BankSelectSheetProps = {
  isOpen: boolean
  onClose: () => void
  onSelect: (bank: MozambiqueBank) => void
  onBack?: () => void // Callback for back button
}

const MOZAMBIQUE_BANKS: Array<{
  code: MozambiqueBank
  name: string
  subtitle: string
}> = [
  {
    code: 'ABSA',
    name: 'ABSA',
    subtitle: 'Deposits to ABSA',
  },
  {
    code: 'BCI',
    name: 'BCI',
    subtitle: 'Deposits to BCI',
  },
]

export default function BankSelectSheet({
  isOpen,
  onClose,
  onSelect,
  onBack,
}: BankSelectSheetProps) {
  const handleSelect = (bank: MozambiqueBank) => {
    onSelect(bank)
    onClose()
  }

  // Show back button when onBack is provided
  const showBackButton = !!onBack

  return (
    <ActionSheet open={isOpen} onClose={onClose} title="" className={showBackButton ? 'country-select-sheet-with-back' : ''} size="tall">
      {showBackButton && (
        <div className="send-details-header">
          <button className="send-details-back" onClick={onBack} aria-label="Back">
            <Image src="/assets/back_ui.svg" alt="" width={24} height={24} />
          </button>
          <h3 className="send-details-title">Choose bank</h3>
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
          }}>Choose bank</h3>
        </div>
      )}
      {MOZAMBIQUE_BANKS.map((bank) => (
        <ActionSheetItem
          key={bank.code}
          title={bank.name}
          caption={bank.subtitle}
          onClick={() => handleSelect(bank.code)}
        />
      ))}
    </ActionSheet>
  )
}


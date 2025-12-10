'use client'

import Image from 'next/image'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { CountryCode, COUNTRY_SELECT_OPTIONS } from '@/config/depositBankAccounts'
import '@/styles/send-details-sheet.css'

type CountrySelectSheetProps = {
  isOpen: boolean
  onClose: () => void
  onSelect: (countryCode: CountryCode) => void
  onBack?: () => void // Callback for back button
}

export default function CountrySelectSheet({
  isOpen,
  onClose,
  onSelect,
  onBack,
}: CountrySelectSheetProps) {
  const handleSelect = (countryCode: CountryCode) => {
    onSelect(countryCode)
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
          <h3 className="send-details-title">Choose country</h3>
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
          }}>Choose country</h3>
        </div>
      )}
      {COUNTRY_SELECT_OPTIONS.map((option) => (
        <ActionSheetItem
          key={option.code}
          icon={
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                overflow: 'hidden',
                backgroundColor: '#E9E9EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image
                src={option.flagPath}
                alt={option.name}
                width={40}
                height={40}
                style={{ objectFit: 'cover' }}
                unoptimized
              />
            </div>
          }
          title={option.name}
          caption={option.subtitle}
          onClick={() => handleSelect(option.code)}
        />
      ))}
    </ActionSheet>
  )
}


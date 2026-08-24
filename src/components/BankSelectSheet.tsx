'use client'

import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import Image from 'next/image'
import {
  CountryCode,
  type MozambiqueBank,
  type SouthAfricaBank,
  type SelectedBank,
} from '@/config/depositBankAccounts'
import '@/styles/send-details-sheet.css'

export type { SelectedBank } from '@/config/depositBankAccounts'

type BankSelectSheetProps = {
  isOpen: boolean
  onClose: () => void
  onSelect: (bank: SelectedBank) => void
  onBack?: () => void // Callback for back button
  countryCode: CountryCode // Which country's banks to show
}

// Bank logo paths
const BANK_LOGOS: Record<string, string> = {
  ABSA: '/assets/ABSA_logo.png',
  BCI: '/assets/BCI_logo.png',
  FNB: '/assets/fnb_logo.png',
  MOZA: '/assets/moza_logo.png',
  VISTA: '/assets/vista_logo.png',
  BIM: '/assets/BIM_LOGO.png',
}

// Mozambique banks
const MOZAMBIQUE_BANKS: Array<{
  code: MozambiqueBank
  name: string
  subtitle: string
  logoPath: string
}> = [
  {
    code: 'ABSA',
    name: 'ABSA',
    subtitle: 'Deposits to ABSA',
    logoPath: BANK_LOGOS.ABSA,
  },
  {
    code: 'BCI',
    name: 'BCI',
    subtitle: 'Deposits to BCI',
    logoPath: BANK_LOGOS.BCI,
  },
  {
    code: 'FNB',
    name: 'FNB',
    subtitle: 'Deposits to FNB Mozambique',
    logoPath: BANK_LOGOS.FNB,
  },
  {
    code: 'MOZA',
    name: 'Moza Banco',
    subtitle: 'Deposits to Moza Banco',
    logoPath: BANK_LOGOS.MOZA,
  },
  {
    code: 'VISTA',
    name: 'Vista Bank',
    subtitle: 'Deposits to Vista Bank',
    logoPath: BANK_LOGOS.VISTA,
  },
  {
    code: 'BIM',
    name: 'Millennium BIM',
    subtitle: 'Deposits to Millennium BIM',
    logoPath: BANK_LOGOS.BIM,
  },
]

// South Africa banks
const SOUTH_AFRICA_BANKS: Array<{
  code: SouthAfricaBank
  name: string
  subtitle: string
  logoPath: string
}> = [
  {
    code: 'FNB',
    name: 'FNB',
    subtitle: 'Deposits to FNB',
    logoPath: BANK_LOGOS.FNB,
  },
]

export default function BankSelectSheet({
  isOpen,
  onClose,
  onSelect,
  onBack,
  countryCode,
}: BankSelectSheetProps) {
  const handleSelect = (bank: SelectedBank) => {
    onSelect(bank)
    onClose()
  }

  // Show back button when onBack is provided
  const showBackButton = !!onBack

  // Get banks for the selected country
  const banks = countryCode === 'MZ' 
    ? MOZAMBIQUE_BANKS 
    : countryCode === 'ZA'
    ? SOUTH_AFRICA_BANKS
    : []

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
      {banks.map((bank) => (
        <ActionSheetItem
          key={bank.code}
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
                padding: '6px', // Padding to constrain logo size
              }}
            >
              <Image
                src={bank.logoPath}
                alt={bank.name}
                width={28}
                height={28}
                style={{ 
                  objectFit: 'contain',
                  maxWidth: '28px',
                  maxHeight: '28px',
                }}
                unoptimized
                onError={(e) => {
                  // Fallback to placeholder if logo fails to load
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
              />
            </div>
          }
          title={bank.name}
          caption={bank.subtitle}
          onClick={() => handleSelect(bank.code)}
        />
      ))}
    </ActionSheet>
  )
}


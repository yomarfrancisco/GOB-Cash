'use client'

import Image from 'next/image'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { CountryCode, COUNTRY_SELECT_OPTIONS } from '@/config/depositBankAccounts'

type CountrySelectSheetProps = {
  isOpen: boolean
  onClose: () => void
  onSelect: (countryCode: CountryCode) => void
}

export default function CountrySelectSheet({
  isOpen,
  onClose,
  onSelect,
}: CountrySelectSheetProps) {
  const handleSelect = (countryCode: CountryCode) => {
    onSelect(countryCode)
    onClose()
  }

  return (
    <ActionSheet open={isOpen} onClose={onClose} title="Choose country" size="tall">
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


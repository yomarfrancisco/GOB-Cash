'use client'

import { BanknoteArrowUp, BanknoteArrowDown } from 'lucide-react'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'

type CashInOutSheetProps = {
  open: boolean
  onClose: () => void
  onSelect: (mode: 'deposit' | 'withdraw') => void
}

export default function CashInOutSheet({ open, onClose, onSelect }: CashInOutSheetProps) {
  const handleSelect = (mode: 'deposit' | 'withdraw') => {
    if (onSelect) {
      onSelect(mode)
    }
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="Cash-in / out">
      <ActionSheetItem
        icon={<BanknoteArrowUp size={24} strokeWidth={2} />}
        title="Deposit"
        caption="Bring cash or bank money into GoBankless."
        onClick={() => handleSelect('deposit')}
      />
      <ActionSheetItem
        icon={<BanknoteArrowDown size={24} strokeWidth={2} />}
        title="Withdraw"
        caption="Turn GoBankless balance back into cash or bank money."
        onClick={() => handleSelect('withdraw')}
      />
    </ActionSheet>
  )
}


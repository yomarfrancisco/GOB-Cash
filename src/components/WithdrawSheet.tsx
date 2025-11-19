'use client'

import { Landmark, Wallet } from 'lucide-react'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'

type Props = {
  open: boolean
  onClose: () => void
  onSelect?: (method: 'bank' | 'card' | 'crypto') => void
}

export default function WithdrawSheet({ open, onClose, onSelect }: Props) {
  const handleSelect = (method: 'bank' | 'card' | 'crypto') => {
    if (onSelect) {
      onSelect(method)
    }
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="Withdraw method">
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


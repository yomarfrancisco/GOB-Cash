'use client'

import { HandCoins, BanknoteArrowUp, BanknoteArrowDown, ArrowLeftRight } from 'lucide-react'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { useTransactSheet } from '@/store/useTransactSheet'

export default function TransactionSheet() {
  const { isOpen, close, onSelect } = useTransactSheet()
  
  const handleSelect = (action: 'deposit' | 'withdraw' | 'payment' | 'transfer') => {
    close()
    if (onSelect) {
      onSelect(action)
    }
  }

  return (
    <ActionSheet open={isOpen} onClose={close} title="Transact">
      <ActionSheetItem
        icon={<HandCoins size={22} strokeWidth={2} />}
        title="Payment"
        caption="Pay anyone via email, handle, or wallet"
        onClick={() => handleSelect('payment')}
      />
      <ActionSheetItem
        icon={<ArrowLeftRight size={22} strokeWidth={2} />}
        title="Transfer"
        caption="Transfer funds between your fiat and crypto wallets"
        onClick={() => handleSelect('transfer')}
        ariaLabel="Transfer funds between wallets"
      />
    </ActionSheet>
  )
}


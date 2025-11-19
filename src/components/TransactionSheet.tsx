'use client'

import { HandCoins, ArrowLeftRight } from 'lucide-react'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { useTransactSheet } from '@/store/useTransactSheet'
import { useTransactActions } from '@/hooks/useTransactActions'

export default function TransactionSheet() {
  const { isOpen, close, onSelect } = useTransactSheet()
  
  const { handlePayment, handleTransfer } = useTransactActions({
    onPayment: () => {
      close()
      if (onSelect) {
        onSelect('payment')
      }
    },
    onTransfer: () => {
      close()
      if (onSelect) {
        onSelect('transfer')
      }
    },
  })

  return (
    <ActionSheet open={isOpen} onClose={close} title="Transact">
      <ActionSheetItem
        icon={<HandCoins size={22} strokeWidth={2} />}
        title="Payment"
        caption="Pay anyone via email, handle, or wallet"
        onClick={handlePayment}
      />
      <ActionSheetItem
        icon={<ArrowLeftRight size={22} strokeWidth={2} />}
        title="Transfer"
        caption="Transfer funds between your fiat and crypto wallets"
        onClick={handleTransfer}
        ariaLabel="Transfer funds between wallets"
      />
    </ActionSheet>
  )
}


'use client'

import { HandCoins, ArrowLeftRight, BanknoteArrowUp } from 'lucide-react'
import ActionSheet from './ActionSheet'
import ActionSheetItem from './ActionSheetItem'
import { useTransactActions } from '@/hooks/useTransactActions'

type PaymentsSheetProps = {
  open: boolean
  onClose: () => void
  onPayment: () => void
  onTransfer: () => void
  onDeposit: () => void
}

/**
 * Payments action sheet for Profile page
 * Lists Payment, Transfer, and Deposit flows
 */
export default function PaymentsSheet({
  open,
  onClose,
  onPayment,
  onTransfer,
  onDeposit,
}: PaymentsSheetProps) {
  const { handlePayment, handleTransfer, handleDeposit } = useTransactActions({
    onPayment: () => {
      onClose()
      onPayment()
    },
    onTransfer: () => {
      onClose()
      onTransfer()
    },
    onDeposit: () => {
      onClose()
      onDeposit()
    },
  })

  return (
    <ActionSheet open={open} onClose={onClose} title="Transact">
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
      <ActionSheetItem
        icon={<BanknoteArrowUp size={22} strokeWidth={2} />}
        title="Deposit"
        caption="Add funds instantly via card or bank transfer"
        onClick={handleDeposit}
      />
    </ActionSheet>
  )
}


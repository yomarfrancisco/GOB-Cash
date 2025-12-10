import { useCallback } from 'react'

type TransactAction = 'payment' | 'transfer' | 'deposit'

interface UseTransactActionsProps {
  onPayment?: () => void
  onTransfer?: () => void
  onDeposit?: () => void
}

/**
 * Shared hook for transact actions (Payment, Transfer, Deposit)
 * Used by both the $ button TransactionSheet and Profile PaymentsSheet
 */
export function useTransactActions({
  onPayment,
  onTransfer,
  onDeposit,
}: UseTransactActionsProps = {}) {
  const handlePayment = useCallback(() => {
    if (onPayment) {
      onPayment()
    }
  }, [onPayment])

  const handleTransfer = useCallback(() => {
    if (onTransfer) {
      onTransfer()
    }
  }, [onTransfer])

  const handleDeposit = useCallback(() => {
    if (onDeposit) {
      onDeposit()
    }
  }, [onDeposit])

  return {
    handlePayment,
    handleTransfer,
    handleDeposit,
  }
}


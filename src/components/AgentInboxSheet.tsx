'use client'

import React, { useEffect, useState } from 'react'
import ActionSheet from './ActionSheet'
import { getFirestoreDb } from '@/lib/firebase'
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore'
import { getFirebaseAuth } from '@/lib/firebase'
import type { BankDepositTransaction } from '@/types/transactions'
import { tx_receiverConfirmDeposit, tx_creditAndLock } from '@/lib/transactions/clientFunctions'
import { AGENT_UID } from '@/types/transactions'
import ActionSheetItem from './ActionSheetItem'
import styles from './AgentInboxSheet.module.css'

type AgentInboxSheetProps = {
  open: boolean
  onClose: () => void
}

export default function AgentInboxSheet({ open, onClose }: AgentInboxSheetProps) {
  const [pendingTransactions, setPendingTransactions] = useState<BankDepositTransaction[]>([])
  const [selectedTx, setSelectedTx] = useState<BankDepositTransaction | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  // Subscribe to pending transactions (status == DEPOSIT_SENT)
  useEffect(() => {
    if (!open) return

    const auth = getFirebaseAuth()
    const user = auth.currentUser
    if (!user || user.uid !== AGENT_UID) {
      // Not agent, don't show
      return
    }

    const db = getFirestoreDb()
    const transactionsRef = collection(db, 'transactions')
    const q = query(
      transactionsRef,
      where('type', '==', 'BANK_DEPOSIT_TO_USDT_TRON'),
      where('status', '==', 'DEPOSIT_SENT'),
      orderBy('statusUpdatedAt', 'desc')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs: BankDepositTransaction[] = []
      snapshot.forEach((docSnap) => {
        const data = docSnap.data()
        // Only show transactions where this user is the receiver
        if (data.receiverId === AGENT_UID) {
          txs.push(data as BankDepositTransaction)
        }
      })
      setPendingTransactions(txs)
    })

    return () => unsubscribe()
  }, [open])

  const handleSelectTransaction = async (tx: BankDepositTransaction) => {
    setSelectedTx(tx)
  }

  const handleConfirmDeposit = async () => {
    if (!selectedTx || isConfirming) return

    setIsConfirming(true)
    try {
      // First confirm deposit
      await tx_receiverConfirmDeposit(selectedTx.id)
      
      // Then credit and lock
      await tx_creditAndLock(selectedTx.id)
      
      // Close detail view
      setSelectedTx(null)
    } catch (error) {
      console.error('[AgentInbox] Failed to confirm deposit:', error)
    } finally {
      setIsConfirming(false)
    }
  }

  if (!open) return null

  return (
    <ActionSheet open={open} onClose={onClose} title="Agent Inbox" size="tall">
      {!selectedTx ? (
        <div className={styles.inboxList}>
          {pendingTransactions.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No pending deposits</p>
            </div>
          ) : (
            pendingTransactions.map((tx) => (
              <ActionSheetItem
                key={tx.id}
                title={`Deposit - ${tx.bankId || 'Bank'} (${tx.bankCountry || ''})`}
                caption={`Ref: ${tx.depositReference || 'N/A'} • R${tx.amountZar?.toFixed(2) || '0.00'}`}
                onClick={() => handleSelectTransaction(tx)}
              />
            ))
          )}
        </div>
      ) : (
        <div className={styles.transactionDetail}>
          <div className={styles.detailHeader}>
            <button className={styles.backButton} onClick={() => setSelectedTx(null)}>
              ← Back
            </button>
            <h3>Deposit Details</h3>
          </div>
          <div className={styles.detailContent}>
            <div className={styles.detailRow}>
              <span className={styles.label}>Reference:</span>
              <span className={styles.value}>{selectedTx.depositReference}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>Amount:</span>
              <span className={styles.value}>R{selectedTx.amountZar?.toFixed(2) || '0.00'}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>Bank:</span>
              <span className={styles.value}>{selectedTx.bankId} ({selectedTx.bankCountry})</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>Customer:</span>
              <span className={styles.value}>{selectedTx.userId}</span>
            </div>
            <button
              className={styles.confirmButton}
              onClick={handleConfirmDeposit}
              disabled={isConfirming}
            >
              {isConfirming ? 'Confirming...' : 'Confirm Deposit Received'}
            </button>
          </div>
        </div>
      )}
    </ActionSheet>
  )
}


'use client'

import ActionSheet from './ActionSheet'
import { Plus } from 'lucide-react'
import { useLinkedAccountsSheet } from '@/store/useLinkedAccountsSheet'
import styles from './LinkedAccountsSheet.module.css'

export default function LinkedAccountsSheet() {
  const { isOpen, close } = useLinkedAccountsSheet()

  const handleAddCard = () => {
    console.log('Add new card clicked')
  }

  const handleAddBank = () => {
    console.log('Add new bank clicked')
  }

  const handleAddWallet = () => {
    console.log('Add new wallet address clicked')
  }

  return (
    <ActionSheet open={isOpen} onClose={close} title="" size="tall" className="linked-accounts-sheet">
      <div className={styles.sheetContent}>
        <div className={styles.header}>
          <h2 className={styles.title}>Linked accounts</h2>
        </div>
        
        {/* Linked Cards Section */}
        <div className={styles.sectionWrapper}>
          <p className={styles.sectionLabel}>Linked cards</p>
          <div className={styles.tile}>
            <button
              className={styles.addButton}
              onClick={handleAddCard}
              type="button"
            >
              <Plus size={24} strokeWidth={2} />
              <span className={styles.addButtonText}>Add new card</span>
            </button>
          </div>
        </div>

        {/* Linked Banks Section */}
        <div className={styles.sectionWrapper}>
          <p className={styles.sectionLabel}>Linked banks</p>
          <div className={styles.tile}>
            <button
              className={styles.addButton}
              onClick={handleAddBank}
              type="button"
            >
              <Plus size={24} strokeWidth={2} />
              <span className={styles.addButtonText}>Add new bank</span>
            </button>
          </div>
        </div>

        {/* Linked USDT Wallet Section */}
        <div className={styles.sectionWrapper}>
          <p className={styles.sectionLabel}>Linked USDT wallet</p>
          <div className={styles.tile}>
            <button
              className={styles.addButton}
              onClick={handleAddWallet}
              type="button"
            >
              <Plus size={24} strokeWidth={2} />
              <span className={styles.addButtonText}>Add new wallet address</span>
            </button>
          </div>
        </div>
      </div>
    </ActionSheet>
  )
}


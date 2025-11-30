'use client'

import ActionSheet from './ActionSheet'
import { Plus, Check, ChevronRight } from 'lucide-react'
import { useLinkedAccountsSheet } from '@/store/useLinkedAccountsSheet'
import { useCardDetailsSheet } from '@/store/useCardDetailsSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { CardBrandIcon } from './CardBrandIcon'
import styles from './LinkedAccountsSheet.module.css'

export default function LinkedAccountsSheet() {
  const { isOpen, close } = useLinkedAccountsSheet()
  const { open: openCardDetails } = useCardDetailsSheet()
  const { profile, setDefaultCard } = useUserProfileStore()
  const { linkedCards } = profile

  const handleAddCard = () => {
    close() // Close LinkedAccountsSheet
    // Poll until LinkedAccountsSheet is closed, then open CardDetailsSheet
    const checkAndOpen = () => {
      const { isOpen: linkedAccountsOpen } = useLinkedAccountsSheet.getState()
      if (!linkedAccountsOpen) {
        openCardDetails('create', null)
      } else {
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
  }

  const handleCardClick = (cardId: string) => {
    close() // Close LinkedAccountsSheet
    // Poll until LinkedAccountsSheet is closed, then open CardDetailsSheet for editing
    const checkAndOpen = () => {
      const { isOpen: linkedAccountsOpen } = useLinkedAccountsSheet.getState()
      if (!linkedAccountsOpen) {
        openCardDetails('edit', cardId)
      } else {
        setTimeout(checkAndOpen, 50)
      }
    }
    setTimeout(checkAndOpen, 100)
  }

  const handleSetDefault = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent opening card details
    setDefaultCard(cardId)
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
          <div className={styles.linkedCardsTile}>
            {linkedCards.map((card) => (
              <button
                key={card.id}
                type="button"
                className={styles.linkedCardRow}
                onClick={() => handleCardClick(card.id)}
              >
                <div className={styles.linkedCardLeft}>
                  {/* Brand logo */}
                  <CardBrandIcon brand={card.brand} />
                  {/* Masked number */}
                  <span className={styles.linkedCardNumber}>{card.maskedDisplay}</span>
                </div>
                <div className={styles.linkedCardRight}>
                  {card.isDefault ? (
                    <Check
                      size={18}
                      strokeWidth={2.5}
                      className={styles.defaultCheckIcon}
                      onClick={(e) => handleSetDefault(card.id, e)}
                    />
                  ) : (
                    <ChevronRight size={18} strokeWidth={2} className={styles.chevronIcon} />
                  )}
                </div>
              </button>
            ))}
            {/* Add new card button */}
            <div className={styles.addNewCardSection}>
              <button
                type="button"
                className={styles.addButton}
                onClick={handleAddCard}
              >
                <Plus size={24} strokeWidth={2} />
                <span className={styles.addButtonText}>Add new card</span>
              </button>
            </div>
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


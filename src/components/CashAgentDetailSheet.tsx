'use client'

import AgentSummaryRow from './AgentSummaryRow'
import styles from './CashAgentDetailSheet.module.css'

// Single $kerryy agent data - matches AgentListSheet format
const KERRYY_AGENT = {
  id: 'kerryy',
  username: '$kerryy',
  avatar: '/assets/avatar_agent5.png',
  insured: 'R49k',
  rating: 4.1,
  reviewCount: 1322,
  progress: 98,
}

type CashAgentDetailSheetProps = {
  open: boolean
  onClose: () => void
}

export default function CashAgentDetailSheet({ open, onClose }: CashAgentDetailSheetProps) {
  const handleWhatsAppClick = () => {
    if (typeof window === 'undefined') return
    window.open('https://wa.me/27823306256', '_blank')
  }

  if (!open) return null

  return (
    <div className={styles.agentDetailSheet} onClick={(e) => e.stopPropagation()}>
      <div className={styles.header}>
        <h3 className={styles.title}>Talk to an agent</h3>
      </div>
      <div className={styles.content}>
        <p className={styles.subtitle}>Message a trusted branch manager on WhatsApp.</p>
        <div className={styles.divider} />
        
        <button
          className={styles.agentRowButton}
          onClick={handleWhatsAppClick}
          type="button"
        >
          <AgentSummaryRow agent={KERRYY_AGENT} showWhatsappIcon={true} />
        </button>
      </div>
    </div>
  )
}


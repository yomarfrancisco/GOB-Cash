'use client'

import Image from 'next/image'
import { MapPin } from 'lucide-react'
import AgentSummaryRow from './AgentSummaryRow'
import styles from './CashAgentDetailSheet.module.css'

type Agent = {
  id: string
  username: string
  avatar: string
  insured: string
  rating: number
  reviewCount: number
  progress: number
  address: string
}

type CashAgentDetailSheetProps = {
  agent: Agent
  onAccept: () => void
}

export default function CashAgentDetailSheet({ agent, onAccept }: CashAgentDetailSheetProps) {
  return (
    <div className={styles.agentDetailSheet} onClick={(e) => e.stopPropagation()}>
      <AgentSummaryRow agent={agent} showWhatsappIcon={false} />
      
      <div className={styles.divider} />
      
      <div className={styles.meetingLocation}>
        <div className={styles.meetingLocationLabel}>MEETING LOCATION</div>
        <div className={styles.meetingLocationRow}>
          <MapPin size={18} strokeWidth={2} className={styles.locationIcon} />
          <span className={styles.meetingLocationValue}>{agent.address}</span>
        </div>
      </div>
      
      <div className={styles.insurancePill}>
        <span className={styles.insuranceLabel}>DEPOSIT INSURANCE</span>
        <span className={styles.insuranceAmount}>{agent.insured}</span>
      </div>
      
      <button className={styles.acceptButton} onClick={onAccept} type="button">
        Accept request
      </button>
    </div>
  )
}


'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import { useSearchSheet } from '@/store/useSearchSheet'
import listStyles from './Inbox/FinancialInboxListSheet.module.css'
import paymentStyles from './PaymentDetailsSheet.module.css'
import styles from './SearchSheet.module.css'

type SearchContact = {
  id: string
  handle: string
  subtitle: string
  avatarSrc: string
}

const DEFAULT_CONTACTS: SearchContact[] = [
  {
    id: 'ama',
    handle: '$ama',
    subtitle: 'Portfolio Manager',
    avatarSrc: '/assets/Brics-girl-blue.png',
  },
  {
    id: 'ariel',
    handle: '$ariel',
    subtitle: 'Large Cash Payments Manager',
    avatarSrc: '/assets/avatar - profile (3).png',
  },
]

export default function SearchSheet() {
  const { isOpen, close } = useSearchSheet()
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()

  const handleContactClick = (contact: SearchContact) => {
    // For $ama, navigate to profile and close search modal
    if (contact.id === 'ama') {
      close() // Close the search modal first
      router.push('/profile/ama') // Navigate to Ama's profile (handle without $ prefix)
    } else {
      // Other contacts remain non-clickable for now
      console.log('Contact clicked:', contact.handle)
    }
  }

  return (
    <ActionSheet
      open={isOpen}
      onClose={close}
      title="Search"
      size="tall"
      className={`${listStyles.financialInboxSheet} inboxTallSheet`}
    >
      <div className={listStyles.content}>
        <p className={listStyles.subtitle}>Find cash agents and community members near you.</p>
        <div className={listStyles.divider} />
        
        {/* Search bar - reuse Inbox style */}
        <div className={listStyles.searchBar}>
          <div className={listStyles.searchIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
              <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <input
            type="text"
            className={listStyles.searchInput}
            placeholder="Search cash agents"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Default contacts list - match Make payment to sheet style */}
        <div className={paymentStyles.contactsList}>
          {DEFAULT_CONTACTS.map((contact) => (
            <button
              key={contact.id}
              className={paymentStyles.contactRow}
              onClick={() => handleContactClick(contact)}
              type="button"
            >
              <div className={paymentStyles.contactRowLeft}>
                <div className={paymentStyles.avatarWrapper}>
                  <Image
                    src={contact.avatarSrc}
                    alt={contact.handle}
                    width={48}
                    height={48}
                    className={paymentStyles.avatar}
                    unoptimized
                  />
                </div>
                <div className={paymentStyles.contactTextBlock}>
                  <div className={paymentStyles.contactHandle}>{contact.handle}</div>
                  <div className={paymentStyles.contactSubtitle}>{contact.subtitle}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </ActionSheet>
  )
}


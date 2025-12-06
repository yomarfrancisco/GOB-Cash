'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import { useSearchSheet } from '@/store/useSearchSheet'
import { useAuthStore } from '@/store/auth'
import { useProfilePreviewSheet } from '@/store/useProfilePreviewSheet'
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
    subtitle: 'AI yield manager',
    avatarSrc: '/assets/Brics-girl-blue.png',
  },
  {
    id: 'ariel',
    handle: '$ariel',
    subtitle: 'AI cash agent',
    avatarSrc: '/assets/avatar - profile (3).png',
  },
]

export default function SearchSheet() {
  const { isOpen, close } = useSearchSheet()
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const { openSheet } = useProfilePreviewSheet()

  // Clear search query when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
    }
  }, [isOpen])

  const handleContactClick = (contact: SearchContact) => {
    // Extract handle without $ prefix
    const handleWithoutPrefix = contact.handle.replace(/^\$/, '')
    
    if (isAuthed) {
      // Authenticated: open profile in tall popup sheet
      openSheet(handleWithoutPrefix, true) // Pass fromSearch=true
      // Keep search sheet open (don't close it)
    } else {
      // Unauthenticated: navigate to full-page profile view
      close() // Close the search modal first
      router.push(`/profile/${handleWithoutPrefix}?fromSearch=1`)
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
        <p className={listStyles.subtitle}>Find agents and members near you.</p>
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


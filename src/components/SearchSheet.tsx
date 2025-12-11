'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import ActionSheet from './ActionSheet'
import { useSearchSheet } from '@/store/useSearchSheet'
import { useAuthStore } from '@/store/auth'
import { useProfilePreviewSheet } from '@/store/useProfilePreviewSheet'
import { useContactsStore } from '@/store/contacts'
import { getRankedContacts, type RankedContact } from '@/lib/contacts/rankContacts'
import { groupByFirstLetter } from '@/lib/contacts/contactGrouping'
import { getContactTags } from '@/lib/contacts/contactTags'
import { buildContactSubtitle, tagsToMeta } from '@/lib/contacts/contactDescription'
import { AlphabetIndex } from './contacts/AlphabetIndex'
import listStyles from './Inbox/FinancialInboxListSheet.module.css'
import paymentStyles from './PaymentDetailsSheet.module.css'
import contactListStyles from './contacts/ContactListWithIndex.module.css'
import styles from './SearchSheet.module.css'
import { useSyncContacts } from '@/hooks/useSyncContacts'
import { useUserContactsForUI } from '@/hooks/useUserContactsForUI'
import { usePublicDirectoryContactsForUI } from '@/hooks/usePublicDirectoryContacts'

type SearchAgent = {
  type: 'agent'
  id: 'ama' | 'ariel'
  handle: string
  subtitle: string
  avatarSrc: string
}

type SearchRow =
  | SearchAgent
  | { type: 'contact'; contact: RankedContact }

const AGENTS: SearchAgent[] = [
  {
    type: 'agent',
    id: 'ama',
    handle: '$ama',
    subtitle: 'AI yield manager',
    avatarSrc: '/assets/Brics-girl-blue.png',
  },
  {
    type: 'agent',
    id: 'ariel',
    handle: '$ariel',
    subtitle: 'AI cash agent',
    avatarSrc: '/assets/avatar-ariel.png',
  },
]

const MAX_SEARCH_CONTACTS = 600 // Increased from 300
const MAX_SUGGESTED_CONTACTS = 10 // Top N contacts to show in Suggested section
const INITIAL_SEARCH_CONTACTS = 40 // Initial visible contacts
const LOAD_MORE_INCREMENT = 40 // Contacts to load per "More contacts" click

export default function SearchSheet() {
  const { isOpen, close } = useSearchSheet()
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(INITIAL_SEARCH_CONTACTS)
  const router = useRouter()
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const { openSheet } = useProfilePreviewSheet()
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Get contacts from store and compute ranked list (for sync)
  const contacts = useContactsStore((state) => state.contacts)
  const rankedContacts = useMemo(
    () => getRankedContacts(contacts || [], MAX_SEARCH_CONTACTS),
    [contacts]
  )
  useSyncContacts(rankedContacts)
  
  // Get contacts for UI display:
  // - If authed: use user's personal contacts from Firestore (with fallback to local)
  // - If not authed: use public directory contacts
  const userContacts = useUserContactsForUI(rankedContacts)
  const publicDirectoryContacts = usePublicDirectoryContactsForUI()
  const displayContacts = isAuthed ? userContacts : publicDirectoryContacts

  // Split into suggested (top N) and all contacts (rest, alphabetically sorted)
  // Only show visibleCount contacts initially
  const { suggested, sections, allLetters, availableLettersSet, allSearchContacts } = useMemo(() => {
    if (displayContacts.length === 0) {
      return { suggested: [], sections: [], allLetters: [], availableLettersSet: new Set<string>(), allSearchContacts: [] }
    }

    // 1) Suggested slice (top N)
    const suggested = displayContacts.slice(0, MAX_SUGGESTED_CONTACTS)

    // 2) All contacts for the alphabetical list
    //    - Remove suggested (no duplication)
    //    - Sort alphabetically by displayName / handle
    const suggestedIds = new Set(suggested.map((c) => c.id))
    const allAlphabetical = displayContacts
      .filter((c) => !suggestedIds.has(c.id))
      .sort((a, b) => {
        const aName = (a.name || a.handle || a.email || '').toLowerCase()
        const bName = (b.name || b.handle || b.email || '').toLowerCase()
        return aName.localeCompare(bName)
      })

    // 3) Group into sections by first letter (only show up to visibleCount)
    const remainingVisible = Math.max(0, visibleCount - suggested.length)
    const visibleAlphabetical = allAlphabetical.slice(0, remainingVisible)
    const sections = groupByFirstLetter(visibleAlphabetical)

    // 4) Generate all letters A-Z + # for the index
    const allLetters: string[] = []
    for (let i = 65; i <= 90; i++) {
      allLetters.push(String.fromCharCode(i))
    }
    allLetters.push('#')

    // 5) Get available letters (letters that have contacts)
    const availableLettersSet = new Set(sections.map((s) => s.letter))

    return { suggested, sections, allLetters, availableLettersSet, allSearchContacts: displayContacts }
  }, [displayContacts, visibleCount])

  // Clear search query and reset visible count when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setVisibleCount(INITIAL_SEARCH_CONTACTS)
    }
  }, [isOpen])

  // Filter function for search
  const matchesQuery = (query: string, item: SearchRow): boolean => {
    if (!query.trim()) return true
    
    const lowerQuery = query.toLowerCase()
    
    if (item.type === 'agent') {
      return (
        item.handle.toLowerCase().includes(lowerQuery) ||
        item.subtitle.toLowerCase().includes(lowerQuery)
      )
    } else {
      // item.type === 'contact'
      const c = item.contact
      return (
        (c.name || '').toLowerCase().includes(lowerQuery) ||
        (c.handle || '').toLowerCase().includes(lowerQuery) ||
        (c.email || '').toLowerCase().includes(lowerQuery) ||
        (c.phone || '').toLowerCase().includes(lowerQuery)
      )
    }
  }

  // Filtered results when searching
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return null // null means show default layout
    }

    const query = searchQuery.trim()
    const results: SearchRow[] = []

    // Add matching agents first
    AGENTS.forEach((agent) => {
      if (matchesQuery(query, agent)) {
        results.push(agent)
      }
    })

    // Add matching contacts
    displayContacts.forEach((contact) => {
      if (matchesQuery(query, { type: 'contact', contact })) {
        results.push({ type: 'contact', contact })
      }
    })

    return results
  }, [searchQuery, displayContacts])

  const handleAgentClick = (agent: SearchAgent) => {
    // Extract handle without $ prefix
    const handleWithoutPrefix = agent.handle.replace(/^\$/, '')
    
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

  const handleContactClick = (contact: RankedContact) => {
    // Extract handle without $ prefix if present
    const handle = contact.handle || contact.email || contact.phone || ''
    const handleWithoutPrefix = handle.replace(/^\$/, '')
    
    if (isAuthed) {
      // Authenticated: open profile in tall popup sheet
      openSheet(handleWithoutPrefix, true) // Pass fromSearch=true
      // Keep search sheet open (don't close it)
    } else {
      // Unauthenticated: navigate to full-page profile view
      close() // Close the search modal first
      router.push(`/profile/${handleWithoutPrefix}?fromSearch=1`)
    }
    
    // Scroll to top to show the selected contact
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }
  }

  // Render agent row (for $ama and $ariel)
  const renderAgentRow = (agent: SearchAgent) => (
    <button
      key={agent.id}
      className={paymentStyles.contactRow}
      onClick={() => handleAgentClick(agent)}
      type="button"
    >
      <div className={paymentStyles.contactRowLeft}>
        <div className={paymentStyles.avatarWrapper}>
          <Image
            src={agent.avatarSrc}
            alt={agent.handle}
            width={48}
            height={48}
            className={paymentStyles.avatar}
            unoptimized
          />
        </div>
        <div className={paymentStyles.contactTextBlock}>
          <div className={paymentStyles.contactHandle}>{agent.handle}</div>
          <div className={paymentStyles.contactSubtitle}>{agent.subtitle}</div>
        </div>
      </div>
    </button>
  )

  // Render contact row (for ranked contacts)
  const renderContactRow = (contact: RankedContact) => {
    const avatarUrl = contact.photoUrl || '/assets/avatar-profile.png'
    
    // Get tags and generate short subtitle for this contact
    const tags = getContactTags({
      handle: contact.handle,
      name: contact.name,
      phoneNumber: contact.phone, // Map phone to phoneNumber
      email: contact.email,
      // Map source to sourceType - 'connections'/'otherContacts' are Google contacts
      sourceType: contact.source === 'connections' || contact.source === 'otherContacts' ? 'google_contact' : contact.source || null,
    })
    
    const meta = tagsToMeta(tags)
    const subtitle = buildContactSubtitle(meta, { isAuthenticated: isAuthed })
    
    return (
      <button
        key={contact.id}
        type="button"
        className={paymentStyles.contactRow}
        onClick={() => handleContactClick(contact)}
      >
        <div className={paymentStyles.contactRowLeft}>
          <div className={paymentStyles.avatarWrapper}>
            <Image
              src={avatarUrl}
              alt={contact.handle || contact.name || ''}
              width={48}
              height={48}
              className={paymentStyles.avatar}
              unoptimized
            />
          </div>
          <div className={paymentStyles.contactTextBlock}>
            <div className={paymentStyles.contactHandle}>{contact.handle || contact.name || contact.email || ''}</div>
            <div className={paymentStyles.contactSubtitle}>{subtitle}</div>
          </div>
        </div>
      </button>
    )
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

        {/* Scrollable content container */}
        <div className={styles.sheetContainer}>
          <div ref={scrollContainerRef} className={styles.scrollableContent}>
            {filteredResults === null ? (
              /* Default layout: Suggested + A-Z list */
              <>
                {/* Suggested section */}
                <div className={contactListStyles.contactsSectionHeader}>Suggested</div>
                
                {/* Agents ($ama and $ariel) */}
                {AGENTS.map((agent) => renderAgentRow(agent))}
                
                {/* Top ranked contacts */}
                {suggested.length > 0 && (
                  <>
                    {suggested.map(renderContactRow)}
                  </>
                )}

                {/* Alphabetical contacts list - manually render to match layout */}
                {sections.length > 0 && (
                  <>
                    <div className={contactListStyles.contactsSectionDivider} />
                    <div className={contactListStyles.contactsSectionHeader}>All contacts</div>
                    {sections.map((section) => (
                      <div
                        key={section.letter}
                        ref={(el) => {
                          sectionRefs.current[section.letter] = el
                        }}
                      >
                        <div className={contactListStyles.contactsLetterHeader}>{section.letter}</div>
                        {section.contacts.map(renderContactRow)}
                      </div>
                    ))}
                  </>
                )}

                {/* Show fallback if no contacts */}
                {displayContacts.length === 0 && sections.length === 0 && (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(0, 0, 0, 0.4)' }}>
                    No contacts available
                  </div>
                )}
              </>
            ) : (
              /* Search results: flat filtered list */
              <>
                {filteredResults.length > 0 ? (
                  filteredResults.map((item) => {
                    if (item.type === 'agent') {
                      return renderAgentRow(item)
                    } else {
                      return renderContactRow(item.contact)
                    }
                  })
                ) : (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(0, 0, 0, 0.4)' }}>
                    No results found
                  </div>
                )}
              </>
            )}
          </div>

          {/* More contacts footer - shows when there are more contacts to load (only in default layout, not search results) */}
          {filteredResults === null && allSearchContacts.length > visibleCount && (
            <div className={paymentStyles.bottomFooter}>
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((prev) =>
                    Math.min(
                      prev + LOAD_MORE_INCREMENT,
                      Math.min(allSearchContacts.length, MAX_SEARCH_CONTACTS),
                    ),
                  )
                }
                style={{
                  width: '100%',
                  maxWidth: '382px',
                  height: '56px',
                  borderRadius: '56px',
                  background: '#E9E9EB',
                  color: '#000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '0 24px',
                  fontSize: '16px',
                  fontWeight: 500,
                  letterSpacing: '-0.32px',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'background 150ms ease',
                  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#D1D1D6'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#E9E9EB'
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.background = '#C7C7CC'
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.background = '#D1D1D6'
                }}
              >
                More contacts
              </button>
            </div>
          )}

          {/* A-Z index overlay - only show when not searching and we have contacts */}
          {filteredResults === null && displayContacts.length > 0 && allLetters.length > 0 && (
            <div className={styles.alphabetIndexOverlay}>
              <AlphabetIndex
                letters={allLetters}
                onSelectLetter={(letter) => {
                  // Find the section with this letter and scroll to it
                  const targetSection = sectionRefs.current[letter]
                  if (targetSection && scrollContainerRef.current) {
                    const containerRect = scrollContainerRef.current.getBoundingClientRect()
                    const targetRect = targetSection.getBoundingClientRect()
                    const scrollTop = scrollContainerRef.current.scrollTop
                    const offset = targetRect.top - containerRect.top + scrollTop - 8
                    scrollContainerRef.current.scrollTo({ top: Math.max(0, offset), behavior: 'auto' })
                  }
                }}
                availableLetters={availableLettersSet}
              />
            </div>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}


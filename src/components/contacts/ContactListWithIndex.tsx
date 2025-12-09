'use client'

import { useRef, useState, useLayoutEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Check } from 'lucide-react'
import type { RankedContact } from '@/lib/contacts/rankContacts'
import type { ContactSection } from '@/lib/contacts/contactGrouping'
import { AlphabetIndex } from './AlphabetIndex'
import styles from './ContactListWithIndex.module.css'
import contactRowStyles from '../PaymentDetailsSheet.module.css'

type ContactListWithIndexProps = {
  suggested: RankedContact[]
  sections: ContactSection[]
  onSelectContact: (c: RankedContact) => void
  selectedContactId?: string | null
}

// Reusable contact row component
function ContactRow({
  contact,
  selected,
  onClick,
}: {
  contact: RankedContact
  selected: boolean
  onClick: () => void
}) {
  const avatarUrl =
    contact.photoUrl || '/assets/avatar-profile.png'

  return (
    <button
      type="button"
      className={`${contactRowStyles.contactRow} ${selected ? contactRowStyles.contactRowSelected : ''}`}
      onClick={onClick}
    >
      <div className={contactRowStyles.contactRowLeft}>
        <div className={contactRowStyles.avatarWrapper}>
          <Image
            src={avatarUrl}
            alt={contact.handle}
            width={48}
            height={48}
            className={contactRowStyles.avatar}
            unoptimized
          />
        </div>
        <div className={contactRowStyles.contactTextBlock}>
          <div className={contactRowStyles.contactHandle}>{contact.handle}</div>
          {contact.subtitle && (
            <div className={contactRowStyles.contactSubtitle}>{contact.subtitle}</div>
          )}
        </div>
      </div>
      {selected && (
        <Check size={18} strokeWidth={2.5} className={contactRowStyles.checkIcon} />
      )}
    </button>
  )
}

export function ContactListWithIndex({
  suggested,
  sections,
  onSelectContact,
  selectedContactId,
}: ContactListWithIndexProps) {
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [sectionOffsets, setSectionOffsets] = useState<Record<string, number>>({})
  const contentRef = useRef<HTMLDivElement | null>(null)

  const letters = sections.map((s) => s.letter)
  const availableLetters = new Set(sections.map((s) => s.letter))

  // Find scrollable container helper - look for element with overflow-y: auto or scroll
  const findScrollContainer = useCallback((): HTMLElement | null => {
    if (!contentRef.current) return null
    
    // Walk up the DOM tree to find the scrollable container
    let parent: HTMLElement | null = contentRef.current.parentElement
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent)
      // Check if this element is scrollable
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        return parent
      }
      parent = parent.parentElement
    }
    return null
  }, [])

  // Calculate section offsets after render
  useLayoutEffect(() => {
    const offsets: Record<string, number> = {}
    const scrollContainer = findScrollContainer()
    
    if (!scrollContainer) return

    // Small delay to ensure DOM is fully rendered
    const timeoutId = setTimeout(() => {
      sections.forEach((section) => {
        const sectionEl = sectionRefs.current[section.letter]
        if (sectionEl) {
          // Calculate offset relative to scroll container
          const containerRect = scrollContainer.getBoundingClientRect()
          const sectionRect = sectionEl.getBoundingClientRect()
          const scrollTop = scrollContainer.scrollTop
          const offset = sectionRect.top - containerRect.top + scrollTop - 8 // Small offset for visibility
          offsets[section.letter] = Math.max(0, offset)
        }
      })
      setSectionOffsets(offsets)
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [sections, suggested.length, findScrollContainer]) // Recalculate when sections or suggested change

  const handleJumpToLetter = useCallback((letter: string) => {
    const scrollContainer = findScrollContainer()
    if (!scrollContainer) return

    // Use pre-calculated offset if available
    const offset = sectionOffsets[letter]
    if (offset !== undefined) {
      scrollContainer.scrollTo({ top: offset, behavior: 'auto' })
      return
    }

    // Fallback: calculate on-the-fly
    const target = sectionRefs.current[letter]
    if (!target) return

    const containerRect = scrollContainer.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const scrollTop = scrollContainer.scrollTop
    const calculatedOffset = targetRect.top - containerRect.top + scrollTop - 8
    scrollContainer.scrollTo({ top: Math.max(0, calculatedOffset), behavior: 'auto' })
  }, [sectionOffsets, findScrollContainer])

  // Generate all letters A-Z + # for the index (even if no contacts)
  const allLetters = useMemo(() => {
    const letters: string[] = []
    for (let i = 65; i <= 90; i++) {
      letters.push(String.fromCharCode(i))
    }
    letters.push('#')
    return letters
  }, [])

  return (
    <div className={styles.contactsListWrapper}>
      {/* Content (scrolls within parent scrollableContent) */}
      <div ref={contentRef} className={styles.contactsListContent}>
        {suggested.length > 0 && (
          <>
            <div className={styles.contactsSectionHeader}>Suggested</div>
            {suggested.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                selected={c.id === selectedContactId}
                onClick={() => onSelectContact(c)}
              />
            ))}
            {sections.length > 0 && <div className={styles.contactsSectionDivider} />}
          </>
        )}

        {sections.length > 0 && (
          <>
            {suggested.length > 0 && (
              <div className={styles.contactsSectionHeader}>All contacts</div>
            )}
            {sections.map((section) => (
              <div
                key={section.letter}
                ref={(el) => {
                  sectionRefs.current[section.letter] = el
                }}
              >
                <div className={styles.contactsLetterHeader}>{section.letter}</div>
                {section.contacts.map((c) => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    selected={c.id === selectedContactId}
                    onClick={() => onSelectContact(c)}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {/* A–Z index on the right - show all letters A-Z + # */}
      <AlphabetIndex
        letters={allLetters}
        onSelectLetter={handleJumpToLetter}
        availableLetters={availableLetters}
      />
    </div>
  )
}


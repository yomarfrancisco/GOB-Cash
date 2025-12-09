'use client'

import { useRef } from 'react'
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

  const letters = sections.map((s) => s.letter)

  const handleJumpToLetter = (letter: string) => {
    const target = sectionRefs.current[letter]
    if (!target) return

    // Find the scrollable parent container (scrollableContent)
    let scrollContainer: HTMLElement | null = target.parentElement
    while (scrollContainer && scrollContainer !== document.body) {
      const style = window.getComputedStyle(scrollContainer)
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        break
      }
      scrollContainer = scrollContainer.parentElement
    }

    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const scrollTop = scrollContainer.scrollTop
      const offset = targetRect.top - containerRect.top + scrollTop - 8
      scrollContainer.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
    }
  }

  return (
    <div className={styles.contactsListWrapper}>
      {/* Content (scrolls within parent scrollableContent) */}
      <div className={styles.contactsListContent}>
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

      {/* A–Z index on the right */}
      {letters.length > 0 && (
        <AlphabetIndex letters={letters} onSelectLetter={handleJumpToLetter} />
      )}
    </div>
  )
}


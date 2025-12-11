'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Image from 'next/image'
import { Check } from 'lucide-react'
import ActionSheet from './ActionSheet'
import { usePaymentDetailsSheet, type PaymentDetailsMode } from '@/store/usePaymentDetailsSheet'
import { normalizeRecipientInput, validateRecipientInput } from '@/lib/recipientValidation'
import { useContactsStore } from '@/store/contacts'
import { useAuthStore } from '@/store/auth'
import { getRankedContacts, type RankedContact } from '@/lib/contacts/rankContacts'
import { groupByFirstLetter } from '@/lib/contacts/contactGrouping'
import { ContactListWithIndex, type ContactListHandle } from './contacts/ContactListWithIndex'
import { AlphabetIndex } from './contacts/AlphabetIndex'
import '@/styles/send-details-sheet.css'
import styles from './PaymentDetailsSheet.module.css'
import { useSyncContacts } from '@/hooks/useSyncContacts'

const RECIPIENT_PLACEHOLDER = 'Username or WhatsApp number'
const MAX_PAYMENT_SUGGESTIONS = 300
const MAX_SUGGESTED = 25

type PaymentContact = {
  id: string
  handle: string
  subtitle: string
  avatarSrc: string
}

const FALLBACK_CONTACTS: PaymentContact[] = [
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
    avatarSrc: '/assets/avatar-ariel.png',
  },
]

type PaymentDetailsSheetProps = {
  onSubmit: (payload: {
    mode: PaymentDetailsMode
    amountZAR: number
    handle: string
  }) => void
}

export default function PaymentDetailsSheet({ onSubmit }: PaymentDetailsSheetProps) {
  const { isOpen, mode, amountZAR, close } = usePaymentDetailsSheet()
  const [recipient, setRecipient] = useState('')
  const [recipientError, setRecipientError] = useState('')
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const recipientRef = useRef<HTMLInputElement>(null)
  const contactListRef = useRef<ContactListHandle | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [alphabetLetters, setAlphabetLetters] = useState<string[]>([])
  const [availableLetters, setAvailableLetters] = useState<Set<string>>(new Set())
  const isAuthed = useAuthStore((s) => s.isAuthed)
  
  // Get contacts from store and compute ranked list
  const contacts = useContactsStore((state) => state.contacts)
  const rankedContacts = useMemo(
    () => getRankedContacts(contacts || [], MAX_PAYMENT_SUGGESTIONS),
    [contacts]
  )
  useSyncContacts(rankedContacts)

  // Split into suggested (top N) and all contacts (rest, alphabetically sorted)
  const { suggested, sections } = useMemo(() => {
    if (rankedContacts.length === 0) {
      return { suggested: [], sections: [] }
    }

    // 1) Suggested slice (keep current order)
    const suggested = rankedContacts.slice(0, MAX_SUGGESTED)

    // 2) All contacts for the alphabetical list
    //    - Start from ranked
    //    - Remove suggested (no duplication)
    //    - Sort alphabetically by displayName / handle
    const suggestedIds = new Set(suggested.map((c) => c.id))
    const allAlphabetical = rankedContacts
      .filter((c) => !suggestedIds.has(c.id))
      .sort((a, b) => {
        const aName = (a.name || a.handle || a.email || '').toLowerCase()
        const bName = (b.name || b.handle || b.email || '').toLowerCase()
        return aName.localeCompare(bName)
      })

    // 3) Group into sections by first letter
    const sections = groupByFirstLetter(allAlphabetical)

    return { suggested, sections }
  }, [rankedContacts])
  
  // Debug logging for ranked contacts
  useEffect(() => {
    if (contacts && contacts.length > 0) {
      console.log(
        '[PaymentDetailsSheet] rankedContacts:',
        contacts.length,
        'suggested:',
        suggested.length,
        'sections:',
        sections.length
      )
    }
  }, [contacts, suggested.length, sections.length])

  // Initialize when sheet opens
  useEffect(() => {
    if (!isOpen) return

    setRecipient('')
    setRecipientError('')
    setSelectedContactId(null)
    
    // Removed auto-focus to prevent iOS Safari layout gap on first render
    // Keyboard will open only when user taps an input field
  }, [isOpen])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Don't normalize on change - let user type freely
    setRecipient(value)
    setRecipientError('')
    
    // Clear selected contact if user modifies the input away from a known contact
    if (selectedContactId) {
      const allContacts = [...suggested, ...sections.flatMap((s) => s.contacts)]
      const selectedContact = allContacts.find((c) => c.id === selectedContactId)
      if (selectedContact) {
        const contactHandle = selectedContact.handle
        if (value !== contactHandle) {
          setSelectedContactId(null)
        }
      }
    }
  }

  const handleContactClick = (contact: RankedContact) => {
    // Priority order: $handle, phone, email
    const identifier = contact.handle || contact.phone || contact.email || ''
    setRecipient(identifier)
    setSelectedContactId(contact.id)
    setRecipientError('')
    
    // Dismiss keyboard by blurring the input
    if (recipientRef.current) {
      recipientRef.current.blur()
    }
    
    // Scroll to top to show the input field and selected handle
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }
  }

  // Button is enabled when recipient is valid
  const isValid = validateRecipientInput(recipient)
  const canSubmit = isValid && !recipientError && mode !== null && amountZAR !== null

  const handleSubmit = () => {
    if (!canSubmit || !mode || amountZAR === null) return

    // Normalize the recipient input
    const normalizedRecipient = normalizeRecipientInput(recipient)
    
    // Validate
    if (!validateRecipientInput(normalizedRecipient)) {
      setRecipientError('Enter a valid @username or WhatsApp number')
      return
    }

    // Call parent's onSubmit handler
    onSubmit({
      mode,
      amountZAR,
      handle: normalizedRecipient, // Keep 'handle' name for backward compatibility
    })

    // Close sheet
    close()
  }

  if (!mode) return null

  const labelText = mode === 'pay' ? 'Make payment to' : 'Request payment from'
  const buttonText = mode === 'pay' ? 'Pay' : 'Request'

  return (
    <ActionSheet open={isOpen} onClose={close} title="" className="send-details" size="tall">
      <div className="send-details-sheet">
        <div className="send-details-header">
          {/* Header structure kept for layout, but close button removed - using ActionSheet's .as-close-only */}
        </div>
        <div className={styles.sheetContainer}>
          {/* Scrollable main area - footer is now inside this container */}
          <div ref={scrollContainerRef} className={styles.scrollableContent}>
            <div className={styles.inputSection}>
              <label className="send-details-row">
                <span className="send-details-label">{labelText}</span>
                <input
                  ref={recipientRef}
                  className="send-details-input"
                  placeholder={RECIPIENT_PLACEHOLDER}
                  value={recipient}
                  onChange={handleChange}
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  enterKeyHint="done"
                  type="text"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSubmit) {
                      e.preventDefault()
                      handleSubmit()
                    }
                  }}
                />
                <div className="send-details-underline" />
                {recipientError && (
                  <div style={{ marginTop: 4, fontSize: 14, color: '#ff3b30' }}>
                    {recipientError}
                  </div>
                )}
              </label>
            </div>

            {/* Contacts list (A-Z index rendered separately as fixed overlay) */}
            {rankedContacts.length > 0 ? (
              <ContactListWithIndex
                ref={contactListRef}
                suggested={suggested}
                sections={sections}
                selectedContactId={selectedContactId}
                onSelectContact={handleContactClick}
                isAuthenticated={isAuthed}
                onHandleReady={(handle) => {
                  contactListRef.current = handle
                  setAlphabetLetters(handle.allLetters)
                  setAvailableLetters(handle.availableLetters)
                }}
              />
            ) : (
              /* Fallback to hardcoded contacts if no Google contacts */
              <div className={styles.contactsList}>
                {FALLBACK_CONTACTS.map((contact) => {
                  const isSelected = selectedContactId === contact.id
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      className={`${styles.contactRow} ${isSelected ? styles.contactRowSelected : ''}`}
                      onClick={() => {
                        setRecipient(contact.handle)
                        setSelectedContactId(contact.id)
                        setRecipientError('')
                        
                        // Scroll to top to show the input field and selected handle
                        if (scrollContainerRef.current) {
                          scrollContainerRef.current.scrollTo({
                            top: 0,
                            behavior: 'smooth',
                          })
                        }
                      }}
                    >
                      <div className={styles.contactRowLeft}>
                        <div className={styles.avatarWrapper}>
                          <Image
                            src={contact.avatarSrc}
                            alt={contact.handle}
                            width={48}
                            height={48}
                            className={styles.avatar}
                            unoptimized
                          />
                        </div>
                        <div className={styles.contactTextBlock}>
                          <div className={styles.contactHandle}>{contact.handle}</div>
                          <div className={styles.contactSubtitle}>{contact.subtitle}</div>
                        </div>
                      </div>
                      {isSelected && (
                        <Check size={18} strokeWidth={2.5} className={styles.checkIcon} />
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Fixed bottom footer with button - now inside scrollableContent */}
            <div className={styles.bottomFooter}>
              <button
                className="send-details-pay"
                disabled={!canSubmit}
                onClick={handleSubmit}
                type="button"
                style={{
                  width: '100%',
                  maxWidth: '382px',
                  height: '56px',
                  borderRadius: '56px',
                  background: canSubmit ? '#FF2D55' : '#E9E9EB',
                  color: canSubmit ? '#fff' : '#999',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '0 24px',
                  fontSize: '16px',
                  fontWeight: 500,
                  letterSpacing: '-0.32px',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {buttonText}
              </button>
            </div>
          </div>

          {/* Fixed A-Z index overlay - always visible, positioned relative to sheetContainer */}
          {rankedContacts.length > 0 && alphabetLetters.length > 0 && (
            <div className={styles.alphabetIndexOverlay}>
              <AlphabetIndex
                letters={alphabetLetters}
                onSelectLetter={(letter) => {
                  contactListRef.current?.jumpToLetter(letter)
                }}
                availableLetters={availableLetters}
              />
            </div>
          )}
        </div>
      </div>
    </ActionSheet>
  )
}

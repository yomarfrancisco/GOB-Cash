'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { ArrowUp } from 'lucide-react'
import styles from './ChatInputBar.module.css'

export interface ChatInputBarProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder?: string
  disabled?: boolean
  onAttach?: () => void // Optional attachment handler
  onInputFocus?: () => void // Optional callback when input gains focus
}

export default function ChatInputBar({
  value,
  onChange,
  onSend,
  placeholder = 'Add a message',
  disabled = false,
  onAttach,
  onInputFocus,
}: ChatInputBarProps) {
  const hasText = value.trim().length > 0
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Hide attachment when focused or has text
  const showAttachment = !isFocused && !hasText

  const handleSend = () => {
    if (!hasText || disabled) return
    onSend()
    // Clear input after send
    onChange('')
    // Return focus to input
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && hasText && !disabled) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleAttach = () => {
    if (onAttach) {
      onAttach()
    }
  }

  return (
    <div className={styles.commentInput}>
      {/* Left paperclip — hide when focused or has text */}
      {showAttachment && (
        <button
          type="button"
          className={styles.attachmentButton}
          onClick={handleAttach}
          aria-label="Attach"
          disabled={disabled}
        >
          <Image
            src="/assets/attachment_diagonal.svg"
            alt="Attach"
            width={24}
            height={24}
          />
        </button>
      )}

      <div className={styles.buttonWrapper}>
        <div
          className={clsx(
            styles.button,
            hasText ? styles.buttonHasText : styles.buttonEmpty,
            disabled && styles.buttonDisabled
          )}
        >
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              setIsFocused(true)
              if (onInputFocus) {
                // Small delay to allow keyboard animation to start, then check overflow
                setTimeout(() => {
                  onInputFocus()
                }, 50)
              }
            }}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
          />

          {/* Right send button — only when there is text */}
          {hasText && (
            <button
              type="button"
              className={styles.sendButton}
              onClick={handleSend}
              aria-label="Send message"
              disabled={disabled}
            >
              <ArrowUp className={styles.sendButtonIcon} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


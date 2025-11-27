'use client'

import { useRef } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import styles from './ChatInputBar.module.css'

export interface ChatInputBarProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder?: string
  disabled?: boolean
  onAttach?: () => void // Optional attachment handler
}

export default function ChatInputBar({
  value,
  onChange,
  onSend,
  placeholder = 'Add a message',
  disabled = false,
  onAttach,
}: ChatInputBarProps) {
  const hasText = value.trim().length > 0
  const inputRef = useRef<HTMLInputElement>(null)

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
      {/* Left paperclip — only when empty */}
      {!hasText && (
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
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


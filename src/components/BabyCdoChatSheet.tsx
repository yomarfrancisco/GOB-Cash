'use client'

import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import Image from 'next/image'
import { useBabyCdoChatStore } from '@/state/babyCdoChat'
import styles from './BabyCdoChatSheet.module.css'

export function BabyCdoChatSheet() {
  const { open, messages, autoCloseDelayMs, close, addUserMessage, addAssistantMessage } = useBabyCdoChatStore()
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialMessageCountRef = useRef<number>(0)

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = prev
      document.documentElement.style.overflow = ''
    }
  }, [open])

  // Close on ESC
  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Auto-close logic
  useEffect(() => {
    // Clear any existing timer
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current)
      autoCloseTimerRef.current = null
    }

    if (!open || !autoCloseDelayMs || autoCloseDelayMs <= 0) return

    // Track initial message count
    initialMessageCountRef.current = messages.length

    // Start auto-close timer
    autoCloseTimerRef.current = setTimeout(() => {
      // Only auto-close if user hasn't added any messages
      const currentCount = useBabyCdoChatStore.getState().messages.length
      if (currentCount === initialMessageCountRef.current) {
        close()
      }
    }, autoCloseDelayMs)

    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current)
        autoCloseTimerRef.current = null
      }
    }
  }, [open, autoCloseDelayMs, messages.length, close])

  // Cancel auto-close if user sends a message
  useEffect(() => {
    const currentCount = messages.length
    if (currentCount > initialMessageCountRef.current && autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current)
      autoCloseTimerRef.current = null
    }
  }, [messages.length])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim()) return

    // Add user message
    addUserMessage(inputText.trim())

    // Phase 1: Stub assistant reply (will be replaced with LLM in Phase 2)
    setTimeout(() => {
      addAssistantMessage("Got it — I'll walk you through that soon.")
    }, 500)

    // Clear input
    setInputText('')
  }

  if (!open) return null

  return ReactDOM.createPortal(
    <div className={styles.backdrop} aria-modal="true" role="dialog">
      <button className={styles.overlay} aria-label="Close" onClick={close} />
      <div className={styles.popup}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.avatar}>
              <Image
                src="/assets/Brics-girl-blue.png"
                alt="BabyCDO"
                width={32}
                height={32}
                className={styles.avatarImage}
                unoptimized
              />
            </div>
            <div className={styles.headerText}>
              <div className={styles.name}>BabyCDO</div>
              <div className={styles.subtitle}>Your AI Fund Manager</div>
            </div>
          </div>
          <button className={styles.close} onClick={close} aria-label="Close">
            <Image src="/assets/clear.svg" alt="" width={18} height={18} />
          </button>
        </div>
        <div className={styles.popupBody}>
          <div className={styles.messagesContainer}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.message} ${styles[`message--${message.role}`]}`}
              >
                {message.role === 'assistant' && (
                  <div className={styles.messageAvatar}>
                    <Image
                      src="/assets/Brics-girl-blue.png"
                      alt="BabyCDO"
                      width={24}
                      height={24}
                      className={styles.messageAvatarImage}
                      unoptimized
                    />
                  </div>
                )}
                <div className={styles.messageBubble}>
                  <div className={styles.messageText}>{message.text}</div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form className={styles.inputForm} onSubmit={handleSubmit}>
            <input
              type="text"
              className={styles.input}
              placeholder="Type a message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className={styles.sendButton}
              disabled={!inputText.trim()}
              aria-label="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body
  )
}


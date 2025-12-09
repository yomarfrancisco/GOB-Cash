'use client'

import { useRef, useState, useCallback } from 'react'
import styles from './AlphabetIndex.module.css'

type AlphabetIndexProps = {
  letters: string[] // e.g. ['A','B',...,'Z','#']
  onSelectLetter: (letter: string) => void
  availableLetters?: Set<string> // Letters that have contacts (for skipping empty ones)
}

export function AlphabetIndex({ letters, onSelectLetter, availableLetters }: AlphabetIndexProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [activeLetter, setActiveLetter] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const lastLetterRef = useRef<string | null>(null)

  // Haptic feedback helper (iOS only)
  const triggerHaptic = useCallback(() => {
    if (typeof window !== 'undefined' && 'navigator' in window) {
      // @ts-ignore - Haptic feedback API
      if (navigator.vibrate) {
        navigator.vibrate(1) // Very subtle vibration
      }
    }
  }, [])

  const getLetterFromClientY = useCallback((clientY: number): string | null => {
    const el = containerRef.current
    if (!el || letters.length === 0) return null

    const rect = el.getBoundingClientRect()
    const relativeY = Math.max(0, Math.min(clientY - rect.top, rect.height))
    const index = Math.floor((relativeY / rect.height) * letters.length)
    const clampedIndex = Math.min(Math.max(index, 0), letters.length - 1)
    return letters[clampedIndex]
  }, [letters])

  // Find next available letter if current one has no contacts
  const findNextAvailableLetter = useCallback((letter: string): string => {
    if (!availableLetters || availableLetters.has(letter)) {
      return letter
    }

    // Find next available letter in the list
    const currentIndex = letters.indexOf(letter)
    if (currentIndex === -1) return letter

    // Search forward
    for (let i = currentIndex + 1; i < letters.length; i++) {
      if (availableLetters.has(letters[i])) {
        return letters[i]
      }
    }

    // Search backward
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (availableLetters.has(letters[i])) {
        return letters[i]
      }
    }

    return letter // Fallback to original if none found
  }, [letters, availableLetters])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    const letter = getLetterFromClientY(e.clientY)
    if (letter) {
      const targetLetter = findNextAvailableLetter(letter)
      setActiveLetter(targetLetter)
      lastLetterRef.current = targetLetter
      onSelectLetter(targetLetter)
      triggerHaptic()
    }
  }, [getLetterFromClientY, findNextAvailableLetter, onSelectLetter, triggerHaptic])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    e.preventDefault()
    e.stopPropagation()
    
    const letter = getLetterFromClientY(e.clientY)
    if (letter && letter !== lastLetterRef.current) {
      const targetLetter = findNextAvailableLetter(letter)
      setActiveLetter(targetLetter)
      lastLetterRef.current = targetLetter
      onSelectLetter(targetLetter)
      triggerHaptic()
    }
  }, [isDragging, getLetterFromClientY, findNextAvailableLetter, onSelectLetter, triggerHaptic])

  const handlePointerUp = useCallback(() => {
    setIsDragging(false)
    // Keep active letter visible briefly, then fade out
    setTimeout(() => setActiveLetter(null), 150)
  }, [])

  const handlePointerLeave = useCallback(() => {
    setIsDragging(false)
    setTimeout(() => setActiveLetter(null), 150)
  }, [])

  if (letters.length === 0) return null

  return (
    <div
      ref={containerRef}
      className={styles.alphabetIndex}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerUp}
    >
      {letters.map((letter) => {
        const isActive = activeLetter === letter
        const isAvailable = !availableLetters || availableLetters.has(letter)
        return (
          <div
            key={letter}
            className={`${styles.alphabetIndexLetter} ${isActive ? styles.alphabetIndexLetterActive : ''} ${!isAvailable ? styles.alphabetIndexLetterUnavailable : ''}`}
          >
            {letter}
          </div>
        )
      })}
    </div>
  )
}


'use client'

import { useRef } from 'react'
import styles from './AlphabetIndex.module.css'

type AlphabetIndexProps = {
  letters: string[] // e.g. ['A','B',...,'Z','#']
  onSelectLetter: (letter: string) => void
}

export function AlphabetIndex({ letters, onSelectLetter }: AlphabetIndexProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const getLetterFromClientY = (clientY: number): string | null => {
    const el = containerRef.current
    if (!el || letters.length === 0) return null

    const rect = el.getBoundingClientRect()
    const relativeY = Math.max(0, Math.min(clientY - rect.top, rect.height))
    const index = Math.floor((relativeY / rect.height) * letters.length)

    return letters[Math.min(Math.max(index, 0), letters.length - 1)]
  }

  const handlePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const letter = getLetterFromClientY(e.clientY)
    if (letter) {
      onSelectLetter(letter)
    }
  }

  if (letters.length === 0) return null

  return (
    <div
      ref={containerRef}
      className={styles.alphabetIndex}
      onPointerDown={handlePointer}
      onPointerMove={(e) => {
        if (e.buttons === 1) {
          handlePointer(e)
        }
      }}
    >
      {letters.map((letter) => (
        <div key={letter} className={styles.alphabetIndexLetter}>
          {letter}
        </div>
      ))}
    </div>
  )
}


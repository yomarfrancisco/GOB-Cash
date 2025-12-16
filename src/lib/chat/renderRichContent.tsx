/**
 * Helper function to render rich text content in chat messages
 * Processes @handles, bold patterns, and returns React nodes
 */

import React from 'react'
import styles from '@/components/Inbox/FinancialInboxChatSheet.module.css'

export interface RenderRichContentOptions {
  onHandleClick?: (handle: string) => void
  boldPatterns?: Array<{ pattern: RegExp; replacement: string }>
}

/**
 * Renders rich text content with @handle links and bold patterns
 * Returns React nodes (not HTML strings) for safer rendering
 */
export function renderRichContent(
  text: string,
  options?: RenderRichContentOptions
): React.ReactNode {
  const { onHandleClick, boldPatterns = [] } = options || {}

  // Default bold patterns (ETA, Distance)
  const defaultBoldPatterns = [
    { pattern: /(ETA: )(\d+ minutes?)/g, replacement: '$1<strong>$2</strong>' },
    { pattern: /(Distance: )([\d.]+ km)/g, replacement: '$1<strong>$2</strong>' },
  ]

  const allBoldPatterns = [...defaultBoldPatterns, ...boldPatterns]

  // Split by newlines to preserve line breaks
  const lines = text.split('\n')

  return (
    <>
      {lines.map((line, lineIdx) => {
        // Process @handles first
        let processedLine = line
        const handleMatches = Array.from(line.matchAll(/@(\w+)/g))
        
        // If we have handle matches and a click handler, create React elements
        if (handleMatches.length > 0 && onHandleClick) {
          const parts: React.ReactNode[] = []
          let lastIndex = 0

          handleMatches.forEach((match) => {
            const [fullMatch, handle] = match
            const matchIndex = match.index!

            // Add text before match
            if (matchIndex > lastIndex) {
              parts.push(processedLine.substring(lastIndex, matchIndex))
            }

            // Add clickable handle
            parts.push(
              <a
                key={`handle-${matchIndex}`}
                href="#"
                className={styles.agentHandleLink}
                onClick={(e) => {
                  e.preventDefault()
                  onHandleClick(handle)
                }}
              >
                {fullMatch}
              </a>
            )

            lastIndex = matchIndex + fullMatch.length
          })

          // Add remaining text
          if (lastIndex < processedLine.length) {
            parts.push(processedLine.substring(lastIndex))
          }

          // Apply bold patterns to each part
          const finalParts = parts.map((part, partIdx) => {
            if (typeof part === 'string') {
              let processed = part
              allBoldPatterns.forEach(({ pattern, replacement }) => {
                processed = processed.replace(pattern, replacement)
              })
              return (
                <span
                  key={`part-${partIdx}`}
                  dangerouslySetInnerHTML={{ __html: processed }}
                />
              )
            }
            return <React.Fragment key={`part-${partIdx}`}>{part}</React.Fragment>
          })

          return (
            <div key={lineIdx}>
              {lineIdx > 0 && <br />}
              {finalParts}
            </div>
          )
        }

        // No handles, just apply bold patterns
        let processed = processedLine
        allBoldPatterns.forEach(({ pattern, replacement }) => {
          processed = processed.replace(pattern, replacement)
        })

        return (
          <div key={lineIdx}>
            {lineIdx > 0 && <br />}
            <span dangerouslySetInnerHTML={{ __html: processed }} />
          </div>
        )
      })}
    </>
  )
}



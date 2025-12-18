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

  // Default bold patterns (ETA, Distance, and markdown **bold**)
  const defaultBoldPatterns = [
    { pattern: /(ETA: )(\d+ minutes?)/g, replacement: '$1<strong>$2</strong>' },
    { pattern: /(Distance: )([\d.]+ km)/g, replacement: '$1<strong>$2</strong>' },
    { pattern: /\*\*(.+?)\*\*/g, replacement: '<strong>$1</strong>' }, // Markdown **bold**
  ]
  
  // URL pattern for making links clickable
  const urlPattern = /(https?:\/\/[^\s]+)/g

  const allBoldPatterns = [...defaultBoldPatterns, ...boldPatterns]

  // Check if message has @handles (requires line-by-line processing)
  const hasHandles = /@\w+/.test(text)
  
  // Helper to make URLs clickable
  const makeUrlsClickable = (text: string): string => {
    return text.replace(urlPattern, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #0066cc; text-decoration: underline;">$1</a>')
  }
  
  // If no handles, render as single block with white-space: pre-line for compact spacing
  if (!hasHandles || !onHandleClick) {
    // Apply bold patterns and make URLs clickable
    let processed = text
    allBoldPatterns.forEach(({ pattern, replacement }) => {
      processed = processed.replace(pattern, replacement)
    })
    processed = makeUrlsClickable(processed)
    
    return (
      <span 
        style={{ whiteSpace: 'pre-line' }}
        dangerouslySetInnerHTML={{ __html: processed }}
      />
    )
  }

  // Split by newlines to preserve line breaks (only needed when processing @handles)
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

          // Apply bold patterns and make URLs clickable to each part
          const finalParts = parts.map((part, partIdx) => {
            if (typeof part === 'string') {
              let processed = part
              allBoldPatterns.forEach(({ pattern, replacement }) => {
                processed = processed.replace(pattern, replacement)
              })
              processed = makeUrlsClickable(processed)
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

        // No handles, just apply bold patterns and make URLs clickable
        let processed = processedLine
        allBoldPatterns.forEach(({ pattern, replacement }) => {
          processed = processed.replace(pattern, replacement)
        })
        processed = makeUrlsClickable(processed)

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



import type { ReactNode } from 'react'

/** Bold the figures and status words that matter in desk copy. */
const FIGURE_RE =
  /(R[\d][\d\s,.]*|[\d][\d\s,.]*\s*MZN(?:\s+gross)?|Mt\/R\s*[\d.]+|COST\s*[\d.]+|spread\s*[\d.]+|\bpending\b|\bsettled\b|\bexecuted\b)/gi

export function highlightDeskText(text: string, className?: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  FIGURE_RE.lastIndex = 0
  while ((match = FIGURE_RE.exec(text))) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }
    nodes.push(
      <strong key={`fig-${key++}`} className={className}>
        {match[0]}
      </strong>
    )
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length ? nodes : [text]
}

/** Strip day counters from bubble titles — the header owns Day n of 14. */
export function displayDeskTitle(title: string | undefined | null): string {
  if (!title) return ''
  return title
    .replace(/\s*[·.•]\s*Day\s+\d+(?:\s+of\s+\d+)?(?:\s+(?:recycle|send|—\s*add\s+ZAR|—\s*waiting[^.]*))?/gi, '')
    .replace(/\s*Day\s+\d+\s+of\s+\d+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[·.•]\s*$/g, '')
    .trim()
}

/** Drop a leading "Day n of m." line from desk bodies. */
export function displayDeskBody(body: string | undefined | null): string {
  if (!body) return ''
  return body
    .replace(/^Day\s+\d+\s+of\s+\d+\.\s*/i, '')
    .replace(/\nDay\s+\d+\s+of\s+\d+\.\s*/gi, '\n')
    .trim()
}

/** Strip day counters / legacy sell-restock scraps — header owns Day n of 14. */
export function displayDeskTitle(title: string | undefined | null): string {
  if (!title) return ''
  let out = title
    .replace(/\s*[·.•]\s*Day\s+\d+(?:\s+of\s+\d+)?(?:\s+(?:recycle|send|—\s*add\s+ZAR|—\s*waiting[^.]*))?/gi, '')
    .replace(/\s*Day\s+\d+\s+of\s+\d+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[·.•]\s*$/g, '')
    .trim()

  // Legacy titles rewritten on confirm before the closed title matrix.
  if (/^Sell ZAR\b/i.test(out)) return 'Step 4 · Send'
  if (/^Restock ZAR\b/i.test(out)) return 'Step 5 · Recycle'
  if (/^Conversion Cycle\b/i.test(out)) return 'Step 4 · Send'

  // Soft-normalize older freeform bank / window / friction lines still in Firestore.
  if (/^FNB\b/i.test(out)) return out.replace(/^FNB\b/i, 'Bank · FNB')
  if (/^Capitec\b/i.test(out)) return out.replace(/^Capitec\b/i, 'Bank · Capitec')
  if (/^Next window opened\b/i.test(out)) return 'Window · Opened'
  if (/^Add ZAR before\b/i.test(out)) return 'Window · Add ZAR'
  if (/^Window closed\b/i.test(out)) return 'Window · Closed'
  if (/^How did that swipe go\??$/i.test(out)) return 'Friction · Swipe check'
  if (/^(Decline on file|Do not switch cards)$/i.test(out)) return 'Friction · Decline'
  if (/^Bank profile$/i.test(out)) return 'Friction · Bank profile'

  return out
}

/** Drop a leading "Day n of m." line from desk bodies. */
export function displayDeskBody(body: string | undefined | null): string {
  if (!body) return ''
  return body
    .replace(/^Day\s+\d+\s+of\s+\d+\.\s*/i, '')
    .replace(/\nDay\s+\d+\s+of\s+\d+\.\s*/gi, '\n')
    .trim()
}

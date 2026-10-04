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

/** Parse desk ZAR tokens (R3 854,87 / R3,854.87 / R3854.87). */
export function parseDeskZarAmount(raw: string): number | null {
  const cleaned = raw.replace(/^R\s*/i, '').trim()
  if (!cleaned) return null
  const commaDecimal = /,\d{1,2}$/.test(cleaned) && !/\.\d{1,2}$/.test(cleaned)
  const normalized = commaDecimal
    ? cleaned.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/\s/g, '').replace(/,/g, '')
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

function formatLiveCostMt(amountMzn: number): string {
  const [whole, cents] = Math.abs(amountMzn).toFixed(2).split('.')
  const wholeWithSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const sign = amountMzn < 0 ? '-' : ''
  return `${sign}Mt ${wholeWithSep}.${cents}`
}

const LIVE_COST_SUFFIX = /\s*\(=Mt [\d\s.,-]+ @COST\)/g

/**
 * Recycle / restock bodies keep frozen ZAR tickets. Overlay live COST Mt so a
 * Planned sim still shows what each swipe costs in MZN right now.
 */
export function enrichRecycleBodyWithLiveCost(
  body: string | undefined | null,
  costMznPerZar: number | null | undefined
): string {
  const base = displayDeskBody(body)
  if (!base || !(typeof costMznPerZar === 'number') || !(costMznPerZar > 0)) return base

  const rateLabel = costMznPerZar.toFixed(2)
  let totalZar = 0
  let sawSwipe = false

  const lines = base.split('\n').map((line) => {
    const intro = line.match(/^(Swipe .+ at COST)\s+\d+(?:\.\d+)?(\.?)$/i)
    if (intro) return `${intro[1]} ${rateLabel}${intro[2] || ''}`

    const swipe = line.match(
      /^(- (?:\d{1,2}h\d{2}: )?Swipe .+ for )(R[\d\s.,]+)(?:\s*\(=Mt [\d\s.,-]+ @COST\))?(.*)$/
    )
    if (!swipe) return line.replace(LIVE_COST_SUFFIX, '')

    const zar = parseDeskZarAmount(swipe[2])
    if (!(typeof zar === 'number') || !(zar > 0)) return line.replace(LIVE_COST_SUFFIX, '')
    sawSwipe = true
    totalZar += zar
    const mt = formatLiveCostMt(Math.round(zar * costMznPerZar * 100) / 100)
    return `${swipe[1]}${swipe[2]} (=${mt} @COST)${swipe[3] || ''}`
  })

  if (!sawSwipe) return base

  return lines
    .map((line) => {
      const total = line.match(/^(Total\s+)(R[\d\s.,]+)(\s*·\s*)([\d\s.,]+)\s*MZN(\s+out\.)$/i)
      if (!total) return line
      const zar = parseDeskZarAmount(total[2])
      const sourceZar = typeof zar === 'number' && zar > 0 ? zar : totalZar
      if (!(sourceZar > 0)) return line
      const mt = (Math.round(sourceZar * costMznPerZar * 100) / 100).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      return `${total[1]}${total[2]}${total[3]}${mt} MZN${total[5]}`
    })
    .join('\n')
}

/**
 * Done-state pill for a completed desk card.
 * Auto-executed steps still need a confirmation label — but never default to "ZAR sent".
 */
export function executedPillLabel(input: {
  title?: string | null
  routingAction?: string | null
}): string | null {
  const action = input.routingAction || ''
  if (action === 'replenish') return 'Card swiped'
  if (action === 'deploy') return 'ZAR sent'
  if (action === 'invoice') return 'Invoices raised'
  if (action === 'bank_notice') return 'Recorded'
  if (action === 'advice' || action === 'proposal') return null

  const title = displayDeskTitle(input.title)
  if (/^Step\s*1\b/i.test(title)) return 'Order posted'
  if (/^Step\s*2\b/i.test(title)) return 'Invoices raised'
  if (/^Step\s*3\b/i.test(title)) return 'MZN covered'
  if (/^Step\s*4\b/i.test(title)) return 'ZAR sent'
  if (/^Step\s*5\b/i.test(title)) return 'Card swiped'
  if (/^Step\s*6\b/i.test(title)) return 'Day advanced'
  if (action === 'step') return 'Done'
  return 'Done'
}

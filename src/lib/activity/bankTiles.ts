/** Neutral bank notice tiles for the desk feed (not desk liaison portraits). */
export type BankTileId =
  | 'FNB'
  | 'MOZA'
  | 'BIM'
  | 'SBM'
  | 'BCI'
  | 'ABSA'
  | 'VISTA'
  | 'CAP'
  | 'POS'

const NEUTRAL_BANK_TILE = '/assets/ZAR_square.jpg'

/** Kept for grouped-feed compatibility; every bank now uses the neutral base. */
export const BANK_TILES = {
  FNB: NEUTRAL_BANK_TILE,
  Capitec: NEUTRAL_BANK_TILE,
  Moza: NEUTRAL_BANK_TILE,
  POS: NEUTRAL_BANK_TILE,
} as const

export type BankTile = {
  id: BankTileId
  label: string
  acronym: string
  src: string
}

/** Match bank-feed titles while keeping one neutral visual language. */
export function bankTileForTitle(title: string | undefined | null): BankTile | null {
  if (!title) return null
  const m = title.match(
    /^Bank\s*[·.•]\s*(FNB(?:\s+MZ)?|Capitec|Moza|BIM|SBM|Standard Bank|BCI|ABSA|Vista(?:\s+Bank)?|POS)\b/i
  )
  if (!m) return null
  const raw = m[1].trim()
  if (/^capitec$/i.test(raw)) {
    return { id: 'CAP', label: 'Capitec', acronym: 'CAP', src: NEUTRAL_BANK_TILE }
  }
  if (/^moza$/i.test(raw)) {
    return { id: 'MOZA', label: 'Moza', acronym: 'MOZA', src: NEUTRAL_BANK_TILE }
  }
  if (/^bim$/i.test(raw)) {
    return { id: 'BIM', label: 'BIM', acronym: 'BIM', src: NEUTRAL_BANK_TILE }
  }
  if (/^(sbm|standard bank)$/i.test(raw)) {
    return { id: 'SBM', label: 'SBM', acronym: 'SBM', src: NEUTRAL_BANK_TILE }
  }
  if (/^bci$/i.test(raw)) {
    return { id: 'BCI', label: 'BCI', acronym: 'BCI', src: NEUTRAL_BANK_TILE }
  }
  if (/^absa$/i.test(raw)) {
    return { id: 'ABSA', label: 'Absa', acronym: 'ABSA', src: NEUTRAL_BANK_TILE }
  }
  if (/^vista(?:\s+bank)?$/i.test(raw)) {
    return { id: 'VISTA', label: 'Vista', acronym: 'VISTA', src: NEUTRAL_BANK_TILE }
  }
  if (/^pos$/i.test(raw)) {
    return { id: 'POS', label: 'POS', acronym: 'POS', src: NEUTRAL_BANK_TILE }
  }
  return {
    id: 'FNB',
    label: /^FNB\s+MZ$/i.test(raw) ? 'FNB MZ' : 'FNB',
    acronym: 'FNB',
    src: NEUTRAL_BANK_TILE,
  }
}

export function bankTileForItem(item: { title?: string; routingAction?: string }): BankTile | null {
  return bankTileForTitle(item.title)
}

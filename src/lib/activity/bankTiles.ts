/** Bank notice tiles for the desk feed (not desk liaison portraits). */

export const BANK_TILES = {
  FNB: '/assets/fnb_logo.png',
  Capitec: '/assets/capitec.png',
  Moza: '/assets/moza_logo.png',
  POS: '/assets/fnb_logo.png',
} as const

export type BankTileId = keyof typeof BANK_TILES

export type BankTile = {
  id: BankTileId
  label: string
  src: string
}

/** Match "Bank · FNB approved", "Bank · Moza VISA purchase", "Bank · FNB MZ transfer". */
export function bankTileForTitle(title: string | undefined | null): BankTile | null {
  if (!title) return null
  const m = title.match(/^Bank\s*[·.•]\s*(FNB(?:\s+MZ)?|Capitec|Moza|POS)\b/i)
  if (!m) return null
  const raw = m[1].trim()
  if (/^capitec$/i.test(raw)) return { id: 'Capitec', label: 'Capitec', src: BANK_TILES.Capitec }
  if (/^moza$/i.test(raw)) return { id: 'Moza', label: 'Moza', src: BANK_TILES.Moza }
  if (/^pos$/i.test(raw)) return { id: 'POS', label: 'POS', src: BANK_TILES.POS }
  return { id: 'FNB', label: /^FNB\s+MZ$/i.test(raw) ? 'FNB MZ' : 'FNB', src: BANK_TILES.FNB }
}

export function bankTileForItem(item: { title?: string; routingAction?: string }): BankTile | null {
  return bankTileForTitle(item.title)
}

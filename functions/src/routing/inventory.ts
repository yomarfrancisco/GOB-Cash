export type MozBankId = 'bci' | 'bim' | 'fnb' | 'standard' | 'vista' | 'moza' | 'absa'

export type NamedResource = {
  id: number
  name: string
  shortName: string
  aliases: string[]
  mozBank?: string
  mozBankId?: MozBankId
}

export const DEFAULT_CARDS: NamedResource[] = [
  {
    id: 1,
    name: 'BRICS BIM',
    shortName: 'BRICS',
    mozBank: 'BIM',
    mozBankId: 'bim',
    aliases: ['brics bim', 'brics ai ei fnb', 'brics ai', 'brics'],
  },
  {
    id: 2,
    name: 'Ginav FNB',
    shortName: 'Ginav',
    mozBank: 'FNB Mozambique',
    mozBankId: 'fnb',
    aliases: ['ginav fnb', 'ginav standard bank', 'ginav'],
  },
  {
    id: 3,
    name: 'Vidrotec BCI',
    shortName: 'Vidrotec',
    mozBank: 'BCI',
    mozBankId: 'bci',
    aliases: ['vidrotec bci', 'vidrotec bim', 'vidrotec'],
  },
  {
    id: 4,
    name: 'Wolf Vista',
    shortName: 'Wolf',
    mozBank: 'Vista',
    mozBankId: 'vista',
    aliases: ['wolf vista', 'wolf bci', 'wolf'],
  },
  {
    id: 5,
    name: 'Goblin Standard Bank',
    shortName: 'Goblin',
    mozBank: 'Standard Bank Mozambique',
    mozBankId: 'standard',
    aliases: ['goblin standard bank', 'goblin bci', 'goblin'],
  },
]

export const DEFAULT_MACHINES: NamedResource[] = [
  { id: 1, name: 'Rail 1 FNB', shortName: 'Rail 1 FNB', aliases: ['rail 1 fnb', 'rail 1', 'fnb brics', 'fnb wolf'] },
  { id: 2, name: 'Rail 2 FNB', shortName: 'Rail 2 FNB', aliases: ['rail 2 fnb', 'rail 2', 'fnb imani', 'imani'] },
  { id: 3, name: 'Rail 3 Capitec', shortName: 'Rail 3 Capitec', aliases: ['rail 3 capitec', 'rail 3'] },
  { id: 4, name: 'Rail 4 Capitec', shortName: 'Rail 4 Capitec', aliases: ['rail 4 capitec', 'rail 4', 'capitec brics', 'capitec'] },
]

export const DEFAULT_FORBIDDEN_PAIRS: Array<{ cardId: number; machineId: number }> = []

export const CARD_FLAG = '🇲🇿'
export const MACHINE_FLAG = '🇿🇦'

export function cardShortName(id: number): string {
  return DEFAULT_CARDS.find((row) => row.id === id)?.shortName || `Card ${id}`
}

export function machineShortName(id: number): string {
  return DEFAULT_MACHINES.find((row) => row.id === id)?.shortName || `Machine ${id}`
}

export function cardMozBank(id: number): string {
  return DEFAULT_CARDS.find((row) => row.id === id)?.mozBank || 'Mozambique'
}

export function cardMozBankId(id: number): MozBankId | null {
  return DEFAULT_CARDS.find((row) => row.id === id)?.mozBankId || null
}

export function formatReceiveAccount(cardId: number): string {
  return `${cardShortName(cardId)} · ${cardMozBank(cardId)}`
}

export function cardLabel(id: number): string {
  return `${CARD_FLAG} ${cardShortName(id)}`
}

export function machineLabel(id: number): string {
  return `${MACHINE_FLAG} ${machineShortName(id)}`
}

export function isForbiddenPair(cardId: number, machineId: number): boolean {
  return DEFAULT_FORBIDDEN_PAIRS.some((row) => row.cardId === cardId && row.machineId === machineId)
}

function matchAliases(
  text: string,
  resources: NamedResource[],
  consumed: Array<{ start: number; end: number }>
): number[] {
  const lower = text.toLowerCase()
  const ranked = [...resources].sort((a, b) => {
    const aLen = Math.max(...a.aliases.map((alias) => alias.length))
    const bLen = Math.max(...b.aliases.map((alias) => alias.length))
    return bLen - aLen
  })
  const ids: number[] = []
  for (const resource of ranked) {
    for (const alias of [...resource.aliases].sort((a, b) => b.length - a.length)) {
      const index = lower.indexOf(alias)
      if (index < 0) continue
      const end = index + alias.length
      const overlaps = consumed.some((span) => index < span.end && end > span.start)
      if (overlaps) continue
      const before = index === 0 ? ' ' : lower[index - 1]
      const after = end >= lower.length ? ' ' : lower[end]
      if (/\w/.test(before) || /\w/.test(after)) continue
      consumed.push({ start: index, end })
      if (!ids.includes(resource.id)) ids.push(resource.id)
      break
    }
  }
  return ids
}

function numberIds(text: string, pattern: RegExp, existing: number[]): number[] {
  const ids: number[] = []
  const cloned = new RegExp(pattern.source, pattern.flags)
  let match: RegExpExecArray | null
  while ((match = cloned.exec(text))) {
    const id = Number(match[1])
    if (Number.isFinite(id) && !existing.includes(id) && !ids.includes(id)) ids.push(id)
  }
  return ids
}

export function resolveNamedResources(text: string): { cardIds: number[]; machineIds: number[] } {
  const consumed: Array<{ start: number; end: number }> = []
  const machineIds = matchAliases(text, DEFAULT_MACHINES, consumed)
  const cardIds = matchAliases(text, DEFAULT_CARDS, consumed)
  return {
    cardIds: [...cardIds, ...numberIds(text, /\b(?:card|c)\s*(\d+)\b/gi, cardIds)],
    machineIds: [...machineIds, ...numberIds(text, /\b(?:machine|m)\s*(\d+)\b/gi, machineIds)],
  }
}

export function resolveNamedCardIds(text: string): number[] {
  return resolveNamedResources(text).cardIds
}

export function resolveNamedMachineIds(text: string): number[] {
  return resolveNamedResources(text).machineIds
}

export function inventoryPromptList(): string {
  const cards = DEFAULT_CARDS.map((row) => {
    const bank = row.mozBank ? `, receive MZN at ${row.mozBank}` : ''
    return `${row.shortName} (card ${row.id}, ${row.name}${bank})`
  }).join('; ')
  const machines = DEFAULT_MACHINES.map((row) => `${row.shortName} (machine ${row.id}, ${row.name})`).join('; ')
  const banned = DEFAULT_FORBIDDEN_PAIRS.map(
    (row) => `${cardLabel(row.cardId)} cannot use ${machineLabel(row.machineId)}`
  ).join('; ')
  return `Cards are Mozambique ${CARD_FLAG}: ${cards}.\nMachines are South Africa ${MACHINE_FLAG}: ${machines}.\n${banned ? `Permanent pairing bans: ${banned}. Never assign a banned pair. ` : ''}Use the flags in summaries.\nReceive MZN only into a named debit account, never a generic bank list. BCI, BIM, FNB Mozambique, and Standard Bank are on METIX real-time local rails and can take large credits. Vista is a small bank with high fees — never receive there. Diversify receives so the same card/bank does not take every credit. Mahomed pays from BCI and BIM; same-bank METIX is preferred when he is the payer.`
}

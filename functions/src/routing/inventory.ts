export type NamedResource = {
  id: number
  name: string
  shortName: string
  aliases: string[]
}

export const DEFAULT_CARDS: NamedResource[] = [
  { id: 1, name: 'Ginav Standard Bank', shortName: 'Ginav', aliases: ['ginav standard bank', 'ginav'] },
  { id: 2, name: 'Vidrotec BIM', shortName: 'Vidrotec', aliases: ['vidrotec bim', 'vidrotec'] },
  { id: 3, name: 'BRICS AI EI FNB', shortName: 'BRICS AI', aliases: ['brics ai ei fnb', 'brics ai', 'brics'] },
  { id: 4, name: 'Goblin BCI', shortName: 'Goblin', aliases: ['goblin bci', 'goblin'] },
  { id: 5, name: 'Wolf BCI', shortName: 'Wolf', aliases: ['wolf bci', 'wolf'] },
]

export const DEFAULT_MACHINES: NamedResource[] = [
  { id: 1, name: 'FNB BRICS', shortName: 'FNB BRICS', aliases: ['fnb brics'] },
  { id: 2, name: 'Capitec BRICS', shortName: 'Capitec BRICS', aliases: ['capitec brics', 'capitec'] },
  { id: 3, name: 'FNB IMANI', shortName: 'FNB IMANI', aliases: ['fnb imani', 'imani'] },
  { id: 4, name: 'FNB Wolf', shortName: 'FNB Wolf', aliases: ['fnb wolf'] },
]

export const DEFAULT_FORBIDDEN_PAIRS: Array<{ cardId: number; machineId: number }> = [
  { cardId: 3, machineId: 1 },
  { cardId: 3, machineId: 2 },
  { cardId: 5, machineId: 4 },
]

export function cardLabel(id: number): string {
  return DEFAULT_CARDS.find((row) => row.id === id)?.shortName || `Card ${id}`
}

export function machineLabel(id: number): string {
  return DEFAULT_MACHINES.find((row) => row.id === id)?.shortName || `Machine ${id}`
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
  const cards = DEFAULT_CARDS.map((row) => `${row.shortName} (card ${row.id}, ${row.name})`).join('; ')
  const machines = DEFAULT_MACHINES.map((row) => `${row.shortName} (machine ${row.id}, ${row.name})`).join('; ')
  const banned = DEFAULT_FORBIDDEN_PAIRS.map(
    (row) => `${cardLabel(row.cardId)} cannot use ${machineLabel(row.machineId)}`
  ).join('; ')
  return `Cards: ${cards}.\nMachines: ${machines}.\nPermanent pairing bans: ${banned}. Never assign a banned pair.`
}

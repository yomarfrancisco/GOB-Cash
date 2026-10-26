/** Client mirror of functions/src/routing/routingStepMessage.ts payload. */

export type StepStatus = 'done' | 'planned' | 'pending' | 'en_route'

export type RailStep = {
  status: StepStatus
  title: string
  subline: string
  amount: number
  amountKind: 'ZAR' | 'MZN'
  secondary?: string
}

export type Rail = {
  kind: 'card' | 'eft'
  label: 'CARD' | 'EFT'
  chip: { text: string; variant: 'today' | 'outline' | 'settled' }
  settlementTerm: 'today' | 'T+1' | 'T+2'
  total: number
  steps: RailStep[]
}

export type OrderLedger = {
  zar: number
  sellRate: number
  mznAtSell: number
  costRate: number
  baseCostRate?: number
  mznAtCost: number
  spreadMzn: number
  spreadPerZar?: number
  windowZar: number
  windowLeftZar: number
  cardZar?: number
  eftZar?: number
  clientTotal?: number
  eftTickets?: Array<{ amount: number; dueIso?: string | null }>
  coverSellRate?: number
  coverMzn?: number
}

export type RoutingStepMessage = {
  schemaVersion: 1
  stepNumber: number
  stepName: string
  cycleNumber: number
  sentAt: string
  rails: Rail[]
  next: { stepNumber: number; stepName: string; opensIn: string; dayLabel?: string }
  clientTotal: number
  summary: string
  settlement?: {
    settledZar: number
    pendingZar: number
    totalZar: number
  }
  orderLedger?: OrderLedger
}

export function formatZarMoney(value: number): string {
  const n = Math.round(value * 100) / 100
  return `R${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatMznMoney(value: number): string {
  const n = Math.round(value * 100) / 100
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN`
}

export function formatRate4(rate: number): string {
  if (!Number.isFinite(rate)) return '0.0000'
  return rate.toFixed(4)
}

export function railSumLine(rails: Rail[]): string {
  return rails.map((rail) => `${formatZarMoney(rail.total)} ${rail.kind}`).join(' + ')
}

export function parseRoutingStepMessage(raw: unknown): RoutingStepMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.schemaVersion !== 1 || !Array.isArray(row.rails)) return null
  const rails: Rail[] = []
  for (const railRaw of row.rails) {
    if (!railRaw || typeof railRaw !== 'object') continue
    const r = railRaw as Record<string, unknown>
    if ((r.kind !== 'card' && r.kind !== 'eft') || !Array.isArray(r.steps)) continue
    const steps: RailStep[] = []
    for (const stepRaw of r.steps) {
      if (!stepRaw || typeof stepRaw !== 'object') continue
      const s = stepRaw as Record<string, unknown>
      if (typeof s.title !== 'string' || typeof s.amount !== 'number') continue
      const status =
        s.status === 'done' || s.status === 'planned' || s.status === 'pending' || s.status === 'en_route'
          ? s.status === 'en_route'
            ? 'pending'
            : s.status
          : 'planned'
      steps.push({
        status,
        title: s.title,
        subline: typeof s.subline === 'string' ? s.subline : '',
        amount: s.amount,
        amountKind: s.amountKind === 'MZN' ? 'MZN' : 'ZAR',
        secondary: typeof s.secondary === 'string' ? s.secondary : undefined,
      })
    }
    const chipRaw = r.chip && typeof r.chip === 'object' ? (r.chip as Record<string, unknown>) : null
    const chipVariant =
      chipRaw?.variant === 'today' || chipRaw?.variant === 'outline' || chipRaw?.variant === 'settled'
        ? chipRaw.variant
        : 'outline'
    rails.push({
      kind: r.kind,
      label: r.kind === 'card' ? 'CARD' : 'EFT',
      chip: {
        text: typeof chipRaw?.text === 'string' ? chipRaw.text : r.kind === 'card' ? 'Today' : 'T+2',
        variant: chipVariant,
      },
      settlementTerm:
        r.settlementTerm === 'T+1' || r.settlementTerm === 'T+2' || r.settlementTerm === 'today'
          ? r.settlementTerm
          : 'today',
      total: typeof r.total === 'number' ? r.total : 0,
      steps,
    })
  }
  if (!rails.length) return null
  const nextRaw = row.next && typeof row.next === 'object' ? (row.next as Record<string, unknown>) : null
  const settlementRaw =
    row.settlement && typeof row.settlement === 'object'
      ? (row.settlement as Record<string, unknown>)
      : null
  return {
    schemaVersion: 1,
    stepNumber: typeof row.stepNumber === 'number' ? row.stepNumber : 1,
    stepName: typeof row.stepName === 'string' ? row.stepName : 'Order',
    cycleNumber: typeof row.cycleNumber === 'number' ? row.cycleNumber : 1,
    sentAt: typeof row.sentAt === 'string' ? row.sentAt : '',
    rails,
    next: {
      stepNumber: typeof nextRaw?.stepNumber === 'number' ? nextRaw.stepNumber : 2,
      stepName: typeof nextRaw?.stepName === 'string' ? nextRaw.stepName : 'Invoice',
      opensIn: typeof nextRaw?.opensIn === 'string' ? nextRaw.opensIn : '',
      dayLabel: typeof nextRaw?.dayLabel === 'string' ? nextRaw.dayLabel : undefined,
    },
    clientTotal: typeof row.clientTotal === 'number' ? row.clientTotal : 0,
    summary: typeof row.summary === 'string' ? row.summary : '',
    settlement:
      settlementRaw &&
      typeof settlementRaw.settledZar === 'number' &&
      typeof settlementRaw.pendingZar === 'number' &&
      typeof settlementRaw.totalZar === 'number'
        ? {
            settledZar: settlementRaw.settledZar,
            pendingZar: settlementRaw.pendingZar,
            totalZar: settlementRaw.totalZar,
          }
        : undefined,
  }
}

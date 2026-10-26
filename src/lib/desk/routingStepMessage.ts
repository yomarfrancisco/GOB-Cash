/** Client mirror of functions/src/routing/routingStepMessage.ts payload. */

export type StepStatus = 'done' | 'planned' | 'en_route'

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
  chip: { text: string; variant: 'today' | 'outline' }
  settlementTerm: 'today' | 'T+1' | 'T+2'
  total: number
  steps: RailStep[]
}

export type RoutingStepMessage = {
  schemaVersion: 1
  stepNumber: number
  stepName: string
  sentAt: string
  rails: Rail[]
  next: { stepNumber: number; stepName: string; opensIn: string }
  clientTotal: number
  summary: string
}

export function formatZarMoney(value: number): string {
  const n = Math.round(value * 100) / 100
  return `R${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatMznMoney(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} MZN`
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
        s.status === 'done' || s.status === 'planned' || s.status === 'en_route' ? s.status : 'planned'
      steps.push({
        status,
        title: s.title,
        subline: typeof s.subline === 'string' ? s.subline : '',
        amount: s.amount,
        amountKind: s.amountKind === 'MZN' ? 'MZN' : 'ZAR',
        ...(typeof s.secondary === 'string' ? { secondary: s.secondary } : {}),
      })
    }
    const chipRaw = r.chip && typeof r.chip === 'object' ? (r.chip as Record<string, unknown>) : null
    rails.push({
      kind: r.kind,
      label: r.kind === 'card' ? 'CARD' : 'EFT',
      chip: {
        text: typeof chipRaw?.text === 'string' ? chipRaw.text : r.kind === 'card' ? 'Today' : 'T+2',
        variant: chipRaw?.variant === 'outline' ? 'outline' : 'today',
      },
      settlementTerm:
        r.settlementTerm === 'T+1' || r.settlementTerm === 'T+2' || r.settlementTerm === 'today'
          ? r.settlementTerm
          : r.kind === 'card'
            ? 'today'
            : 'T+2',
      total: typeof r.total === 'number' ? r.total : 0,
      steps,
    })
  }
  if (!rails.length) return null
  const nextRaw = row.next && typeof row.next === 'object' ? (row.next as Record<string, unknown>) : null
  const clientTotal =
    typeof row.clientTotal === 'number'
      ? row.clientTotal
      : Math.round(rails.reduce((s, r) => s + r.total, 0) * 100) / 100
  return {
    schemaVersion: 1,
    stepNumber: typeof row.stepNumber === 'number' ? row.stepNumber : 1,
    stepName: typeof row.stepName === 'string' ? row.stepName : 'Order',
    sentAt: typeof row.sentAt === 'string' ? row.sentAt : '',
    rails,
    next: {
      stepNumber: typeof nextRaw?.stepNumber === 'number' ? nextRaw.stepNumber : 2,
      stepName: typeof nextRaw?.stepName === 'string' ? nextRaw.stepName : 'Invoice',
      opensIn: typeof nextRaw?.opensIn === 'string' ? nextRaw.opensIn : '24h',
    },
    clientTotal,
    summary: typeof row.summary === 'string' ? row.summary : '',
  }
}

/**
 * One OrderLedger per day order — every Step 1–6 display figure reads from here.
 */
import { costRateForBankMarkup } from '../fx/quotedMznZar'
import { costMarkupForDeskCardId } from '../settlement/register'

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function restockMznForAssignments(
  assignments: Array<{ cardId: number; amount: number }>,
  baseCostRate: number
): number {
  if (!(baseCostRate > 0) || !assignments.length) return 0
  return roundMoney(
    assignments.reduce((sum, row) => {
      const rate = costRateForBankMarkup(baseCostRate, costMarkupForDeskCardId(row.cardId))
      return sum + row.amount * rate
    }, 0)
  )
}

export type OrderLedgerEftTicket = {
  amount: number
  dueIso?: string | null
}

export type OrderLedger = {
  zar: number
  sellRate: number
  mznAtSell: number
  costRate: number
  baseCostRate: number
  mznAtCost: number
  spreadMzn: number
  spreadPerZar: number
  windowZar: number
  windowLeftZar: number
  cardZar: number
  eftZar: number
  clientTotal: number
  eftTickets: OrderLedgerEftTicket[]
  /** Present when cover was sized at a different sell rate than execution. */
  coverSellRate?: number
  coverMzn?: number
}

export function formatRate4(rate: number): string {
  if (!Number.isFinite(rate)) return '0.0000'
  return rate.toFixed(4)
}

export function formatZarMoney(value: number): string {
  const n = roundMoney(value)
  return `R${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatMznMoney(value: number): string {
  const n = roundMoney(value)
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN`
}

export function formatRateLabel(rate: number): string {
  return `${formatRate4(rate)} MZN/ZAR`
}

export function buildOrderLedger(input: {
  zar: number
  sellRate: number
  baseCostRate: number
  cardAssignments?: Array<{ cardId: number; amount: number }>
  eftTickets?: OrderLedgerEftTicket[]
  windowZar?: number
  coverSellRate?: number
}): OrderLedger {
  const zar = roundMoney(Math.max(0, input.zar))
  const sellRate = Number.isFinite(input.sellRate) && input.sellRate > 0 ? input.sellRate : 0
  const baseCostRate =
    Number.isFinite(input.baseCostRate) && input.baseCostRate > 0 ? input.baseCostRate : 0
  const assignments = input.cardAssignments || []
  const cardZar =
    assignments.length > 0
      ? roundMoney(assignments.reduce((sum, row) => sum + (row.amount || 0), 0))
      : zar
  const eftTickets = (input.eftTickets || []).map((t) => ({
    amount: roundMoney(t.amount),
    dueIso: t.dueIso ?? null,
  }))
  const eftZar = roundMoney(eftTickets.reduce((s, t) => s + t.amount, 0))
  const clientTotal = roundMoney(cardZar + eftZar)
  const windowZar = roundMoney(Math.max(0, input.windowZar || 0))
  const windowLeftZar = roundMoney(Math.max(0, windowZar - zar))

  const mznAtSell = zar > 0 && sellRate > 0 ? roundMoney(zar * sellRate) : 0
  const mznAtCost =
    assignments.length > 0 && baseCostRate > 0
      ? restockMznForAssignments(assignments, baseCostRate)
      : zar > 0 && baseCostRate > 0
        ? roundMoney(zar * baseCostRate)
        : 0
  const costRate = zar > 0 && mznAtCost > 0 ? mznAtCost / zar : baseCostRate
  const spreadMzn = roundMoney(Math.max(0, mznAtSell - mznAtCost))
  const spreadPerZar = Math.max(0, sellRate - costRate)

  const coverSellRate =
    typeof input.coverSellRate === 'number' &&
    input.coverSellRate > 0 &&
    Math.abs(input.coverSellRate - sellRate) > 1e-6
      ? input.coverSellRate
      : undefined
  const coverMzn = coverSellRate && zar > 0 ? roundMoney(zar * coverSellRate) : undefined

  const ledger: OrderLedger = {
    zar,
    sellRate,
    mznAtSell,
    costRate,
    baseCostRate,
    mznAtCost,
    spreadMzn,
    spreadPerZar,
    windowZar,
    windowLeftZar,
    cardZar,
    eftZar,
    clientTotal,
    eftTickets,
  }
  if (coverSellRate != null && coverMzn != null) {
    ledger.coverSellRate = coverSellRate
    ledger.coverMzn = coverMzn
  }
  return ledger
}

export function coverVsSaleLine(ledger: OrderLedger): string | null {
  if (ledger.coverSellRate == null || ledger.coverMzn == null) return null
  const delta = roundMoney(ledger.coverMzn - ledger.mznAtSell)
  if (Math.abs(delta) < 0.005) return null
  const word = delta > 0 ? 'surplus' : 'shortfall'
  return `Cover sized at ${formatRate4(ledger.coverSellRate)}; sold at ${formatRate4(ledger.sellRate)}; ${formatMznMoney(Math.abs(delta)).replace(' MZN', '')} MZN ${word}`
}

export function assertOrderLedger(
  ledger: OrderLedger,
  opts?: { soft?: boolean; cardStepZar?: number[] }
): string[] {
  const failures: string[] = []
  const eftSum = roundMoney(ledger.eftTickets.reduce((s, t) => s + t.amount, 0))
  if (Math.abs(eftSum - ledger.eftZar) > 0.01) {
    failures.push(`eftZar ${ledger.eftZar} ≠ sum tickets ${eftSum}`)
  }
  if (Math.abs(roundMoney(ledger.cardZar + ledger.eftZar) - ledger.clientTotal) > 0.01) {
    failures.push(`clientTotal ${ledger.clientTotal} ≠ card+eft`)
  }
  if (opts?.cardStepZar?.length) {
    const stepSum = roundMoney(opts.cardStepZar.reduce((s, n) => s + n, 0))
    if (Math.abs(stepSum - ledger.cardZar) > 0.01) {
      failures.push(`cardZar ${ledger.cardZar} ≠ card steps ${stepSum}`)
    }
  }
  const spreadCheck = roundMoney(ledger.mznAtSell - ledger.mznAtCost)
  if (Math.abs(spreadCheck - ledger.spreadMzn) > 0.01) {
    failures.push(`spreadMzn ${ledger.spreadMzn} ≠ mznAtSell−mznAtCost ${spreadCheck}`)
  }
  if (failures.length) {
    const message = `[OrderLedger] ${failures.join('; ')}`
    if (opts?.soft || process.env.NODE_ENV === 'production') console.error(message)
    else throw new Error(message)
  }
  return failures
}

export function parseOrderLedger(raw: unknown): OrderLedger | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const num = (k: string) => Number(row[k])
  const fields = [
    'zar',
    'sellRate',
    'mznAtSell',
    'costRate',
    'baseCostRate',
    'mznAtCost',
    'spreadMzn',
    'spreadPerZar',
    'windowZar',
    'windowLeftZar',
    'cardZar',
    'eftZar',
    'clientTotal',
  ]
  if (!fields.every((k) => Number.isFinite(num(k)))) return null
  const eftTickets = Array.isArray(row.eftTickets)
    ? row.eftTickets.flatMap((t) => {
        if (!t || typeof t !== 'object') return []
        const amount = Number((t as { amount?: unknown }).amount)
        if (!Number.isFinite(amount)) return []
        const dueIso = (t as { dueIso?: unknown }).dueIso
        return [{ amount, dueIso: typeof dueIso === 'string' ? dueIso : null }]
      })
    : []
  const ledger: OrderLedger = {
    zar: num('zar'),
    sellRate: num('sellRate'),
    mznAtSell: num('mznAtSell'),
    costRate: num('costRate'),
    baseCostRate: num('baseCostRate'),
    mznAtCost: num('mznAtCost'),
    spreadMzn: num('spreadMzn'),
    spreadPerZar: num('spreadPerZar'),
    windowZar: num('windowZar'),
    windowLeftZar: num('windowLeftZar'),
    cardZar: num('cardZar'),
    eftZar: num('eftZar'),
    clientTotal: num('clientTotal'),
    eftTickets,
  }
  if (typeof row.coverSellRate === 'number' && row.coverSellRate > 0) {
    ledger.coverSellRate = row.coverSellRate
  }
  if (typeof row.coverMzn === 'number') ledger.coverMzn = row.coverMzn
  return ledger
}

/**
 * One OrderLedger per day order — every step reads these figures; none recomputes.
 * Kept free of conversionRouter imports to avoid circular deps.
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

export type OrderLedger = {
  zar: number
  /** Unrounded sell Mt/R used for the order. */
  sellRate: number
  mznAtSell: number
  /** Unrounded weighted cost Mt/R (restockMzn / zar). */
  costRate: number
  /** Base COST before bank markups. */
  baseCostRate: number
  mznAtCost: number
  /** mznAtSell − mznAtCost from money figures (2 dp). */
  spreadMzn: number
  /** sellRate − costRate unrounded (display to 4 dp). */
  spreadPerZar: number
  cardZar: number
  eftZar: number
  clientTotal: number
  /**
   * When cover was sized at a different sell rate than the executed sale,
   * both rates are kept so Step 3/4 can state the surplus explicitly.
   */
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

/** Desk MZN — always 2 decimal places. */
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
  eftZar?: number
  /** Cover sizing rate if different from sellRate at execution. */
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
  const eftZar = roundMoney(Math.max(0, input.eftZar || 0))
  const clientTotal = roundMoney(cardZar + eftZar)

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
  const coverMzn =
    coverSellRate && zar > 0 ? roundMoney(zar * coverSellRate) : undefined

  const ledger: OrderLedger = {
    zar,
    sellRate,
    mznAtSell,
    costRate,
    baseCostRate,
    mznAtCost,
    spreadMzn,
    spreadPerZar,
    cardZar,
    eftZar,
    clientTotal,
  }
  if (coverSellRate != null && coverMzn != null) {
    ledger.coverSellRate = coverSellRate
    ledger.coverMzn = coverMzn
  }
  return ledger
}

/** Cover surplus/deficit line when sizing rate ≠ executed sell rate. */
export function coverVsSaleLine(ledger: OrderLedger): string | null {
  if (
    ledger.coverSellRate == null ||
    ledger.coverMzn == null ||
    !(ledger.zar > 0) ||
    !(ledger.sellRate > 0)
  ) {
    return null
  }
  const delta = roundMoney(ledger.coverMzn - ledger.mznAtSell)
  if (Math.abs(delta) < 0.005) return null
  const word = delta > 0 ? 'surplus' : 'shortfall'
  return `Cover sized at ${formatRate4(ledger.coverSellRate)}; sold at ${formatRate4(ledger.sellRate)}; ${formatMznMoney(Math.abs(delta)).replace(' MZN', '')} MZN ${word}`
}

export function assertOrderLedger(ledger: OrderLedger, opts?: { soft?: boolean }): void {
  const failures: string[] = []
  const cardPlusEft = roundMoney(ledger.cardZar + ledger.eftZar)
  if (Math.abs(cardPlusEft - ledger.clientTotal) > 0.01) {
    failures.push(
      `clientTotal ${ledger.clientTotal} ≠ card+eft ${cardPlusEft}`
    )
  }
  if (ledger.zar > 0 && Math.abs(ledger.zar - ledger.cardZar) > 0.01 && ledger.eftZar < 0.01) {
    // Card-only: zar should match cardZar
    failures.push(`zar ${ledger.zar} ≠ cardZar ${ledger.cardZar}`)
  }
  const spreadCheck = roundMoney(ledger.mznAtSell - ledger.mznAtCost)
  if (Math.abs(spreadCheck - ledger.spreadMzn) > 0.01) {
    failures.push(
      `spreadMzn ${ledger.spreadMzn} ≠ mznAtSell−mznAtCost ${spreadCheck}`
    )
  }
  if (!failures.length) return
  const message = `[OrderLedger] ${failures.join('; ')}`
  if (opts?.soft || process.env.NODE_ENV === 'production') {
    console.warn(message)
    return
  }
  throw new Error(message)
}

export function parseOrderLedger(raw: unknown): OrderLedger | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const zar = Number(row.zar)
  const sellRate = Number(row.sellRate)
  const mznAtSell = Number(row.mznAtSell)
  const costRate = Number(row.costRate)
  const baseCostRate = Number(row.baseCostRate)
  const mznAtCost = Number(row.mznAtCost)
  const spreadMzn = Number(row.spreadMzn)
  const spreadPerZar = Number(row.spreadPerZar)
  const cardZar = Number(row.cardZar)
  const eftZar = Number(row.eftZar)
  const clientTotal = Number(row.clientTotal)
  if (
    ![zar, sellRate, mznAtSell, costRate, baseCostRate, mznAtCost, spreadMzn, spreadPerZar, cardZar, eftZar, clientTotal].every(
      (n) => Number.isFinite(n)
    )
  ) {
    return null
  }
  const ledger: OrderLedger = {
    zar,
    sellRate,
    mznAtSell,
    costRate,
    baseCostRate,
    mznAtCost,
    spreadMzn,
    spreadPerZar,
    cardZar,
    eftZar,
    clientTotal,
  }
  if (typeof row.coverSellRate === 'number' && row.coverSellRate > 0) {
    ledger.coverSellRate = row.coverSellRate
  }
  if (typeof row.coverMzn === 'number') {
    ledger.coverMzn = row.coverMzn
  }
  return ledger
}

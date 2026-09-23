/**
 * Tables and charts the desk may attach. Every cell and point is computed
 * from the book. The model may pick an id. It may not invent a series.
 */

import {
  formatZar,
  residualToTarget,
  roundMoney,
  windowIsFinished,
  type RoutingState,
} from './conversionRouter'
import { cardShortName, machineShortName } from './inventory'
import type { RecentCycleBrief } from './interpretContext'

export type DeskTable = {
  id: string
  title: string
  columns: string[]
  rows: Array<{ cells: string[] }>
}

export type DeskChartPoint = { label: string; value: number }

export type DeskChartSeries = {
  label: string
  points: DeskChartPoint[]
}

export type DeskChart = {
  id: string
  title: string
  unit: 'ZAR' | 'MZN'
  series: DeskChartSeries[]
}

export type DeskVisuals = {
  snapshot: string
  tables: DeskTable[]
  charts: DeskChart[]
}

function dayLabel(cycleNumber: number): string {
  return cycleNumber > 0 ? `Day ${cycleNumber}` : 'Open'
}

export function buildDeskVisuals(params: {
  state: RoutingState
  recentCycles?: RecentCycleBrief[]
  current?: { kind: 'replenish' | 'deploy'; assignments: Array<{ cardId: number; machineId: number; amount: number }>; amountZar: number } | null
  awaitingKind?: string
  sellRate?: number
  costRate?: number
  walletZar?: number
}): DeskVisuals {
  const state = params.state
  const authorised = roundMoney(Math.max(0, state.authorisedZar || 0))
  const residual = residualToTarget(state)
  const converted = roundMoney(Math.max(0, authorised - residual))
  const earned = roundMoney(Math.max(0, state.cumulativeSpread || 0))
  const wallet = roundMoney(Math.max(0, params.walletZar || 0))
  const days = state.config.cycleCount || 14
  const day = Math.min(days, Math.max(1, (state.completedCycles || 0) + (windowIsFinished(state) ? 0 : 1)))
  const sell = params.sellRate && params.sellRate > 0 ? params.sellRate : 0
  const cost = params.costRate && params.costRate > 0 ? params.costRate : 0
  const liveSpread = sell > 0 && cost > 0 ? roundMoney(sell - cost) : 0
  const projectedRemainingMzn = liveSpread > 0 ? roundMoney(residual * liveSpread) : 0
  const projectedRemainingZar =
    cost > 0 && liveSpread > 0 ? roundMoney((residual * liveSpread) / cost) : 0
  const open = params.current
  const awaiting = params.awaitingKind || open?.kind || 'deploy'
  const nextAction =
    windowIsFinished(state)
      ? 'The book is at R0. Sam can open the next window from the ZAR wallet.'
      : awaiting === 'replenish'
        ? `Amina is waiting on the restock of ${formatZar(open?.amountZar || state.bufferUsed)}.`
        : `Leo is waiting on the ZAR sale of ${formatZar(open?.amountZar || 0)}.`

  const snapshot = [
    windowIsFinished(state)
      ? `This 14-weekday window is finished. ${formatZar(0)} of ${formatZar(authorised)} left to convert.`
      : `Day ${day} of ${days} is open. ${formatZar(residual)} of ${formatZar(authorised)} still to convert.`,
    nextAction,
    `Converted so far: ${formatZar(converted)}. Spread earned: ${formatZar(earned)}.`,
    wallet > 0 ? `ZAR wallet: ${formatZar(wallet)}.` : 'ZAR wallet: empty.',
    liveSpread > 0 && residual > 0
      ? `At the live spread of ${liveSpread.toFixed(2)} Mt/R, the remaining book would earn about ${formatZar(projectedRemainingZar)} (${projectedRemainingMzn.toFixed(2)} Mt).`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  const cycles = [...(params.recentCycles || [])]
    .filter((row) => row.cycleNumber > 0)
    .sort((a, b) => a.cycleNumber - b.cycleNumber)

  const tables: DeskTable[] = []
  const windowRows = cycles.map((row) => {
    const sold = roundMoney(
      row.deployedAmount ?? row.assignments.reduce((sum, item) => sum + (item.amount || 0), 0)
    )
    return { cells: [dayLabel(row.cycleNumber), row.status || '—', formatZar(sold)] }
  })
  if (windowRows.length) {
    tables.push({
      id: 'window',
      title: 'Window so far',
      columns: ['Day', 'Status', 'Converted'],
      rows: windowRows,
    })
  }

  tables.push({
    id: 'capital',
    title: 'Capital',
    columns: ['', 'ZAR'],
    rows: [
      { cells: ['Authorised', formatZar(authorised)] },
      { cells: ['Converted', formatZar(converted)] },
      { cells: ['Residual', formatZar(residual)] },
      { cells: ['Wallet', formatZar(wallet)] },
      { cells: ['Spread earned', formatZar(earned)] },
    ],
  })

  if (open?.assignments.length) {
    tables.push({
      id: 'tickets',
      title: awaiting === 'replenish' ? 'Tickets to restock' : 'Tickets to sell',
      columns: ['Card', 'Rail', 'ZAR'],
      rows: open.assignments.map((row) => ({
        cells: [cardShortName(row.cardId), machineShortName(row.machineId), formatZar(row.amount)],
      })),
    })
  }

  const cardRows = state.cards
    .filter((card) => card.volume > 0 || card.lastCycleUsed > 0)
    .map((card) => ({
      cells: [cardShortName(card.id), String(card.activeCycles || 0), formatZar(card.volume || 0)],
    }))
  if (cardRows.length) {
    tables.push({
      id: 'cards',
      title: 'Cards in this window',
      columns: ['Card', 'Days used', 'Volume'],
      rows: cardRows,
    })
  }

  const charts: DeskChart[] = []
  let running = 0
  const convertedPoints: DeskChartPoint[] = [{ label: 'Start', value: 0 }]
  const residualPoints: DeskChartPoint[] = [{ label: 'Start', value: authorised }]
  for (const row of cycles) {
    const sold = roundMoney(
      row.deployedAmount ?? row.assignments.reduce((sum, item) => sum + (item.amount || 0), 0)
    )
    if (row.status === 'completed') running = roundMoney(running + sold)
    convertedPoints.push({ label: dayLabel(row.cycleNumber), value: running })
    residualPoints.push({
      label: dayLabel(row.cycleNumber),
      value: roundMoney(Math.max(0, authorised - running)),
    })
  }
  if (convertedPoints.length === 1) {
    convertedPoints.push({ label: `Day ${day}`, value: converted })
    residualPoints.push({ label: `Day ${day}`, value: residual })
  }
  charts.push({
    id: 'capital',
    title: 'Capital through the window',
    unit: 'ZAR',
    series: [
      { label: 'Converted', points: convertedPoints },
      { label: 'Residual', points: residualPoints },
    ],
  })

  const profitPoints: DeskChartPoint[] = [{ label: 'Earned', value: earned }]
  if (projectedRemainingZar > 0) {
    profitPoints.push({ label: 'Projected remaining', value: projectedRemainingZar })
    profitPoints.push({ label: 'Projected total', value: roundMoney(earned + projectedRemainingZar) })
  }
  charts.push({
    id: 'profit',
    title: projectedRemainingZar > 0 ? 'Spread earned and projected' : 'Spread earned',
    unit: 'ZAR',
    series: [{ label: 'Spread', points: profitPoints }],
  })

  charts.push({
    id: 'window',
    title: 'Residual left to convert',
    unit: 'ZAR',
    series: [{ label: 'Residual', points: residualPoints }],
  })

  return { snapshot, tables, charts }
}

export function catalogText(visuals: DeskVisuals): string {
  const tables = visuals.tables
    .map((table) => {
      const rows = table.rows.map((row) => row.cells.join(' | ')).join('\n')
      return `Table ${table.id} "${table.title}": ${table.columns.join(' | ')}\n${rows}`
    })
    .join('\n\n')
  const charts = visuals.charts
    .map((chart) => {
      const series = chart.series
        .map((row) => `${row.label}: ${row.points.map((point) => `${point.label}=${point.value}`).join(', ')}`)
        .join('; ')
      return `Chart ${chart.id} "${chart.title}" (${chart.unit}): ${series}`
    })
    .join('\n')
  return [visuals.snapshot, tables, charts].filter(Boolean).join('\n\n')
}

export function pickDeskTable(tables: DeskTable[], id: string | null | undefined): DeskTable | undefined {
  if (!id) return undefined
  return tables.find((row) => row.id === id)
}

export function pickDeskChart(charts: DeskChart[], id: string | null | undefined): DeskChart | undefined {
  if (!id) return undefined
  return charts.find((row) => row.id === id)
}

export function suggestVisuals(
  message: string,
  visuals: DeskVisuals
): { table?: DeskTable; chart?: DeskChart } {
  const text = message.toLowerCase()
  const wantsChart = /\b(graph|chart|plot|visuali[sz]e|project(?:ed|ion)s?|forecast)\b/.test(text)
  const wantsTable = /\b(table|breakdown|tabulate|by day|per day|day by day)\b/.test(text)
  if (!wantsChart && !wantsTable) return {}
  const wantsProfit = /\b(profits?|spread|earn(?:ed|ings?)?)\b/.test(text)
  const wantsCapital = /\b(capital|wallet|residual|authorised|authorized|converted)\b/.test(text)
  let chart: DeskChart | undefined
  if (wantsChart) {
    chart = wantsProfit
      ? pickDeskChart(visuals.charts, 'profit')
      : pickDeskChart(visuals.charts, wantsCapital ? 'capital' : 'window')
  }
  let table: DeskTable | undefined
  if (wantsTable) {
    if (/\btickets?\b/.test(text)) table = pickDeskTable(visuals.tables, 'tickets')
    else if (wantsCapital) table = pickDeskTable(visuals.tables, 'capital')
    else table = pickDeskTable(visuals.tables, 'window') || pickDeskTable(visuals.tables, 'capital')
  }
  return { table, chart }
}

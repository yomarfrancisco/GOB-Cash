/**
 * Buy ZAR desk narrative (Steps 1–6) for `$` capital shocks that fund MZN → ROUTE → cashZAR.
 * Rail for Step 2 invoices follows the day's channel split (card / EFT / mixed).
 */
import * as admin from 'firebase-admin'
import { channelMixOf, splitReplacementChannels } from '../routing/channelSplit'

function db() {
  return admin.firestore()
}

export const BUY_DESK_TITLES = {
  1: 'Step 1 · MZN funded',
  2: 'Step 2 · FX invoices raised',
  3: 'Step 3 · ZAR booked',
  4: 'Step 4 · Clear ROUTE',
  5: 'Step 5 · Place ZAR',
  6: 'Step 6 · Day lookback',
} as const

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function formatZar(value: number): string {
  return `R${roundMoney(value).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatMzn(value: number): string {
  return `${roundMoney(value).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MZN`
}

function formatRate(rate: number): string {
  return `${rate.toFixed(4)} MZN/ZAR`
}

function settleLabel(settleAtMs: number): string {
  const SAST_OFFSET_MS = 2 * 60 * 60 * 1000
  return new Date(settleAtMs + SAST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')
}

function stepId(txId: string, step: 1 | 2 | 3 | 4 | 5 | 6): string {
  return `${txId}-buy-${step}`
}

export type BuyZarDeskSeedParams = {
  userId: string
  txId: string
  amountMzn: number
  amountZar: number
  costRate: number
  sellRate: number
  settleAtMs: number
}

/** Steps 1–3 right after Buy ZAR books onto ROUTE. */
export async function seedBuyZarDeskDay(params: BuyZarDeskSeedParams): Promise<void> {
  const amountZar = roundMoney(params.amountZar)
  const amountMzn = roundMoney(params.amountMzn)
  if (!(amountZar > 0) || !(amountMzn > 0)) return

  const split = splitReplacementChannels({
    amountZar,
    nowMs: Date.now(),
    shockId: params.txId,
  })
  const mix = channelMixOf(split)
  const railLabel =
    mix === 'mixed' ? 'Card + EFT' : mix === 'eft' ? 'EFT' : 'Card'
  const now = admin.firestore.Timestamp.now()
  const baseMs = Date.now()
  const events = db().collection('users').doc(params.userId).collection('activityEvents')
  const common = {
    kind: 'CONVERSION_ROUTING_INSTRUCTION',
    actorType: 'ai_manager',
    routingAction: 'step',
    narrative: 'buy_zar',
    buyDayId: params.txId,
    txId: params.txId,
    amountCurrency: 'ZAR' as const,
    amountValue: amountZar,
    amountSign: 'credit' as const,
    pairedAmountValue: amountMzn,
    awaitingConfirm: false,
    hasDownloadButton: false,
    status: 'recorded',
    recordingSource: 'USER_UI',
    channelMix: mix,
  }

  const step2Rows: Array<{
    label: string
    value: string
    valueStrong?: boolean
    secondLine?: string
  }> = [
    {
      label: 'Plan rail',
      value: railLabel,
      valueStrong: true,
      secondLine: 'From today’s buy plan',
    },
  ]
  if (split.cardZar > 0) {
    step2Rows.push({
      label: 'Card pack',
      value: formatZar(split.cardZar),
      valueStrong: true,
      secondLine: `${split.cardTickets.length} ticket(s) @ COST`,
    })
  }
  if (split.eftZar > 0) {
    step2Rows.push({
      label: 'EFT pack',
      value: formatZar(split.eftZar),
      valueStrong: true,
      secondLine: `${split.eftTickets.length} instruction(s) · Moz→SA`,
    })
  }
  step2Rows.push({
    label: 'Against MZN',
    value: formatMzn(amountMzn),
    secondLine: formatRate(params.costRate),
  })

  const writes: Array<{ id: string; data: Record<string, unknown> }> = [
    {
      id: stepId(params.txId, 1),
      data: {
        ...common,
        id: stepId(params.txId, 1),
        title: BUY_DESK_TITLES[1],
        deskStep: 1,
        deskSpeaker: 'sam',
        deskStatusChip: 'Funded',
        deskSentence: `${formatMzn(amountMzn)} funded to buy ${formatZar(amountZar)}.`,
        body: `${formatMzn(amountMzn)} funded to buy ${formatZar(amountZar)}.`,
        deskLedgerRows: [
          { label: 'Funded', value: formatMzn(amountMzn), valueStrong: true },
          {
            label: 'Target ZAR',
            value: formatZar(amountZar),
            valueStrong: true,
            secondLine: `at cost ${formatRate(params.costRate)}`,
          },
          {
            label: 'Sell ref',
            value: formatRate(params.sellRate),
            secondLine: 'Reference only',
          },
        ],
        deskNextFooter: 'Step 2 · FX invoices raised',
        createdAt: admin.firestore.Timestamp.fromMillis(baseMs),
        updatedAt: now,
      },
    },
    {
      id: stepId(params.txId, 2),
      data: {
        ...common,
        id: stepId(params.txId, 2),
        title: BUY_DESK_TITLES[2],
        deskStep: 2,
        deskSpeaker: 'sam',
        deskStatusChip: 'Invoiced',
        deskSentence: `Invoices raised to source ${formatZar(amountZar)} against funded MZN (${railLabel}).`,
        body: `Invoices raised to source ${formatZar(amountZar)} against funded MZN (${railLabel}).`,
        deskLedgerRows: step2Rows,
        deskNextFooter: 'Step 3 · ZAR booked',
        createdAt: admin.firestore.Timestamp.fromMillis(baseMs + 1),
        updatedAt: now,
      },
    },
    {
      id: stepId(params.txId, 3),
      data: {
        ...common,
        id: stepId(params.txId, 3),
        title: BUY_DESK_TITLES[3],
        deskStep: 3,
        deskSpeaker: 'sam',
        deskStatusChip: 'Booked',
        deskSentence: `${formatZar(amountZar)} booked on ROUTE until ~09:00 (${settleLabel(params.settleAtMs)} SAST).`,
        body: `${formatZar(amountZar)} booked on ROUTE until ~09:00.`,
        dropdownBody: `Booked · clears ~09:00`,
        deskLedgerRows: [
          {
            label: 'MZN out',
            value: formatMzn(amountMzn),
            valueStrong: true,
          },
          {
            label: 'ZAR on ROUTE',
            value: formatZar(amountZar),
            valueStrong: true,
            secondLine: formatRate(params.costRate),
          },
          {
            label: 'Clear',
            value: '~09:00 SAST',
            secondLine: settleLabel(params.settleAtMs),
          },
        ],
        deskNextFooter: 'Step 4 · Clear ROUTE',
        kind: 'EN_ROUTE_BOOKED',
        routingAction: 'en_route',
        createdAt: admin.firestore.Timestamp.fromMillis(baseMs + 2),
        updatedAt: now,
      },
    },
  ]

  const batch = db().batch()
  for (const row of writes) {
    batch.set(events.doc(row.id), row.data, { merge: true })
  }
  await batch.commit()
}

export type BuyZarDeskClearParams = {
  userId: string
  txId: string
  amountMzn: number
  amountZar: number
  costRate: number
}

/** Steps 4–6 when ROUTE clears into cashZAR. */
export async function completeBuyZarDeskDayAfterClear(params: BuyZarDeskClearParams): Promise<void> {
  const amountZar = roundMoney(params.amountZar)
  const amountMzn = roundMoney(params.amountMzn)
  if (!(amountZar > 0)) return

  const step3Ref = db()
    .collection('users')
    .doc(params.userId)
    .collection('activityEvents')
    .doc(stepId(params.txId, 3))
  const step3Snap = await step3Ref.get()
  // Only complete the buy chain when Steps 1–3 were seeded for this tx.
  if (!step3Snap.exists || step3Snap.data()?.narrative !== 'buy_zar') return

  const now = admin.firestore.Timestamp.now()
  const baseMs = Date.now()
  const events = db().collection('users').doc(params.userId).collection('activityEvents')
  const common = {
    kind: 'CONVERSION_ROUTING_INSTRUCTION',
    actorType: 'ai_manager',
    routingAction: 'step',
    narrative: 'buy_zar',
    buyDayId: params.txId,
    txId: params.txId,
    amountCurrency: 'ZAR' as const,
    amountValue: amountZar,
    amountSign: 'credit' as const,
    pairedAmountValue: amountMzn,
    awaitingConfirm: false,
    hasDownloadButton: false,
    status: 'recorded',
    recordingSource: 'SYSTEM',
  }

  const batch = db().batch()
  batch.set(
    step3Ref,
    {
      deskStatusChip: 'Cleared',
      updatedAt: now,
    },
    { merge: true }
  )

  batch.set(
    events.doc(stepId(params.txId, 4)),
    {
      ...common,
      id: stepId(params.txId, 4),
      title: BUY_DESK_TITLES[4],
      deskStep: 4,
      deskSpeaker: 'leo',
      deskStatusChip: 'Cleared',
      deskSentence: `ROUTE cleared · ${formatZar(amountZar)} now in ZAR inventory.`,
      body: `ROUTE cleared · ${formatZar(amountZar)} now in ZAR inventory.`,
      deskLedgerRows: [
        {
          label: 'Cleared ZAR',
          value: formatZar(amountZar),
          valueStrong: true,
          secondLine: formatRate(params.costRate),
        },
        { label: 'ROUTE left', value: formatZar(0) },
        { label: 'From MZN', value: formatMzn(amountMzn) },
      ],
      deskNextFooter: 'Step 5 · Place ZAR',
      kind: 'EN_ROUTE_CLEARED',
      routingAction: 'en_route_clear',
      createdAt: admin.firestore.Timestamp.fromMillis(baseMs),
      updatedAt: now,
      clearedAt: now,
    },
    { merge: true }
  )

  batch.set(
    events.doc(stepId(params.txId, 5)),
    {
      ...common,
      id: stepId(params.txId, 5),
      title: BUY_DESK_TITLES[5],
      deskStep: 5,
      deskSpeaker: 'leo',
      deskStatusChip: 'Hold',
      deskSentence: `Place ${formatZar(amountZar)} in the window or hold as inventory.`,
      body: `Place ${formatZar(amountZar)} in the window or hold as inventory.`,
      deskLedgerRows: [
        {
          label: 'Available ZAR',
          value: formatZar(amountZar),
          valueStrong: true,
        },
        { label: 'Allocated', value: formatZar(0) },
        { label: 'Held', value: formatZar(amountZar), secondLine: 'Default after clear' },
      ],
      deskNextFooter: 'Step 6 · Day lookback',
      createdAt: admin.firestore.Timestamp.fromMillis(baseMs + 1),
      updatedAt: now,
    },
    { merge: true }
  )

  batch.set(
    events.doc(stepId(params.txId, 6)),
    {
      ...common,
      id: stepId(params.txId, 6),
      title: BUY_DESK_TITLES[6],
      deskStep: 6,
      deskSpeaker: 'sam',
      deskStatusChip: 'Done',
      deskSentence: `Day closed · funded ${formatMzn(amountMzn)} → booked → cleared ${formatZar(amountZar)}.`,
      body: `Day closed · funded ${formatMzn(amountMzn)} → booked → cleared ${formatZar(amountZar)}.`,
      deskLedgerRows: [
        { label: 'Funded', value: formatMzn(amountMzn) },
        { label: 'Booked', value: formatZar(amountZar) },
        {
          label: 'Cleared',
          value: formatZar(amountZar),
          valueStrong: true,
          secondLine: 'In ZAR inventory',
        },
      ],
      createdAt: admin.firestore.Timestamp.fromMillis(baseMs + 2),
      updatedAt: now,
    },
    { merge: true }
  )

  await batch.commit()
}

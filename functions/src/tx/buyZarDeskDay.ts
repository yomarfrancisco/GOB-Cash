/**
 * Buy ZAR desk narrative (Steps 1–6) for `$` capital shocks that fund MZN → ROUTE → cashZAR.
 * Same desk team as Sell: Moz Bank Liaison (amina) on the MZN/invoice leg,
 * SA Bank Liaison (leo) on ROUTE/ZAR, Routing Manager (sam) on lookback.
 * Card + machine names come from the live inventory catalogs.
 */
import * as admin from 'firebase-admin'
import { channelMixOf, splitReplacementChannels } from '../routing/channelSplit'
import {
  DEFAULT_CARDS,
  DEFAULT_MACHINES,
  isForbiddenPair,
  type NamedResource,
} from '../routing/inventory'

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

type DeskSpeaker = 'sam' | 'leo' | 'amina'

type LedgerRow = {
  label: string
  value: string
  valueStrong?: boolean
  secondLine?: string
}

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

function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic card↔SA terminal pairs from inventory (same catalogs as Sell). */
export function pickBuyPlanAssignments(
  shockId: string,
  ticketCount: number
): Array<{ card: NamedResource; machine: NamedResource }> {
  const count = Math.max(1, Math.min(ticketCount, 4))
  const seed = hashSeed(shockId || 'buy')
  const out: Array<{ card: NamedResource; machine: NamedResource }> = []
  for (let i = 0; i < count; i++) {
    const card = DEFAULT_CARDS[(seed + i * 3) % DEFAULT_CARDS.length]!
    let machine = DEFAULT_MACHINES[(seed + i * 5) % DEFAULT_MACHINES.length]!
    for (let attempt = 0; attempt < DEFAULT_MACHINES.length; attempt++) {
      const candidate = DEFAULT_MACHINES[(seed + i * 5 + attempt) % DEFAULT_MACHINES.length]!
      if (!isForbiddenPair(card.id, candidate.id)) {
        machine = candidate
        break
      }
    }
    out.push({ card, machine })
  }
  return out
}

function cardBankLabel(card: NamedResource): string {
  return `${card.shortName} · ${card.mozBank || 'Moz bank'}`
}

function saRailLabel(machine: NamedResource): string {
  return machine.shortName
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
  const cardTicketCount = Math.max(1, split.cardTickets.length || (split.cardZar > 0 ? 1 : 0))
  const assignments = pickBuyPlanAssignments(
    params.txId,
    Math.max(cardTicketCount, split.eftTickets.length || 0, 1)
  )
  const primary = assignments[0]!
  const now = admin.firestore.Timestamp.now()
  const baseMs = Date.now()
  const events = db().collection('users').doc(params.userId).collection('activityEvents')
  const common = {
    kind: 'CONVERSION_ROUTING_INSTRUCTION' as const,
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
    buyCardId: primary.card.id,
    buyMachineId: primary.machine.id,
    buyMozBank: primary.card.mozBank || null,
    buySaRail: primary.machine.shortName,
  }

  const step2Rows: LedgerRow[] = [
    {
      label: 'Plan rail',
      value: railLabel,
      valueStrong: true,
      secondLine: 'From today’s buy plan',
    },
  ]
  if (split.cardZar > 0) {
    const perTicket = roundMoney(split.cardZar / Math.max(1, assignments.length))
    assignments.forEach((row, index) => {
      const zar =
        index === assignments.length - 1
          ? roundMoney(split.cardZar - perTicket * (assignments.length - 1))
          : perTicket
      if (!(zar > 0) && index > 0) return
      step2Rows.push({
        label: `Card · ${row.card.shortName}`,
        value: formatZar(zar > 0 ? zar : split.cardZar),
        valueStrong: true,
        secondLine: `${row.card.mozBank || 'Moz bank'} · @ COST`,
      })
      step2Rows.push({
        label: 'SA terminal',
        value: saRailLabel(row.machine),
        secondLine: 'POS · South Africa',
      })
    })
  }
  if (split.eftZar > 0) {
    step2Rows.push({
      label: 'EFT · Moz→SA',
      value: formatZar(split.eftZar),
      valueStrong: true,
      secondLine: `${primary.card.mozBank || 'Moz bank'} → ${saRailLabel(primary.machine)}`,
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
        deskSpeaker: 'amina' satisfies DeskSpeaker,
        deskStatusChip: 'Funded',
        deskSentence: `${formatMzn(amountMzn)} funded at ${primary.card.mozBank || 'Moz bank'} (${primary.card.shortName}) to buy ${formatZar(amountZar)}.`,
        body: `${formatMzn(amountMzn)} funded at ${primary.card.mozBank || 'Moz bank'} to buy ${formatZar(amountZar)}.`,
        deskLedgerRows: [
          {
            label: 'Funded',
            value: formatMzn(amountMzn),
            valueStrong: true,
            secondLine: cardBankLabel(primary.card),
          },
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
        deskSpeaker: 'amina' satisfies DeskSpeaker,
        deskStatusChip: 'Invoiced',
        deskSentence: `Invoices raised via ${primary.card.mozBank || 'Moz banks'} to source ${formatZar(amountZar)} (${railLabel}).`,
        body: `Invoices raised via ${primary.card.mozBank || 'Moz banks'} to source ${formatZar(amountZar)} (${railLabel}).`,
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
        deskSpeaker: 'leo' satisfies DeskSpeaker,
        deskStatusChip: 'Booked',
        deskSentence: `${formatZar(amountZar)} booked on ROUTE via ${saRailLabel(primary.machine)} until ~09:00 (${settleLabel(params.settleAtMs)} SAST).`,
        body: `${formatZar(amountZar)} booked on ROUTE via ${saRailLabel(primary.machine)} until ~09:00.`,
        dropdownBody: `Booked · ${saRailLabel(primary.machine)} · clears ~09:00`,
        deskLedgerRows: [
          {
            label: 'MZN out',
            value: formatMzn(amountMzn),
            valueStrong: true,
            secondLine: cardBankLabel(primary.card),
          },
          {
            label: 'ZAR on ROUTE',
            value: formatZar(amountZar),
            valueStrong: true,
            secondLine: formatRate(params.costRate),
          },
          {
            label: 'SA rail',
            value: saRailLabel(primary.machine),
            secondLine: `Clear ~09:00 · ${settleLabel(params.settleAtMs)} SAST`,
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

  const prior = step3Snap.data() || {}
  const assignments = pickBuyPlanAssignments(params.txId, 1)
  const primary = assignments[0]!
  const mozBank =
    typeof prior.buyMozBank === 'string' && prior.buyMozBank
      ? prior.buyMozBank
      : primary.card.mozBank || 'Moz bank'
  const saRail =
    typeof prior.buySaRail === 'string' && prior.buySaRail
      ? prior.buySaRail
      : saRailLabel(primary.machine)
  const cardShort =
    DEFAULT_CARDS.find((row) => row.id === Number(prior.buyCardId))?.shortName ||
    primary.card.shortName

  const now = admin.firestore.Timestamp.now()
  const baseMs = Date.now()
  const events = db().collection('users').doc(params.userId).collection('activityEvents')
  const common = {
    kind: 'CONVERSION_ROUTING_INSTRUCTION' as const,
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
    buyMozBank: mozBank,
    buySaRail: saRail,
  }

  const batch = db().batch()
  batch.set(
    step3Ref,
    {
      deskStatusChip: 'Cleared',
      deskSpeaker: 'leo',
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
      deskSpeaker: 'leo' satisfies DeskSpeaker,
      deskStatusChip: 'Cleared',
      deskSentence: `ROUTE cleared at ${saRail} · ${formatZar(amountZar)} now in ZAR inventory.`,
      body: `ROUTE cleared at ${saRail} · ${formatZar(amountZar)} now in ZAR inventory.`,
      deskLedgerRows: [
        {
          label: 'Cleared ZAR',
          value: formatZar(amountZar),
          valueStrong: true,
          secondLine: formatRate(params.costRate),
        },
        {
          label: 'SA rail',
          value: saRail,
          secondLine: 'Cleared into inventory',
        },
        {
          label: 'From MZN',
          value: formatMzn(amountMzn),
          secondLine: `${cardShort} · ${mozBank}`,
        },
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
      deskSpeaker: 'leo' satisfies DeskSpeaker,
      deskStatusChip: 'Hold',
      deskSentence: `Place ${formatZar(amountZar)} via ${saRail} in the window or hold as inventory.`,
      body: `Place ${formatZar(amountZar)} via ${saRail} in the window or hold as inventory.`,
      deskLedgerRows: [
        {
          label: 'Available ZAR',
          value: formatZar(amountZar),
          valueStrong: true,
          secondLine: saRail,
        },
        { label: 'Allocated', value: formatZar(0) },
        {
          label: 'Held',
          value: formatZar(amountZar),
          secondLine: 'Default after clear',
        },
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
      deskSpeaker: 'sam' satisfies DeskSpeaker,
      deskStatusChip: 'Done',
      deskSentence: `Day closed · ${cardShort} at ${mozBank} → ${saRail} cleared ${formatZar(amountZar)}.`,
      body: `Day closed · ${cardShort} at ${mozBank} → ${saRail} cleared ${formatZar(amountZar)}.`,
      deskLedgerRows: [
        {
          label: 'Funded',
          value: formatMzn(amountMzn),
          secondLine: `${cardShort} · ${mozBank}`,
        },
        {
          label: 'Booked',
          value: formatZar(amountZar),
          secondLine: saRail,
        },
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

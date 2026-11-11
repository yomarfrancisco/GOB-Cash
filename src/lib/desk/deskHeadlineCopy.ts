/**
 * Client-only headline / one-liner overrides for the $-desk chat.
 * Presentation layer — does not rewrite Firestore titles.
 */

import type { ActivityItem } from '@/store/activity'
import {
  formatDeskMajorMzn,
  formatDeskMajorZar,
  formatDeskMinorMzn,
  formatDeskMinorZar,
} from '@/lib/desk/deskMoneyFormat'
import { sastParts } from '@/lib/routing/routingTime'

function isScheduledLiquidPayout(item: ActivityItem): boolean {
  if (item.routingAction !== 'daily_liquid_zar_payout') return false
  if ((item as { payoutScheduled?: boolean }).payoutScheduled === true) return true
  return /^scheduled$/i.test(String(item.deskPendingChip || ''))
}

function isPaidLiquidPayout(item: ActivityItem): boolean {
  if (item.routingAction !== 'daily_liquid_zar_payout') return false
  if (isScheduledLiquidPayout(item)) return false
  return (
    /^paid$/i.test(String(item.deskStatusChip || '')) ||
    /^withdrawn$/i.test(String(item.deskStatusChip || '')) ||
    Boolean(item.deskSentence)
  )
}

export type DeskHeadlineCopy = {
  headline: string
  line: string
  /** Optional small meta under the one-liner (e.g. ref ··3646). */
  smallMeta?: string
}

const HEADLINE_ACTIONS = new Set([
  'fund_intro',
  'fund_wire',
  'bank_notice',
  'routing_plan',
  'liquid_now',
  'payout_details_request',
  'payout_confirmed',
  'youre_set_up',
  'daily_liquid_zar_payout',
])

export function usesHeadlineStyle(item: ActivityItem): boolean {
  if (item.liquidityReport) return true
  if (item.routingPlan) return true
  if (item.routingAction && HEADLINE_ACTIONS.has(item.routingAction)) return true
  return false
}

export function formatDeskClock(ms: number): string {
  const p = sastParts(ms)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

function parseMajor(raw: string | undefined | null): number | null {
  if (!raw) return null
  const cleaned = String(raw).replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function maskRef(ref: string): string {
  const digits = ref.replace(/\s/g, '')
  if (digits.length < 4) return ref
  return `··${digits.slice(-4)}`
}

function bankTagFromItem(item: ActivityItem): string {
  const planTag = item.routingPlan?.payoutBankTag?.trim()
  if (planTag) return planTag
  const payout =
    String((item as { payoutBankTag?: string }).payoutBankTag || '').trim() ||
    item.deskLedgerRows?.find((r) => /^to$/i.test(r.label) || /^payout to$/i.test(r.label))?.value?.trim()
  if (payout) return payout
  return 'your bank'
}

function mznReceivedAmount(item: ActivityItem): number {
  const fromAmount = typeof item.amount?.value === 'number' ? Math.abs(item.amount.value) : null
  if (fromAmount != null && fromAmount > 0) return fromAmount
  const total = item.deskLedgerRows?.find((r) => /total/i.test(r.label))?.value
  return parseMajor(total) ?? 0
}

function paidZar(item: ActivityItem): number {
  return (
    parseMajor(item.deskLedgerRows?.find((row) => /^paid$/i.test(row.label))?.value) ??
    (typeof item.amount?.value === 'number' ? Math.abs(item.amount.value) : 0)
  )
}

function scheduledZar(item: ActivityItem): number {
  if (typeof item.amount?.value === 'number') return Math.abs(item.amount.value)
  return (
    parseMajor(item.deskLedgerRows?.find((r) => /^liquid$/i.test(r.label))?.value) ?? 0
  )
}

function shortenFullLiquidLabel(label: string): string {
  // "Sat 14 Nov 09:00" → "Sat 09:00"; keep short clock labels as-is.
  const m = label.match(/^([A-Za-z]{3})\b.*?\b(\d{1,2}:\d{2})\b/)
  if (m) return `${m[1]} ${m[2]}`
  return label.replace(/\s+\d{1,2}\s+[A-Za-z]{3}\b/, '').trim() || label
}

/** Resolve headline + one-liner for gated desk messages. Null = keep default title/body. */
export function resolveDeskHeadlineCopy(item: ActivityItem): DeskHeadlineCopy | null {
  if (!usesHeadlineStyle(item)) return null

  if (item.liquidityReport) {
    const r = item.liquidityReport
    const when = shortenFullLiquidLabel(r.fullLiquidityLabel || 'soon')
    return {
      headline: `Fully liquid ${when}.`,
      line: `${formatDeskMinorZar(r.liquidZar)} of ${formatDeskMinorZar(r.fundedZar)} liquid now.`,
    }
  }

  const action = item.routingAction || ''

  if (action === 'fund_intro') {
    return {
      headline: 'Send MZN here.',
      line: 'The first R100,000 a day is instant. The rest is ready by 09:00.',
    }
  }

  if (action === 'fund_wire') {
    const zar =
      typeof item.fundTargetZar === 'number' && item.fundTargetZar > 0
        ? item.fundTargetZar
        : typeof item.amount?.value === 'number'
          ? item.amount.value
          : 0
    const mzn =
      typeof item.fundTargetMzn === 'number' && item.fundTargetMzn > 0
        ? item.fundTargetMzn
        : 0
    return {
      headline: mzn > 0 ? `Send ${formatDeskMajorMzn(mzn)}.` : 'Send MZN here.',
      line: zar > 0 ? `You get about ${formatDeskMinorZar(zar)}.` : 'Fund your ZAR payout.',
    }
  }

  if (action === 'bank_notice') {
    const mzn = mznReceivedAmount(item)
    const ref =
      item.paymentReference ||
      item.deskLedgerRows?.find((r) => /ref/i.test(r.label))?.value ||
      ''
    return {
      headline: mzn > 0 ? `${formatDeskMajorMzn(mzn)} received.` : 'MZN received.',
      line:
        mzn > 0
          ? `${formatDeskMinorMzn(mzn)} at Moza Banco. Converting to rand now.`
          : 'At Moza Banco. Converting to rand now.',
      smallMeta: ref ? `ref ${maskRef(ref)}` : undefined,
    }
  }

  if (item.routingPlan || action === 'routing_plan') {
    const plan = item.routingPlan
    if (!plan) {
      return {
        headline: 'Your routing plan.',
        line: 'Liquid parts land in steps.',
      }
    }
    const when = shortenFullLiquidLabel(plan.fullLiquidLabel || 'soon')
    return {
      headline: `${formatDeskMajorZar(plan.zarTotal)} by ${when}.`,
      line:
        plan.zarLiquid > 0.005
          ? `${formatDeskMinorZar(plan.zarLiquid)} is ready now. The rest lands in steps.`
          : 'The rest lands in steps.',
    }
  }

  if (action === 'payout_details_request' || (action === 'liquid_now' && !item.userReply)) {
    return {
      headline: 'Where should we pay?',
      line: "Your South African account, once. In your company's name.",
    }
  }

  if (action === 'payout_confirmed' || isPaidLiquidPayout(item)) {
    const zar = paidZar(item)
    const bank = bankTagFromItem(item)
    return {
      headline: zar > 0 ? `${formatDeskMajorZar(zar)} paid.` : 'Paid out.',
      line: `In ${bank}, after your MZN landed.`,
    }
  }

  if (action === 'youre_set_up') {
    const bank = bankTagFromItem(item)
    return {
      headline: "You're set up.",
      line: `Send MZN any time. We pay ${bank} automatically.`,
    }
  }

  if (isScheduledLiquidPayout(item)) {
    const zar = scheduledZar(item)
    const bank = bankTagFromItem(item)
    return {
      headline: zar > 0 ? `${formatDeskMajorZar(zar)} leaves at 09:15.` : 'Leaves at 09:15.',
      line: `To ${bank}. Change it before then if you need to.`,
    }
  }

  if (action === 'liquid_now') {
    const zar = typeof item.amount?.value === 'number' ? Math.abs(item.amount.value) : 0
    return {
      headline: zar > 0 ? `${formatDeskMajorZar(zar)} liquid now.` : 'Liquid now.',
      line: 'Ready to pay out to your South African account.',
    }
  }

  return null
}

/** Chips the headline already covers — hide on headline-style messages. */
export function shouldHideStatusChip(label: string | null | undefined): boolean {
  if (!label) return false
  return /^(paid|liquid now|payout account saved|you're set up|withdrawn)$/i.test(label.trim())
}

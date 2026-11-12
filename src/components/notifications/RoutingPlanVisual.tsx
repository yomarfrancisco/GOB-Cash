'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { ActivityItem } from '@/store/activity'
import {
  formatDeskMajorMzn,
  formatDeskMajorZar,
  formatDeskMinorMzn,
  formatDeskMinorZar,
} from '@/lib/desk/deskMoneyFormat'
import { nextSettleAt09hSastExclusive } from '@/lib/fx/transitDayClock'
import { sastParts } from '@/lib/routing/routingTime'
import styles from './RoutingPlanVisual.module.css'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MON = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

const FINAL_STRETCH_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

type PlanState = 'on_time' | 'late' | 'final' | 'arrived'

function formatWhenFull(ms: number): string {
  const p = sastParts(ms)
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')
  return `${WD[p.weekday]} ${p.day} ${MON[p.month - 1]} · ${hh}:${mm}`
}

function formatWhenShort(ms: number): string {
  const p = sastParts(ms)
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')
  return `${WD[p.weekday]} ${hh}:${mm}`
}

function formatSentLabel(ms: number): string {
  const p = sastParts(ms)
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')
  return `Sent ${WD[p.weekday]} ${hh}:${mm}`
}

function formatDayLabel(ms: number): string {
  const p = sastParts(ms)
  return `${WD[p.weekday]} ${p.day} ${MON[p.month - 1]}`
}

function formatDuration(ms: number): string {
  const abs = Math.max(0, ms)
  const totalMin = Math.round(abs / 60_000)
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin - days * 60 * 24) / 60)
  if (days > 0 && hours > 0) return `${days} day${days === 1 ? '' : 's'} ${hours} h`
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}`
  if (hours > 0) return `${hours} h`
  const mins = Math.max(1, totalMin)
  return `${mins} min`
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function legStatus(confidence: string, channel?: string): string {
  if (confidence === 'now' || channel === 'instant') return 'Ready'
  if (confidence === 'reserved') return 'Booked'
  return 'Estimated'
}

function legsByLanding(
  legs: NonNullable<ActivityItem['routingPlan']>['legs']
): NonNullable<ActivityItem['routingPlan']>['legs'] {
  return [...legs].sort((a, b) => {
    const aMs = a.landsAtMs == null ? 0 : a.landsAtMs
    const bMs = b.landsAtMs == null ? 0 : b.landsAtMs
    return aMs - bMs
  })
}

function resolveArrivalMs(plan: NonNullable<ActivityItem['routingPlan']>, nowMs: number): number {
  if (typeof plan.fullLiquidAtMs === 'number' && plan.fullLiquidAtMs > 0) {
    return plan.fullLiquidAtMs
  }
  const times = (plan.legs || [])
    .map((l) => l.landsAtMs)
    .filter((t): t is number => typeof t === 'number' && t > 0)
  if (times.length) return Math.max(...times)
  return nextSettleAt09hSastExclusive(nowMs)
}

function resolvePlanState(params: {
  nowMs: number
  arriveAtMs: number
  zarInBank: number
  zarTotal: number
  mznResidual: number
}): PlanState {
  const { nowMs, arriveAtMs, zarInBank, zarTotal, mznResidual } = params
  const fullyPaid =
    zarTotal > 0.005 && zarInBank + 0.5 >= zarTotal && !(mznResidual > 0.005)
  if (fullyPaid || (nowMs >= arriveAtMs && !(mznResidual > 0.005) && zarInBank + 0.5 >= zarTotal * 0.98)) {
    return 'arrived'
  }
  if (nowMs > arriveAtMs) return 'late'
  if (arriveAtMs - nowMs <= FINAL_STRETCH_MS) return 'final'
  return 'on_time'
}

export function formatRoutingPlanDeskSentence(
  plan: NonNullable<ActivityItem['routingPlan']>,
  item?: ActivityItem
): string {
  const nowMs = Date.now()
  const arriveAtMs = resolveArrivalMs(plan, nowMs)
  const zarInBank = Math.max(0, Number(plan.zarLiquid) || 0)
  const zarTotal = Math.max(zarInBank, Number(plan.zarTotal) || 0)
  const mznResidual = Math.max(0, Number(plan.mznResidual) || 0)
  const state = resolvePlanState({ nowMs, arriveAtMs, zarInBank, zarTotal, mznResidual })
  const bankTag =
    String(plan.payoutBankTag || item?.payoutBankTag || '').trim() || 'your bank'

  if (state === 'arrived') {
    const late = nowMs > arriveAtMs
    const lateBit = late ? ` A ${formatDuration(nowMs - arriveAtMs)} late, inside our latest.` : ''
    return `Arrived ${formatWhenFull(nowMs).replace(' · ', ' ')}.${lateBit}`
  }
  if (state === 'late') {
    const remainingZar = Math.max(0, zarTotal - zarInBank)
    return `One bank is slow with ${formatDeskMinorZar(remainingZar)}. We moved it to another route. Nothing for you to do.`
  }
  if (state === 'final') {
    return `Booked with the bank. It goes to ${bankTag} when it clears.`
  }
  if (zarInBank > 0.005) {
    return `${formatDeskMinorZar(zarInBank)} is in your bank now. The rest is on its way.`
  }
  return 'The rest is on its way.'
}

export function routingPlanDisplayTitle(
  plan: NonNullable<ActivityItem['routingPlan']>,
  item?: ActivityItem
): string {
  void item
  const nowMs = Date.now()
  const arriveAtMs = resolveArrivalMs(plan, nowMs)
  const zarInBank = Math.max(0, Number(plan.zarLiquid) || 0)
  const zarTotal = Math.max(zarInBank, Number(plan.zarTotal) || 0)
  const mznResidual = Math.max(0, Number(plan.mznResidual) || 0)
  const state = resolvePlanState({ nowMs, arriveAtMs, zarInBank, zarTotal, mznResidual })
  const remainingZar = Math.max(0, zarTotal - zarInBank)

  if (state === 'arrived') return `All ${formatDeskMajorZar(zarTotal)} paid.`
  if (state === 'late') {
    const nextEta =
      arriveAtMs > nowMs ? arriveAtMs : nextSettleAt09hSastExclusive(nowMs)
    return `Running late. Now ${formatWhenShort(nextEta)}.`
  }
  if (state === 'final') {
    return `Last ${formatDeskMajorZar(remainingZar > 0.005 ? remainingZar : zarTotal)} lands soon.`
  }
  return `${formatDeskMajorZar(zarTotal)} by ${formatWhenShort(arriveAtMs)}.`
}

/** Arrival-time routing plan: Paid-out stack + arrival panel. */
export function RoutingPlanVisual({ item }: { item: ActivityItem }) {
  const plan = item.routingPlan
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [partsOpen, setPartsOpen] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  if (!plan) return null

  const zarInBank = Math.max(0, Number(plan.zarLiquid) || 0)
  const zarTotal = Math.max(zarInBank, Number(plan.zarTotal) || 0)
  const mznResidual = Math.max(0, Number(plan.mznResidual) || 0)
  const bankTag =
    String(plan.payoutBankTag || item.payoutBankTag || '').trim() || 'Your bank'
  const sentAtMs =
    typeof item.createdAt === 'number' && item.createdAt > 0 ? item.createdAt : nowMs
  const originalArriveAtMs = resolveArrivalMs(plan, nowMs)
  const state = resolvePlanState({
    nowMs,
    arriveAtMs: originalArriveAtMs,
    zarInBank,
    zarTotal,
    mznResidual,
  })
  const displayArriveAtMs =
    state === 'late' && originalArriveAtMs <= nowMs
      ? nextSettleAt09hSastExclusive(nowMs)
      : state === 'arrived'
        ? Math.max(originalArriveAtMs, nowMs)
        : originalArriveAtMs
  const latestAtMs = originalArriveAtMs + 2 * DAY_MS
  const pct =
    zarTotal > 0.005
      ? Math.max(0, Math.min(100, Math.round((zarInBank / zarTotal) * 100)))
      : 0
  const remainingMs = Math.max(0, displayArriveAtMs - nowMs)
  const spanMs = Math.max(1, displayArriveAtMs - sentAtMs)
  const elapsedPct =
    state === 'arrived'
      ? 100
      : Math.max(0, Math.min(100, ((nowMs - sentAtMs) / spanMs) * 100))
  const lateMs = Math.max(0, nowMs - originalArriveAtMs)
  const legs = legsByLanding(plan.legs || [])
  const partsCount = Math.max(1, legs.length)
  const arrived =
    state === 'arrived' || (pct >= 100 && !(mznResidual > 0.005))

  const pill =
    state === 'arrived'
      ? lateMs > 5 * 60_000
        ? { text: `${formatDuration(lateMs)} late`, tone: 'late' as const }
        : { text: 'On time', tone: 'ok' as const }
      : state === 'late'
        ? { text: `${formatDuration(lateMs)} late`, tone: 'late' as const }
        : state === 'final' && originalArriveAtMs !== displayArriveAtMs
          ? { text: 'On the new time', tone: 'ok' as const }
          : state === 'final'
            ? { text: 'On the new time', tone: 'ok' as const }
            : { text: 'On time', tone: 'ok' as const }

  const underLeft = formatSentLabel(sentAtMs)
  const underRight =
    state === 'arrived'
      ? `${formatDuration(Math.max(0, displayArriveAtMs - sentAtMs))} door to door`
      : remainingMs < 60 * 60_000
        ? 'minutes to go'
        : `${formatDuration(remainingMs)} to go`

  const panelNote =
    state === 'arrived'
      ? `${formatDeskMinorMzn(plan.fundedMzn)} in, ${formatDeskMinorZar(zarTotal)} out at ${Number(plan.rate || 0).toFixed(4)}.`
      : state === 'late'
        ? `Still inside our latest, ${formatDayLabel(latestAtMs)}.`
        : state === 'final'
          ? 'After this, everything you sent has been paid.'
          : `Latest ${formatDayLabel(latestAtMs)}. If a bank is slow, we switch route.`

  const partsToggleLabel = state === 'late' ? 'What changed' : 'When each part lands'

  return (
    <div className={styles.root} aria-label="Arrival plan">
      <div className={styles.stackWrap}>
        <div className={styles.stack}>
          <div className={[styles.peek, styles.peekMzn].join(' ')} aria-hidden>
            <span className={styles.peekLane}>MZN</span>
            <span className={styles.peekValue}>
              {formatDeskMajorMzn(mznResidual)} left
            </span>
          </div>
          <div className={[styles.peek, styles.peekZar].join(' ')} aria-hidden>
            <span className={styles.peekLane}>ZAR</span>
            <span className={styles.peekValue}>R 0 · all paid out</span>
          </div>
          <div className={styles.front}>
            <div className={styles.frontLane}>Your bank</div>
            <div className={styles.frontAmt}>{formatDeskMajorZar(zarInBank)}</div>
            <div className={styles.frontSub}>
              {arrived
                ? `received · ${partsCount} part${partsCount === 1 ? '' : 's'} · last ${String(sastParts(displayArriveAtMs).hour).padStart(2, '0')}:${String(sastParts(displayArriveAtMs).minute).padStart(2, '0')}`
                : `in your bank · ${pct}% of ${formatDeskMinorZar(zarTotal)}`}
            </div>
            <span className={styles.bankTag}>{bankTag}</span>
            {arrived ? (
              <span className={styles.check} aria-hidden>
                <Check size={16} strokeWidth={2.8} />
              </span>
            ) : (
              <span
                className={styles.liqTrack}
                role="img"
                aria-label={`${pct} percent in your bank`}
              >
                <span className={styles.liqFill} style={{ width: `${pct}%` }} />
              </span>
            )}
          </div>
        </div>
      </div>

      <section className={styles.panel} aria-label="Arrival">
        <div className={styles.panelHead}>
          <span className={styles.panelLabel}>
            {arrived ? 'Arrived' : 'All of it arrives'}
          </span>
          <span
            className={[
              styles.pill,
              pill.tone === 'late' ? styles.pillLate : styles.pillOk,
            ].join(' ')}
          >
            {pill.text}
          </span>
        </div>

        {state === 'final' && !arrived ? (
          <div className={styles.countdown}>{formatCountdown(remainingMs)}</div>
        ) : null}

        <div className={styles.arriveWhen}>{formatWhenFull(displayArriveAtMs)}</div>

        {state === 'late' && originalArriveAtMs < displayArriveAtMs ? (
          <div className={styles.wasWhen}>was {formatWhenFull(originalArriveAtMs)}</div>
        ) : null}

        <div className={styles.timeTrack} aria-hidden>
          <span className={styles.timeFill} style={{ width: `${elapsedPct}%` }} />
        </div>
        <div className={styles.timeMeta}>
          <span>{underLeft}</span>
          <span>{underRight}</span>
        </div>
        <p className={styles.panelNote}>{panelNote}</p>
      </section>

      {legs.length ? (
        <div className={styles.parts}>
          <button
            type="button"
            className={styles.partsToggle}
            aria-expanded={partsOpen}
            onClick={(event) => {
              event.stopPropagation()
              setPartsOpen((v) => !v)
            }}
          >
            <span>{partsToggleLabel}</span>
            <ChevronDown
              className={[styles.partsChevron, partsOpen ? styles.partsChevronOpen : '']
                .filter(Boolean)
                .join(' ')}
              size={16}
              strokeWidth={2.4}
              aria-hidden
            />
          </button>
          {partsOpen ? (
            <ul className={styles.partsList}>
              {legs.map((leg, i) => (
                <li key={`${leg.whenLabel}-${leg.amountZar}-${i}`} className={styles.partsRow}>
                  <span className={styles.partsWhen}>{leg.whenLabel.replace(/\s*·\s*/g, ' ')}</span>
                  <span className={styles.partsStatus}>
                    {legStatus(leg.confidence, leg.channel)}
                  </span>
                  <span className={styles.partsAmt}>{formatDeskMajorZar(leg.amountZar)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function hasRoutingPlan(item: ActivityItem): boolean {
  return Boolean(item.routingPlan?.legs?.length)
}

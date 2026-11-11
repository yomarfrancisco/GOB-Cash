'use client'

import { Check, CircleDashed, Star } from 'lucide-react'
import type { ActivityItem } from '@/store/activity'
import {
  formatDeskMajorMzn,
  formatDeskMajorZar,
  formatDeskMinorMzn,
  formatDeskMinorZar,
  formatDeskRateMtPerZar,
} from '@/lib/desk/deskMoneyFormat'
import { DeskDisclosure } from './DeskDisclosure'
import styles from './RoutingPlanVisual.module.css'

function LegIcon({ confidence }: { confidence: string }) {
  if (confidence === 'now') {
    return <Check className={`${styles.whenIcon} ${styles.whenIconNow}`} size={16} strokeWidth={2.6} aria-hidden />
  }
  if (confidence === 'reserved') {
    return <Star className={styles.whenIcon} size={16} strokeWidth={2.2} aria-hidden />
  }
  return <CircleDashed className={styles.whenIcon} size={16} strokeWidth={2.2} aria-hidden />
}

function statusWord(confidence: string): string {
  if (confidence === 'now') return 'Ready'
  if (confidence === 'reserved') return 'Booked'
  return 'Estimated'
}

function nextLeg(plan: NonNullable<ActivityItem['routingPlan']>) {
  return plan.legs.find((leg) => leg.confidence !== 'now' && Number(leg.amountZar) > 0.005) || null
}

/** Designer routing plan: stacked cards + timed legs (CTA lives on the desk action row). */
export function RoutingPlanVisual({ item }: { item: ActivityItem }) {
  const plan = item.routingPlan
  if (!plan) return null

  const mznBar = plan.fundedMzn > 0.005 ? Math.max(0, Math.min(100, (plan.mznResidual / plan.fundedMzn) * 100)) : 0
  const zarBar = Math.max(0, Math.min(100, plan.liquidPct))
  const upcoming = nextLeg(plan)
  const bank = plan.payoutBankTag?.trim() || 'your bank'

  return (
    <div className={styles.root} aria-label="Your routing plan">
      <div className={styles.stack}>
        <div className={`${styles.card} ${styles.cardMzn}`}>
          <div className={styles.lane}>MZN</div>
          <div className={styles.amt}>{formatDeskMajorMzn(plan.mznResidual)}</div>
          <div className={styles.sub}>
            converting · of {formatDeskMinorMzn(plan.fundedMzn)} in
          </div>
          <span className={styles.ratePill}>{formatDeskRateMtPerZar(plan.rate)}</span>
          <span className={styles.liqTrack} role="img" aria-label={`Routing ${Math.round(mznBar)} percent`}>
            <span className={styles.liqFill} style={{ width: `${mznBar}%` }} />
          </span>
        </div>

        <div className={styles.flowArrow} aria-hidden>
          ↓
        </div>

        <div className={`${styles.card} ${styles.cardZar}`}>
          <div className={styles.lane}>ZAR</div>
          <div className={styles.amt}>{formatDeskMajorZar(plan.zarLiquid)}</div>
          <div className={styles.sub}>
            ready now · {plan.liquidPct}% of {formatDeskMinorZar(plan.zarTotal)}
          </div>
          <span className={styles.liqTrack} role="img" aria-label={`Liquid ${plan.liquidPct} percent`}>
            <span className={styles.liqFill} style={{ width: `${zarBar}%` }} />
          </span>
        </div>
      </div>

      {upcoming ? (
        <div className={styles.nextRow} aria-label="Next landing">
          <span>Next · {upcoming.whenLabel}</span>
          <strong>{formatDeskMinorZar(upcoming.amountZar)}</strong>
        </div>
      ) : null}

      <DeskDisclosure label="When each part lands">
        <section className={styles.when} aria-label="When each part lands">
          <ul className={styles.whenList}>
            {plan.legs.map((leg, i) => (
              <li key={`${leg.whenLabel}-${leg.amountZar}-${i}`} className={styles.whenRow}>
                <LegIcon confidence={leg.confidence} />
                <div className={styles.whenBody}>
                  <div className={styles.whenTop}>
                    <span className={styles.whenWhen}>
                      {leg.confidence === 'now' ? 'Now' : leg.whenLabel}
                    </span>
                    <span className={styles.whenAmt}>{formatDeskMinorZar(leg.amountZar)}</span>
                  </div>
                  <div className={styles.whenSub}>{statusWord(leg.confidence)}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className={styles.whenTotal}>
            <span>Total</span>
            <span>{formatDeskMinorZar(plan.zarTotal)}</span>
          </div>
        </section>
        <p className={styles.note}>
          Each part pays out to {bank} as it lands. If a time moves, we&apos;ll tell you.
        </p>
      </DeskDisclosure>
    </div>
  )
}

export function hasRoutingPlan(item: ActivityItem): boolean {
  return Boolean(item.routingPlan?.legs?.length)
}

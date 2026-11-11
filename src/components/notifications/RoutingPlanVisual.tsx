'use client'

import { Check, CircleDashed } from 'lucide-react'
import type { ActivityItem } from '@/store/activity'
import {
  formatDeskMajorMzn,
  formatDeskMajorZar,
  formatDeskRateMtPerZar,
} from '@/lib/desk/deskMoneyFormat'
import styles from './RoutingPlanVisual.module.css'

function LegIcon({ confidence, channel }: { confidence: string; channel?: string }) {
  if (confidence === 'now' || channel === 'instant') {
    return <Check className={`${styles.whenIcon} ${styles.whenIconNow}`} size={16} strokeWidth={2.6} aria-hidden />
  }
  return <CircleDashed className={styles.whenIcon} size={16} strokeWidth={2.2} aria-hidden />
}

/** Client status only — never Card / EFT channel copy. */
function legStatus(confidence: string, channel?: string): string {
  if (confidence === 'now' || channel === 'instant') return 'Ready'
  return 'Booked'
}

/** Designer routing plan: stacked cards + timed legs (CTA lives on the desk action row). */
export function RoutingPlanVisual({ item }: { item: ActivityItem }) {
  const plan = item.routingPlan
  if (!plan) return null

  const mznBar =
    plan.fundedMzn > 0.005
      ? Math.max(0, Math.min(100, (plan.mznResidual / plan.fundedMzn) * 100))
      : 0
  const zarBar = Math.max(0, Math.min(100, plan.liquidPct))

  return (
    <div className={styles.root} aria-label="Your routing plan">
      <section className={styles.watch} aria-label="Conversion cards">
        <div className={styles.stack}>
          <div className={`${styles.card} ${styles.cardMzn}`}>
            <div className={styles.lane}>MZN</div>
            <div className={styles.amt}>{formatDeskMajorMzn(plan.mznResidual)}</div>
            <div className={styles.sub}>routing · of {formatDeskMajorMzn(plan.fundedMzn)} in</div>
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
              liquid now · {plan.liquidPct}% of {formatDeskMajorZar(plan.zarTotal)}
            </div>
            <span className={styles.liqTrack} role="img" aria-label={`Liquid ${plan.liquidPct} percent`}>
              <span className={styles.liqFill} style={{ width: `${zarBar}%` }} />
            </span>
          </div>
        </div>
      </section>

      <section className={styles.when} aria-label="When each part lands">
        <h3 className={styles.whenTitle}>When each part lands</h3>
        <ul className={styles.whenList}>
          {plan.legs.map((leg, i) => {
            const status = legStatus(leg.confidence, leg.channel)
            return (
              <li key={`${leg.whenLabel}-${leg.amountZar}-${i}`} className={styles.whenRow}>
                <LegIcon confidence={leg.confidence} channel={leg.channel} />
                <div className={styles.whenBody}>
                  <div className={styles.whenTop}>
                    <span className={styles.whenWhen}>
                      {leg.whenLabel} / {status}
                    </span>
                    <span className={styles.whenAmt}>{formatDeskMajorZar(leg.amountZar)}</span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
        <div className={styles.whenTotal}>
          <span>Total</span>
          <span>{formatDeskMajorZar(plan.zarTotal)}</span>
        </div>
      </section>

      <p className={styles.note}>{plan.note}</p>
    </div>
  )
}

export function hasRoutingPlan(item: ActivityItem): boolean {
  return Boolean(item.routingPlan?.legs?.length)
}

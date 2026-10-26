'use client'

import {
  formatMznMoney,
  formatZarMoney,
  railSumLine,
  type Rail,
  type RailStep,
  type RoutingStepMessage,
  type StepStatus,
} from '@/lib/desk/routingStepMessage'
import styles from './RoutingStepCard.module.css'

function StatusIcon({ status }: { status: StepStatus }) {
  const label = status === 'done' ? 'Done' : status === 'en_route' ? 'EFT pending' : 'Planned'
  if (status === 'done') {
    return (
      <svg className={styles.statusIcon} viewBox="0 0 22 22" aria-label={label} role="img">
        <circle cx="11" cy="11" r="9.25" className={styles.statusDoneFill} />
        <path
          d="M6.5 11.2l2.8 2.8 6.2-6.4"
          className={styles.statusCheck}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg className={styles.statusIcon} viewBox="0 0 22 22" aria-label={label} role="img">
      <circle cx="11" cy="11" r="9.25" className={styles.statusPending} />
    </svg>
  )
}

function StepRow({ step }: { step: RailStep }) {
  const amount =
    step.amountKind === 'MZN' ? formatMznMoney(step.amount) : formatZarMoney(step.amount)
  return (
    <div className={styles.stepRow}>
      <StatusIcon status={step.status} />
      <div className={styles.stepText}>
        <div className={styles.stepTitle}>{step.title}</div>
        {step.subline ? <div className={styles.stepSub}>{step.subline}</div> : null}
      </div>
      <div className={styles.stepRight}>
        <div className={styles.stepAmount}>{amount}</div>
        {step.secondary ? <div className={styles.stepSub}>{step.secondary}</div> : null}
      </div>
    </div>
  )
}

function chipClass(variant: Rail['chip']['variant']): string {
  if (variant === 'today') return styles.chipToday
  if (variant === 'settled') return styles.chipSettled
  return styles.chipOutline
}

function RailBlock({ rail }: { rail: Rail }) {
  return (
    <div className={styles.rail}>
      <div className={styles.railHeader}>
        <span className={styles.railLabel}>{rail.label}</span>
        <span className={chipClass(rail.chip.variant)}>{rail.chip.text}</span>
        <span className={styles.railTotal}>{formatZarMoney(rail.total)}</span>
      </div>
      <div className={styles.railSteps}>
        {rail.steps.map((step, index) => (
          <StepRow key={`${rail.kind}-${step.title}-${index}`} step={step} />
        ))}
      </div>
    </div>
  )
}

function SplitBar({ rails }: { rails: Rail[] }) {
  const total = rails.reduce((s, r) => s + r.total, 0) || 1
  return (
    <div className={styles.splitBar} aria-hidden="true">
      {rails.map((rail) => (
        <div
          key={rail.kind}
          className={rail.kind === 'card' ? styles.segCard : styles.segEft}
          style={{ flex: `${Math.max(rail.total, 0.01)} 1 0` }}
          title={`${rail.label} ${((rail.total / total) * 100).toFixed(0)}%`}
        />
      ))}
    </div>
  )
}

function nextFooterLabel(message: RoutingStepMessage): string {
  const { next } = message
  if (message.stepNumber === 6 && next.opensIn === 'tomorrow') {
    const day = next.dayLabel || 'Day next'
    return `${day} · Step ${next.stepNumber} ${next.stepName} opens tomorrow`
  }
  if (next.opensIn) {
    return `Step ${next.stepNumber} · ${next.stepName} opens in ${next.opensIn}`
  }
  return `Step ${next.stepNumber} · ${next.stepName}`
}

export function RoutingStepCard({ message }: { message: RoutingStepMessage }) {
  const totalStr = formatZarMoney(message.clientTotal)
  const rest = message.summary.startsWith(totalStr)
    ? message.summary.slice(totalStr.length)
    : ` ${message.summary}`
  const settlement = message.settlement

  return (
    <div className={styles.wrap}>
      <p className={styles.summary}>
        <strong className={styles.summaryTotal}>{totalStr}</strong>
        {rest}
      </p>

      <div className={styles.planCard}>
        <div className={styles.totalBlock}>
          <div className={styles.eyebrow}>To client on settlement</div>
          <div className={styles.hero}>{formatZarMoney(message.clientTotal)}</div>
          <SplitBar rails={message.rails} />
          <div className={styles.legend}>
            {message.rails.map((rail) => (
              <div key={rail.kind} className={styles.legendRow}>
                <span
                  className={
                    rail.kind === 'card' ? styles.swatchCard : styles.swatchEft
                  }
                />
                <span className={styles.legendLabel}>
                  {rail.kind === 'card'
                    ? rail.chip.variant === 'settled'
                      ? 'Card · settled today'
                      : 'Card · settles today'
                    : `EFT · pending, ${rail.settlementTerm}`}
                </span>
                <span className={styles.legendAmount}>{formatZarMoney(rail.total)}</span>
              </div>
            ))}
          </div>
        </div>

        {message.rails.map((rail) => (
          <div key={rail.kind}>
            <div className={styles.divider} />
            <RailBlock rail={rail} />
          </div>
        ))}

        {settlement ? (
          <div className={styles.clientBox}>
            <div className={styles.settlementLine}>
              Settled {formatZarMoney(settlement.settledZar)}
              {' · '}
              Pending {formatZarMoney(settlement.pendingZar)}
              {' · '}
              Total {formatZarMoney(settlement.totalZar)}
            </div>
            <div className={styles.clientSub}>{railSumLine(message.rails)}</div>
          </div>
        ) : (
          <div className={styles.clientBox}>
            <div className={styles.clientRow}>
              <span>Client ZAR</span>
              <span className={styles.clientTotal}>{formatZarMoney(message.clientTotal)}</span>
            </div>
            <div className={styles.clientSub}>{railSumLine(message.rails)}</div>
          </div>
        )}
      </div>

      <div className={styles.nextFooter}>
        <svg
          className={styles.clock}
          viewBox="0 0 20 20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <circle cx="10" cy="10" r="7.25" />
          <path d="M10 6.5V10l2.5 1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>
          <strong>Next:</strong> {nextFooterLabel(message)}
        </span>
      </div>
    </div>
  )
}

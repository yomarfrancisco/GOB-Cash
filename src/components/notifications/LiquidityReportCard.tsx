'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import type { ActivityItem } from '@/store/activity'
import styles from '@/app/activity/activity.module.css'

function fmtZar(n: number): string {
  return `R${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtMzn(n: number): string {
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN`
}

function fmtRate(n: number): string {
  if (!(n > 0)) return '—'
  return `${n.toFixed(4)} MZN/ZAR`
}

const SEG_COLOR: Record<string, string> = {
  liquid: '#18181b',
  clearing: '#b8d4c8',
  card: '#c8b8a0',
  eft: 'repeating-linear-gradient(135deg, #f0d060 0 4px, #f8e9a0 4px 8px)',
  held: '#ffffff',
}

function PipeBar({
  segments,
}: {
  segments: Array<{ kind: string; amountZar: number }>
}) {
  const total = segments.reduce((s, r) => s + Math.max(0, r.amountZar), 0)
  if (!(total > 0)) return null
  return (
    <div className={styles.liqPipeBar} role="img" aria-label="Liquidity pipe">
      {segments.map((seg, i) => {
        const pct = Math.max(0.4, (seg.amountZar / total) * 100)
        const color = SEG_COLOR[seg.kind] || '#ddd'
        const isEft = seg.kind === 'eft'
        return (
          <span
            key={`${seg.kind}-${i}`}
            className={styles.liqPipeSeg}
            style={{
              flexGrow: seg.amountZar,
              flexBasis: 0,
              minWidth: pct < 1 ? 3 : undefined,
              background: isEft ? undefined : color,
              backgroundImage: isEft ? color : undefined,
              border: seg.kind === 'held' ? '1px solid rgba(0,0,0,0.15)' : undefined,
            }}
            title={`${seg.kind}: ${fmtZar(seg.amountZar)}`}
          />
        )
      })}
    </div>
  )
}

function downloadLiquidityReport(item: ActivityItem) {
  const report = item.liquidityReport
  if (!report) return
  const lines = [
    'Liquidity report',
    `Full liquidity: ${report.fullLiquidityLabel}`,
    `${fmtZar(report.liquidZar)} of ${fmtZar(report.fundedZar)} liquid now · ${report.liquidPct}`,
    `Rate: ${fmtRate(report.rate)}`,
    `Funded: ${fmtMzn(report.fundedMzn)}`,
    '',
    'When it becomes liquid:',
    ...report.timeline.map(
      (row) => `- ${row.whenLabel}: ${fmtZar(row.amountZar)} · ${row.label}`
    ),
    `- Total funded: ${fmtZar(report.fundedZar)} (${fmtMzn(report.fundedMzn)} @ ${report.rate.toFixed(4)})`,
    '',
    report.note,
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `liquidity-report-${item.id}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

export function LiquidityReportCard({
  item,
  onWithdraw,
}: {
  item: ActivityItem
  onWithdraw?: (amountZar: number) => void
}) {
  const report = item.liquidityReport
  const [expanded, setExpanded] = useState(false)
  if (!report) return null

  const isLive = item.liquidityLive === true
  const changes = item.liquidityChanges || []
  const showFull = isLive || expanded

  if (!showFull) {
    return (
      <div
        className={styles.liqReport}
        data-liquidity-live="false"
        data-liquidity-report={item.id}
      >
        <div className={styles.chipRow}>
          {item.deskStatusChip ? (
            <span className={`${styles.planChip} ${styles.liqSnapshotChip}`}>{item.deskStatusChip}</span>
          ) : null}
        </div>
        <div className={styles.liqFrozenBox}>
          <div className={styles.liqFrozenRow}>
            <span>Full liquidity</span>
            <strong>{report.fullLiquidityLabel}</strong>
          </div>
          <div className={styles.liqFrozenRow}>
            <span>Liquid</span>
            <strong>{fmtZar(report.liquidZar)}</strong>
          </div>
          <div className={styles.liqFrozenRow}>
            <span>Funded</span>
            <strong>{fmtZar(report.fundedZar)}</strong>
          </div>
        </div>
        {changes.length > 0 ? (
          <div className={styles.liqChangedBox}>
            <div className={styles.liqChangedTitle}>
              Changed since {(item.deskStatusChip || '').replace(/^Snapshot · as at\s*/i, '') || '—'}
            </div>
            <ul>
              {changes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <button
          type="button"
          className={styles.replyButton}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(true)
          }}
        >
          Open full snapshot
        </button>
      </div>
    )
  }

  const withdrawZar = report.withdrawZar > 0.005 ? report.withdrawZar : 0

  return (
    <div
      className={styles.liqReport}
      data-liquidity-live={isLive ? 'true' : 'false'}
      data-liquidity-report={item.id}
    >
      <div className={styles.chipRow}>
        {(isLive
          ? report.chips || []
          : [
              item.deskStatusChip || 'Snapshot',
              ...(report.chips || []).filter((c) => !/^Live/i.test(c)),
            ]
        ).map((chip, i) => {
          const live = /^Live/i.test(chip)
          const snap = /^Snapshot/i.test(chip)
          const ok = /accounted/i.test(chip)
          const bad = /Not reconciled/i.test(chip)
          return (
            <span
              key={`${chip}-${i}`}
              className={[
                styles.planChip,
                live ? styles.liqLiveChip : '',
                snap ? styles.liqSnapshotChip : '',
                ok ? styles.liqOkChip : '',
                bad ? styles.liqBadChip : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {live ? `● ${chip}` : ok ? `✓ ${chip}` : chip}
            </span>
          )
        })}
      </div>

      <div className={styles.liqHero}>
        <div className={styles.liqEyebrow}>FULL LIQUIDITY</div>
        <div className={styles.liqHeroDate}>{report.fullLiquidityLabel}</div>
        <div className={styles.liqHeroSub}>
          {fmtZar(report.liquidZar)} of {fmtZar(report.fundedZar)} liquid now · {report.liquidPct}
        </div>
      </div>

      <div className={styles.liqPipeCard}>
        <div className={styles.liqPipeEnds}>
          <div className={`${styles.liqPipeBlock} ${styles.liqPipeIn}`}>
            <div className={styles.liqPipeLabel}>MZN IN</div>
            <div className={styles.liqPipeAmt}>
              {report.fundedMzn.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className={styles.liqPipeHint}>MZN funded</div>
          </div>
          <div className={styles.liqPipeArrow} aria-hidden>
            →
          </div>
          <div className={`${styles.liqPipeBlock} ${styles.liqPipeOut}`}>
            <div className={styles.liqPipeLabel}>ZAR OUT</div>
            <div className={styles.liqPipeAmt}>{fmtZar(report.liquidZar)}</div>
            <div className={styles.liqPipeHint}>liquid · can withdraw</div>
          </div>
        </div>
        <PipeBar segments={report.pipeSegments} />
        <div className={styles.liqPipeCaption}>
          Pipe in ZAR at {fmtRate(report.rate)} · left: liquid, right: still converting
        </div>
      </div>

      <div className={styles.liqWhen}>
        <div className={styles.liqWhenTitle}>WHEN IT BECOMES LIQUID</div>
        <ul className={styles.liqWhenList}>
          {report.timeline.map((row, i) => (
            <li key={`${row.kind}-${row.landsAt ?? 'now'}-${i}`} className={styles.liqWhenRow}>
              <span className={row.done ? styles.liqWhenDone : styles.liqWhenPend} aria-hidden>
                {row.done ? '✓' : '○'}
              </span>
              <div className={styles.liqWhenBody}>
                <div className={styles.liqWhenTop}>
                  <strong>{row.whenLabel}</strong>
                  <span>{fmtZar(row.amountZar)}</span>
                </div>
                <div className={styles.liqWhenSub}>{row.label}</div>
              </div>
            </li>
          ))}
          <li className={`${styles.liqWhenRow} ${styles.liqWhenTotal}`}>
            <span className={styles.liqWhenPend} aria-hidden />
            <div className={styles.liqWhenBody}>
              <div className={styles.liqWhenTop}>
                <strong>Total funded</strong>
                <strong>{fmtZar(report.fundedZar)}</strong>
              </div>
              <div className={styles.liqWhenSub}>
                {fmtMzn(report.fundedMzn)} @ {report.rate.toFixed(4)}
              </div>
            </div>
          </li>
        </ul>
      </div>

      <p className={styles.liqNote}>{report.note}</p>

      <div className={styles.activityActionRow}>
        {withdrawZar > 0 && onWithdraw ? (
          <button
            type="button"
            className={styles.replyButton}
            onClick={(e) => {
              e.stopPropagation()
              onWithdraw(withdrawZar)
            }}
          >
            Withdraw {fmtZar(withdrawZar)}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.replyButton}
          aria-label="Download liquidity report"
          onClick={(e) => {
            e.stopPropagation()
            downloadLiquidityReport(item)
          }}
        >
          <Download size={16} strokeWidth={2.2} />
          Download Report
        </button>
      </div>
    </div>
  )
}

export function LiquidityLiveStrip({
  fullBy,
  liquidZar,
  fundedZar,
  liquidPct,
  onNewReport,
  hidden,
}: {
  fullBy: string
  liquidZar: number
  fundedZar: number
  liquidPct: number
  onNewReport: () => void
  hidden?: boolean
}) {
  if (hidden) return null
  const pct = Math.max(0, Math.min(100, liquidPct * 100))
  return (
    <button
      type="button"
      className={styles.liqStrip}
      onClick={onNewReport}
      aria-label="Open new liquidity report"
    >
      <div className={styles.liqStripTop}>
        <span className={styles.liqStripLeft}>
          <i className={styles.liqStripDot} />
          <strong>Liquidity</strong>
          <span className={styles.liqStripMuted}> full by {fullBy}</span>
        </span>
        <span className={styles.liqStripLink}>New report ›</span>
      </div>
      <div className={styles.liqStripBar}>
        <span style={{ width: `${Math.max(pct, pct > 0 ? 1.5 : 0)}%` }} />
      </div>
      <div className={styles.liqStripBottom}>
        <strong>{fmtZar(liquidZar)} liquid</strong>
        <span>of ≈ {fmtZar(fundedZar)} funded</span>
      </div>
    </button>
  )
}

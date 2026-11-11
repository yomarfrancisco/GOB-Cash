'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import type { ActivityItem } from '@/store/activity'
import {
  formatDeskMajorMzn,
  formatDeskMajorZar,
  formatDeskMinorMzn,
  formatDeskMinorZar,
  formatDeskRateMtPerZar,
} from '@/lib/desk/deskMoneyFormat'
import { DeskDisclosure } from './DeskDisclosure'
import styles from '@/app/activity/activity.module.css'

/** Match desk pipe cards: ZAR charcoal, mint liquid, MZN maroon accents. */
const SEG_COLOR: Record<string, string> = {
  liquid: '#2c2c2e',
  clearing: '#9bdbc1',
  reserve: '#6b9e87',
  queued: '#f4f1ea',
  card: '#5a2f4a',
  eft: 'repeating-linear-gradient(135deg, #a8e6c3 0 4px, #9bdbc1 4px 8px)',
  held: '#ffffff',
}

const CLIENT_NOTE =
  "Times are estimates. New funding can move them. We'll tell you if it does."

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
              border:
                seg.kind === 'held' || seg.kind === 'queued'
                  ? '1px solid rgba(0,0,0,0.15)'
                  : undefined,
            }}
            title={`${seg.kind}: ${formatDeskMinorZar(seg.amountZar)}`}
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
    `${formatDeskMinorZar(report.liquidZar)} of ${formatDeskMinorZar(report.fundedZar)} liquid now · ${report.liquidPct}`,
    `Rate: ${formatDeskRateMtPerZar(report.rate)}`,
    `Funded: ${formatDeskMinorMzn(report.fundedMzn)}`,
    '',
    'When it becomes liquid:',
    ...report.timeline.map(
      (row) => `- ${row.whenLabel}: ${formatDeskMinorZar(row.amountZar)} · ${row.label}`
    ),
    `- Total funded: ${formatDeskMinorZar(report.fundedZar)} (${formatDeskMinorMzn(report.fundedMzn)} @ ${report.rate.toFixed(4)})`,
    '',
    CLIENT_NOTE,
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `liquidity-report-${item.id}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

function clientTimelineLabel(row: { kind: string; label: string; done: boolean }): string {
  if (row.done || /ready|now|liquid/i.test(row.label)) return 'Ready'
  if (/book|reserved|planned/i.test(row.label) || row.kind === 'card' || row.kind === 'reserved') {
    return 'Booked'
  }
  return 'Estimated'
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
            <strong>{formatDeskMinorZar(report.liquidZar)}</strong>
          </div>
          <div className={styles.liqFrozenRow}>
            <span>Funded</span>
            <strong>{formatDeskMinorZar(report.fundedZar)}</strong>
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

      <div className={styles.liqPipeCard}>
        <div className={styles.liqPipeEnds}>
          <div className={`${styles.liqPipeBlock} ${styles.liqPipeIn}`}>
            <div className={styles.liqPipeLabel}>MZN IN</div>
            <div className={styles.liqPipeAmt}>{formatDeskMajorMzn(report.fundedMzn)}</div>
            <div className={styles.liqPipeHint}>MZN funded</div>
          </div>
          <div className={styles.liqPipeArrow} aria-hidden>
            →
          </div>
          <div className={`${styles.liqPipeBlock} ${styles.liqPipeOut}`}>
            <div className={styles.liqPipeLabel}>ZAR OUT</div>
            <div className={styles.liqPipeAmt}>{formatDeskMajorZar(report.liquidZar)}</div>
            <div className={styles.liqPipeHint}>liquid · can withdraw</div>
          </div>
        </div>
        <PipeBar segments={report.pipeSegments} />
        <div className={styles.liqPipeCaption}>
          Pipe in ZAR at {formatDeskRateMtPerZar(report.rate)} · left: liquid, right: still converting
        </div>
      </div>

      <DeskDisclosure label="When it becomes liquid">
        <div className={styles.liqWhen}>
          <ul className={styles.liqWhenList}>
            {report.timeline.map((row, i) => (
              <li key={`${row.kind}-${row.landsAt ?? 'now'}-${i}`} className={styles.liqWhenRow}>
                <span className={row.done ? styles.liqWhenDone : styles.liqWhenPend} aria-hidden>
                  {row.done ? '✓' : '○'}
                </span>
                <div className={styles.liqWhenBody}>
                  <div className={styles.liqWhenTop}>
                    <strong>{row.whenLabel}</strong>
                    <span>{formatDeskMinorZar(row.amountZar)}</span>
                  </div>
                  <div className={styles.liqWhenSub}>{clientTimelineLabel(row)}</div>
                </div>
              </li>
            ))}
            <li className={`${styles.liqWhenRow} ${styles.liqWhenTotal}`}>
              <span className={styles.liqWhenPend} aria-hidden />
              <div className={styles.liqWhenBody}>
                <div className={styles.liqWhenTop}>
                  <strong>Total funded</strong>
                  <strong>{formatDeskMinorZar(report.fundedZar)}</strong>
                </div>
                <div className={styles.liqWhenSub}>{formatDeskMinorMzn(report.fundedMzn)}</div>
              </div>
            </li>
          </ul>
        </div>
        <p className={styles.liqNote}>{CLIENT_NOTE}</p>
      </DeskDisclosure>

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
            Withdraw {formatDeskMajorZar(withdrawZar)}
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
          Download
        </button>
      </div>
    </div>
  )
}

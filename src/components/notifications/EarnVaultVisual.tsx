'use client'

import { useEffect, useState } from 'react'
import { formatCardTopline } from '@/lib/formatCurrency'
import {
  deriveDeliveryNoteView,
  formatDetailUsd,
  formatNoteRate,
  noteInUseShare,
  type DeliveryNoteView,
} from '@/lib/vault/deliveryNote'
import { checkUsdcSupplyRequest } from '@/lib/vault/supplyUsdcClient'
import { useVaultStore, type VaultPosition } from '@/store/vault'
import { useSupplyUsdcSheet } from '@/store/useSupplyUsdcSheet'
import styles from './RoutingPlanVisual.module.css'

const SOLSCAN_TX = 'https://solscan.io/tx/'

export function earnVaultTitle(position: VaultPosition, nowMs = Date.now()): string {
  return deriveDeliveryNoteView(position, nowMs).title
}

export function earnVaultSentence(position: VaultPosition, nowMs = Date.now()): string {
  return deriveDeliveryNoteView(position, nowMs).sentence
}

function pillClass(tone: DeliveryNoteView['pillTone']): string {
  if (tone === 'late') return styles.pillLate
  if (tone === 'closed') return styles.pillClosed
  if (tone === 'open') return styles.pillOpen
  return styles.pillOk
}

/**
 * Flat USDC/ZAR stack for Earn mode — 24h delivery note (Part 19).
 */
export function EarnVaultVisual({
  onSupply,
}: {
  onSupply: () => void
  onWithdraw?: () => void
}) {
  const position = useVaultStore((s) => s.position)
  const setPendingSupply = useVaultStore((s) => s.setPendingSupply)
  const pending = position.pendingSupply
  const last = position.lastSupply
  const closeSupplySheet = useSupplyUsdcSheet((s) => s.close)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [supplyBusy, setSupplyBusy] = useState(false)

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const view = deriveDeliveryNoteView(position, nowMs)
  const cardBarPct =
    view.phase === 'open' || view.phase === 'closed'
      ? 0
      : view.phase === 'settled'
        ? 100
        : Math.round(noteInUseShare(position) * 100)

  useEffect(() => {
    if (!pending?.id) return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await checkUsdcSupplyRequest(pending.id)
        if (cancelled) return
        if (res.status === 'confirmed') {
          setPendingSupply(null)
          closeSupplySheet()
        }
      } catch {
        /* keep waiting */
      }
    }
    void tick()
    const t = window.setInterval(() => void tick(), 2500)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [pending?.id, setPendingSupply, closeSupplySheet])

  const handleSupply = async () => {
    if (supplyBusy || !view.supplyEnabled) return
    setSupplyBusy(true)
    try {
      await onSupply()
    } finally {
      setSupplyBusy(false)
    }
  }

  const frontAmt = (() => {
    const { major, cents } = formatCardTopline(Math.max(0, view.usdcFrontMajor))
    return cents != null ? `$${major}.${cents}` : `$${major}`
  })()

  return (
    <div className={styles.root} aria-label="Delivery note">
      <div className={styles.stackWrap}>
        <div className={styles.stack}>
          <div className={[styles.peek, styles.peekZar].join(' ')} aria-hidden>
            <span className={styles.peekLane}>ZAR</span>
            <span className={styles.peekValue}>{view.zarBackLabel}</span>
          </div>

          <div className={[styles.front, styles.frontUsdc].join(' ')}>
            <div className={styles.frontLane}>USDC</div>
            <div className={styles.frontAmt}>{frontAmt}</div>
            <div className={styles.frontSub}>{view.cardSub}</div>
            <div className={styles.frontBarTrack} aria-hidden>
              <span
                className={styles.frontBarFill}
                style={{ width: `${Math.max(0, Math.min(100, cardBarPct))}%` }}
              />
            </div>
          </div>
        </div>

        {view.showBreakdown && view.breakdown ? (
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 14,
              fontWeight: 500,
              color: '#3a3a3c',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>Supplied</span>
              <span>{formatDetailUsd(view.breakdown.supplied)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>Used for deliveries</span>
              <span>
                {formatDetailUsd(view.breakdown.used)} · {view.breakdown.usedPct}%
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>Earned at {formatNoteRate(view.breakdown.lockedRatePct)}%</span>
              <span>{formatDetailUsd(view.breakdown.earned)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                fontWeight: 700,
                color: '#111',
              }}
            >
              <span>Back in your wallet</span>
              <span>{formatDetailUsd(view.breakdown.backInWallet)}</span>
            </div>
          </div>
        ) : (
          <section className={styles.panel} aria-label={view.panelLabel}>
            <div className={styles.panelHead}>
              <span className={styles.panelLabel}>{view.panelLabel}</span>
              <span className={[styles.pill, pillClass(view.pillTone)].join(' ')}>
                {view.pill}
              </span>
            </div>
            <div className={styles.arriveWhen} style={{ fontSize: 22 }}>
              {view.panelBig}
            </div>
            <div className={styles.timeTrack} aria-hidden>
              <span
                className={styles.timeFill}
                style={{ width: `${Math.max(0, Math.min(100, view.barPct))}%` }}
              />
            </div>
            <div className={styles.timeMeta}>
              <span>{view.metaLeft}</span>
              <span>{view.metaRight}</span>
            </div>
          </section>
        )}

        {view.showSolscan && last?.signature ? (
          <button
            type="button"
            onClick={() => {
              window.open(`${SOLSCAN_TX}${last.signature}`, '_blank', 'noopener,noreferrer')
            }}
            style={{
              marginTop: 12,
              width: '100%',
              height: 48,
              borderRadius: 16,
              border: '1px solid #111',
              background: '#fff',
              color: '#111',
              fontSize: 15,
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            View on Solscan
          </button>
        ) : null}
      </div>

      {pending ? (
        <p
          style={{
            margin: '12px 0 0',
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 550,
            color: '#8e8e93',
          }}
        >
          Waiting for your USDC…
        </p>
      ) : null}

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          onClick={() => void handleSupply()}
          disabled={supplyBusy || !view.supplyEnabled}
          style={{
            boxSizing: 'border-box',
            width: '100%',
            minHeight: 52,
            height: 52,
            padding: '0 18px',
            borderRadius: 16,
            border: 0,
            background: view.supplyEnabled ? '#111' : '#c7c7cc',
            color: '#fff',
            fontSize: 16,
            fontWeight: 650,
            lineHeight: '52px',
            cursor: supplyBusy ? 'wait' : view.supplyEnabled ? 'pointer' : 'not-allowed',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            opacity: supplyBusy ? 0.7 : 1,
          }}
        >
          {view.supplyEnabled ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/assets/phantom-icon.png"
              alt=""
              width={22}
              height={22}
              style={{
                width: 22,
                height: 22,
                flexShrink: 0,
                display: 'block',
                borderRadius: 6,
              }}
            />
          ) : null}
          <span style={{ lineHeight: 1 }}>{view.supplyLabel}</span>
        </button>
      </div>
    </div>
  )
}

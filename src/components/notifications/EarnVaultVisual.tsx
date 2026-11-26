'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Check, ChevronDown, CircleDashed } from 'lucide-react'
import {
  formatDeskMajorUsd,
  formatDeskMajorZar,
} from '@/lib/desk/deskMoneyFormat'
import { sastParts } from '@/lib/routing/routingTime'
import {
  checkUsdcSupplyRequest,
} from '@/lib/vault/supplyUsdcClient'
import {
  formatUsdcReceivedTitle,
  shortenSolanaAddress,
  shortenTxSignature,
} from '@/lib/vault/solanaPayUrl'
import {
  useVaultStore,
  vaultHasSupply,
  vaultWithdrawableShare,
  type VaultPosition,
} from '@/store/vault'
import { useSupplyUsdcSheet } from '@/store/useSupplyUsdcSheet'
import styles from './RoutingPlanVisual.module.css'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const SOLSCAN_TX = 'https://solscan.io/tx/'

function formatWhenShort(ms: number): string {
  const p = sastParts(ms)
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')
  return `${WD[p.weekday]} ${hh}:${mm}`
}

function formatApyLabel(apy: number | null): string {
  if (apy == null || !Number.isFinite(apy)) return '[x]'
  return Number.isInteger(apy) ? String(apy) : apy.toFixed(1)
}

function formatUsdPlaceholder(amount: number): string {
  if (!(amount > 0.005)) return '$[x]'
  return formatDeskMajorUsd(amount).startsWith('$')
    ? `$${Math.round(amount).toLocaleString('en-US')}`
    : formatDeskMajorUsd(amount)
}

function formatUsdPlus(amount: number): string {
  if (!(amount > 0.005)) return '+$[x]'
  return `+$${Math.round(amount * 100) / 100}`
}

export function earnVaultTitle(position: VaultPosition): string {
  if (position.lastSupply && position.lastSupply.amountUsdc > 0.005) {
    return formatUsdcReceivedTitle(position.lastSupply.amountUsdc)
  }
  if (!vaultHasSupply(position)) return 'Earn from every delivery.'
  return `${formatDeskMajorUsd(position.suppliedUsdc)} is working.`
}

export function earnVaultSentence(position: VaultPosition): string {
  if (position.lastSupply && position.lastSupply.amountUsdc > 0.005) {
    return 'It starts funding deliveries in the 09:00 cycle. Anything not funding a delivery can be withdrawn any time.'
  }
  if (!vaultHasSupply(position)) {
    return 'Your USDC funds corridor float. You earn a share of the fee on every delivery it funds.'
  }
  const free = Math.max(0, Number(position.withdrawableNowUsd) || 0)
  if (free > 0.005) {
    return `It funded ${position.deliveriesToday} deliveries today. ${formatDeskMajorUsd(free)} can be withdrawn now.`
  }
  return `It funded ${position.deliveriesToday} deliveries today. All of your USDC is funding open deliveries.`
}

/**
 * Flat USDC/ZAR stack for Earn mode — reuses RoutingPlanVisual casing.
 */
export function EarnVaultVisual({
  onSupply,
  onWithdraw,
}: {
  onSupply: () => void
  onWithdraw?: () => void
}) {
  const position = useVaultStore((s) => s.position)
  const setPendingSupply = useVaultStore((s) => s.setPendingSupply)
  const supplied = vaultHasSupply(position)
  const pending = position.pendingSupply
  const last = position.lastSupply
  const closeSupplySheet = useSupplyUsdcSheet((s) => s.close)
  const [partsOpen, setPartsOpen] = useState(false)
  const [supplyBusy, setSupplyBusy] = useState(false)
  const withdrawShare = Math.round(vaultWithdrawableShare(position) * 100)
  const apyLabel = formatApyLabel(position.trailingApyPct)

  const fundingProgress =
    position.legs.length > 0
      ? Math.round(
          (position.legs.filter((l) => l.status === 'landed').length / position.legs.length) * 100
        )
      : supplied
        ? Math.max(5, withdrawShare || 100)
        : 0

  // Poll Solana Pay confirmation while pending (no "I've sent it" button).
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
    const t = window.setInterval(() => void tick(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [pending?.id, setPendingSupply, closeSupplySheet])

  const handleSupply = async () => {
    if (supplyBusy) return
    setSupplyBusy(true)
    try {
      await onSupply()
    } finally {
      setSupplyBusy(false)
    }
  }

  const PhantomBtn = ({
    label,
    primary,
    onClick,
  }: {
    label: string
    primary?: boolean
    onClick: () => void
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={supplyBusy}
      style={{
        flex: 1,
        width: primary ? '100%' : undefined,
        height: 52,
        borderRadius: 16,
        border: primary ? 0 : '1px solid #d4d0c6',
        background: primary ? '#111' : '#fff',
        color: primary ? '#fff' : '#111',
        fontSize: 16,
        fontWeight: 650,
        cursor: supplyBusy ? 'wait' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        opacity: supplyBusy ? 0.7 : 1,
      }}
    >
      {primary ? (
        <Image src="/assets/phantom-icon.png" alt="" width={22} height={22} />
      ) : null}
      {label}
    </button>
  )

  return (
    <div className={styles.root} aria-label="Earn vault">
      <div className={styles.stackWrap}>
        <div className={styles.stack}>
          <div className={[styles.peek, styles.peekZar].join(' ')} aria-hidden>
            <span className={styles.peekLane}>ZAR</span>
            <span className={styles.peekValue}>
              {supplied && position.zarFunded > 0.005
                ? `${formatDeskMajorZar(position.zarEarned)} earned`
                : 'R 0 funded'}
            </span>
          </div>

          <div className={[styles.front, styles.frontUsdc].join(' ')}>
            <div className={styles.frontLane}>USDC</div>
            <div className={styles.frontAmt}>{formatDeskMajorUsd(position.suppliedUsdc)}</div>
            <div className={styles.frontSub}>Earning {apyLabel}% yearly</div>
            <div className={styles.frontBarTrack} aria-hidden>
              <span
                className={styles.frontBarFill}
                style={{
                  width: `${Math.max(0, Math.min(100, supplied ? withdrawShare || 100 : 0))}%`,
                }}
              />
            </div>
          </div>
        </div>

        {last && supplied ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: 10,
              fontSize: 13,
              fontWeight: 500,
              color: '#8e8e93',
            }}
          >
            <span>
              From {shortenSolanaAddress(last.sender)} · Solana
            </span>
            <span>Tx {shortenTxSignature(last.signature)}</span>
          </div>
        ) : null}

        {last && supplied ? (
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
        ) : (
          <section className={styles.panel} aria-label={supplied ? 'Funding' : 'Backed by'}>
            <div className={styles.panelHead}>
              <span className={styles.panelLabel}>
                {supplied ? 'Your USDC is funding' : 'Backed by'}
              </span>
              <span className={[styles.pill, styles.pillOk].join(' ')}>
                {supplied ? 'On time' : 'Live'}
              </span>
            </div>

            {supplied ? (
              <>
                <div className={styles.arriveWhen} style={{ fontSize: 22 }}>
                  {position.deliveriesToday} deliveries ·{' '}
                  {formatDeskMajorZar(position.deliveriesZarToday)}
                </div>
                <div className={styles.timeTrack} aria-hidden>
                  <span
                    className={styles.timeFill}
                    style={{ width: `${Math.max(5, Math.min(100, fundingProgress))}%` }}
                  />
                </div>
                <div className={styles.timeMeta}>
                  <span>
                    {position.suppliedAtMs
                      ? `Supplied ${formatWhenShort(position.suppliedAtMs)}`
                      : 'Supplied —'}
                  </span>
                  <span>
                    {position.backAtMs
                      ? `Back ${formatWhenShort(position.backAtMs)}`
                      : 'Back —'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className={styles.arriveWhen} style={{ fontSize: 22 }}>
                  Pre-funded payments
                </div>
                <p className={styles.panelNote}>Every delivery confirmed by bank evidence</p>
              </>
            )}
          </section>
        )}
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

      {supplied && position.legs.length > 0 && !last ? (
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
            <span>When each part landed</span>
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
            <section className={styles.when} aria-label="When each part landed">
              <ul className={styles.whenList}>
                {position.legs.map((leg) => (
                  <li key={leg.id} className={styles.whenRow}>
                    {leg.status === 'landed' ? (
                      <Check
                        className={`${styles.whenIcon} ${styles.whenIconNow}`}
                        size={16}
                        strokeWidth={2.6}
                        aria-hidden
                      />
                    ) : (
                      <CircleDashed
                        className={styles.whenIcon}
                        size={16}
                        strokeWidth={2.2}
                        aria-hidden
                      />
                    )}
                    <div className={styles.whenBody}>
                      <div className={styles.whenTop}>
                        <span className={styles.whenWhen}>{formatWhenShort(leg.atMs)}</span>
                        <span className={styles.whenAmt}>{formatUsdPlus(leg.earnedUsd)}</span>
                      </div>
                      <div className={styles.whenSub}>
                        {formatDeskMajorZar(leg.amountZar)}{' '}
                        {leg.status === 'landed' ? 'delivered · Landed' : 'funding · Booked'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className={styles.whenTotal}>
                <span>Earned · expected</span>
                <span>
                  {formatUsdPlaceholder(position.earnedUsdToday)} ·{' '}
                  {formatUsdPlaceholder(position.expectedEarnedUsd)}
                </span>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {supplied ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => void handleSupply()}
              disabled={supplyBusy}
              style={{
                flex: 1,
                height: 52,
                borderRadius: 16,
                border: 0,
                background: '#111',
                color: '#fff',
                fontSize: 16,
                fontWeight: 650,
                cursor: supplyBusy ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                opacity: supplyBusy ? 0.7 : 1,
              }}
            >
              <Image src="/assets/phantom-icon.png" alt="" width={22} height={22} />
              Supply more
            </button>
            <button
              type="button"
              onClick={onWithdraw}
              style={{
                flex: 1,
                height: 52,
                borderRadius: 16,
                border: '1px solid #d4d0c6',
                background: '#fff',
                color: '#111',
                fontSize: 16,
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              Withdraw
            </button>
          </div>
        ) : (
          <PhantomBtn label="Supply USDC" primary onClick={() => void handleSupply()} />
        )}
      </div>
    </div>
  )
}

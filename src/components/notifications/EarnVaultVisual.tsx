'use client'

import { useState } from 'react'
import { Check, ChevronDown, CircleDashed } from 'lucide-react'
import {
  formatDeskMajorUsd,
  formatDeskMajorZar,
  formatDeskTitleUsd,
} from '@/lib/desk/deskMoneyFormat'
import { sastParts } from '@/lib/routing/routingTime'
import {
  useVaultStore,
  vaultHasSupply,
  vaultWithdrawableShare,
  type VaultPosition,
} from '@/store/vault'
import styles from './RoutingPlanVisual.module.css'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

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
  return formatDeskTitleUsd(amount)
}

function formatUsdPlus(amount: number): string {
  if (!(amount > 0.005)) return '+$[x]'
  return `+${formatDeskTitleUsd(amount)}`
}

export function earnVaultTitle(position: VaultPosition): string {
  if (!vaultHasSupply(position)) return 'Earn from every delivery.'
  return `${formatDeskTitleUsd(position.suppliedUsdc)} is working.`
}

export function earnVaultSentence(position: VaultPosition): string {
  if (!vaultHasSupply(position)) {
    return 'Your USDC funds corridor float. You earn a share of the fee on every delivery it funds.'
  }
  const earned = formatUsdPlaceholder(position.earnedUsdToday)
  const withdrawable = formatUsdPlaceholder(position.withdrawableNowUsd)
  return `It funded ${position.deliveriesToday} deliveries today. You earned ${earned}; ${withdrawable} can be withdrawn now.`
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
  const supplied = vaultHasSupply(position)
  const [partsOpen, setPartsOpen] = useState(false)
  const withdrawShare = Math.round(vaultWithdrawableShare(position) * 100)
  const apyLabel = formatApyLabel(position.trailingApyPct)
  const dailyCap =
    position.dailyRedeemLimitUsd > 0.005
      ? formatDeskTitleUsd(position.dailyRedeemLimitUsd)
      : '$[x]'

  const fundingProgress =
    position.legs.length > 0
      ? Math.round(
          (position.legs.filter((l) => l.status === 'landed').length / position.legs.length) * 100
        )
      : supplied
        ? 40
        : 0

  return (
    <div className={styles.root} aria-label="Earn vault">
      <div className={styles.stackWrap}>
        <div className={styles.stack}>
          <div className={[styles.peek, styles.peekZar].join(' ')} aria-hidden>
            <span className={styles.peekLane}>ZAR</span>
            <span className={styles.peekValue}>
              {supplied
                ? `${formatDeskMajorZar(position.zarEarned)} earned`
                : 'R 0 funded'}
            </span>
          </div>

          <div className={[styles.front, styles.frontUsdc].join(' ')}>
            <div className={styles.frontLane}>USDC</div>
            <div className={styles.frontAmt}>
              {supplied
                ? formatDeskMajorUsd(position.suppliedUsdc)
                : formatDeskMajorUsd(0)}
            </div>
            <div className={styles.frontSub}>Earning {apyLabel}% yearly</div>
            {supplied ? (
              <div className={styles.frontBarTrack} aria-hidden>
                <span
                  className={styles.frontBarFill}
                  style={{ width: `${Math.max(0, Math.min(100, withdrawShare))}%` }}
                />
              </div>
            ) : (
              <div className={styles.frontBarTrack} aria-hidden>
                <span className={styles.frontBarFill} style={{ width: '0%' }} />
              </div>
            )}
          </div>
        </div>

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
      </div>

      {supplied && position.legs.length > 0 ? (
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
              onClick={onSupply}
              style={{
                flex: 1,
                height: 52,
                borderRadius: 16,
                border: 0,
                background: '#111',
                color: '#fff',
                fontSize: 16,
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
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
          <>
            <button
              type="button"
              onClick={onSupply}
              style={{
                width: '100%',
                height: 52,
                borderRadius: 16,
                border: 0,
                background: '#111',
                color: '#fff',
                fontSize: 16,
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              Supply USDC
            </button>
            <p
              style={{
                margin: 0,
                textAlign: 'center',
                fontSize: 13,
                fontWeight: 500,
                color: '#8e8e93',
              }}
            >
              Withdraw up to {dailyCap} a day
            </p>
          </>
        )}
      </div>
    </div>
  )
}

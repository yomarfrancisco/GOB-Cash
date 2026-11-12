'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import type { ActivityItem } from '@/store/activity'
import {
  FUND_MZN_ACCOUNT_NUMBER,
  FUND_MZN_BANK,
  FUND_MZN_RECIPIENT,
} from '@/lib/notifications/welcomeSignIn'
import { MZN_PER_ZAR, sellMznPerZar, zarToMzn } from '@/lib/mznZar'
import {
  formatDeskMajorMzn,
  formatDeskMajorZar,
  formatDeskMinorZar,
} from '@/lib/desk/deskMoneyFormat'
import { useWalletStore } from '@/store/wallets'
import styles from './FundMznIntroCard.module.css'

/**
 * Watch-card demo.
 * Unfunded: start and end at R0 / Mt 0 (empty green bar).
 * After MZN lands: start at R0 and fill to the first funding amount.
 * Wire mode animates 0 → the quoted fund target.
 */
const DEMO_LIQUID_ZAR = 100_000
const DEMO_LIQUID_PHASE = 0.58
const DEMO_ANIM_MS = 2800
const DEMO_LOOP_GAP_MS = 10_000

function demoZarForProgress(progress: number, endZar: number): number {
  const t = Math.max(0, Math.min(1, progress))
  const end = Math.max(0, endZar)
  if (!(end > 0.005)) return 0
  const liquidCap = Math.min(DEMO_LIQUID_ZAR, end)
  if (end <= liquidCap + 0.005) {
    return end * t
  }
  if (t <= DEMO_LIQUID_PHASE) {
    const local = DEMO_LIQUID_PHASE <= 0 ? 1 : t / DEMO_LIQUID_PHASE
    return liquidCap * local
  }
  const local = (t - DEMO_LIQUID_PHASE) / Math.max(1e-6, 1 - DEMO_LIQUID_PHASE)
  return liquidCap + (end - liquidCap) * local
}

function demoLiquidFillPct(demoZar: number): number {
  if (!(demoZar > 0)) return 0
  const liquid = Math.min(DEMO_LIQUID_ZAR, demoZar)
  if (demoZar <= DEMO_LIQUID_ZAR) {
    return Math.max(0, Math.min(100, (liquid / DEMO_LIQUID_ZAR) * 100))
  }
  return Math.max(0, Math.min(100, (liquid / demoZar) * 100))
}

export type FundIntroLocale = 'en' | 'pt'

const COPY = {
  en: {
    accountLabel: 'NIB',
    refPrefix: 'REF:',
    watchTitle: 'Watch it become liquid',
    explain: (
      <>
        The <strong>green bar</strong> on your ZAR card shows how much is liquid. Up to{' '}
        <strong>R100,000</strong> fills it instantly; the rest fills at <strong>09:00</strong>.
      </>
    ),
    howTitle: 'How it works',
    howSteps: [
      'Send MZN to the account above. Always add the reference.',
      'The first R100,000 each day is converted and paid out straight away. Anything above that follows, and we tell you when all of it will arrive.',
      'The first time, we ask for your South African bank account. After that, payouts are automatic.',
    ],
    copied: 'Copied',
    copyAccount: 'Copy NIB',
    copyReference: 'Copy reference',
  },
  pt: {
    accountLabel: 'NIB',
    refPrefix: 'REF:',
    watchTitle: 'Veja ficar líquido',
    explain: (
      <>
        A <strong>barra verde</strong> no seu cartão ZAR mostra quanto está líquido. Até{' '}
        <strong>R100.000</strong> enche-a de imediato; o restante às <strong>09:00</strong>.
      </>
    ),
    howTitle: 'Como funciona',
    howSteps: [
      'Envie MZN para a conta acima. Inclua sempre a referência.',
      'Os primeiros R100.000 de cada dia são convertidos e pagos de imediato. O que ultrapassar segue depois, e dizemos-lhe quando chega tudo.',
      'Na primeira vez pedimos a sua conta bancária sul-africana. Depois disso, os pagamentos são automáticos.',
    ],
    copied: 'Copiado',
    copyAccount: 'Copiar NIB',
    copyReference: 'Copiar referência',
  },
} as const

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function resolveWireAmounts(
  item: ActivityItem,
  sellMznPerZarProp: number | null
): { zar: number; mzn: number } {
  const liveSell =
    typeof sellMznPerZarProp === 'number' && sellMznPerZarProp > 0
      ? sellMznPerZar(sellMznPerZarProp)
      : sellMznPerZar(MZN_PER_ZAR)
  const zar =
    typeof item.fundTargetZar === 'number' && item.fundTargetZar > 0
      ? item.fundTargetZar
      : typeof item.amount?.value === 'number'
        ? item.amount.value
        : 0
  const mzn =
    typeof item.fundTargetMzn === 'number' && item.fundTargetMzn > 0
      ? item.fundTargetMzn
      : zarToMzn(zar, liveSell)
  return { zar, mzn }
}

/** Prefer the configured 13-digit NIB over any shorter account-shaped value. */
function resolveFundNib(item: ActivityItem): string {
  const candidates = [
    item.fundAccountNumber,
    item.deskLedgerRows?.find((row) => /^nib$/i.test(row.label))?.value,
    item.deskLedgerRows?.find((row) => /^account$/i.test(row.label))?.value,
    FUND_MZN_ACCOUNT_NUMBER,
  ]
  for (const raw of candidates) {
    const digits = String(raw || '').replace(/\s/g, '')
    if (/^\d{13}$/.test(digits)) return digits
  }
  return FUND_MZN_ACCOUNT_NUMBER
}

export function FundMznIntroCard({
  item,
  locale: localeProp = 'en',
  onLocaleChange,
  sellMznPerZar: sellMznPerZarProp = null,
}: {
  item: ActivityItem
  locale?: FundIntroLocale
  onLocaleChange?: (locale: FundIntroLocale) => void
  sellMznPerZar?: number | null
}) {
  const isWire = item.routingAction === 'fund_wire'
  const [locale, setLocale] = useState<FundIntroLocale>(localeProp)
  const [animProgress, setAnimProgress] = useState(0)
  const [inView, setInView] = useState(true)
  const [howOpen, setHowOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const wallets = useWalletStore((s) => s.wallets)
  const walletsHydrated = useWalletStore((s) => s.walletsHydrated)

  useEffect(() => {
    setLocale(localeProp)
  }, [localeProp])

  // Locale is controlled from the shell PT chip.
  void onLocaleChange

  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(Boolean(entry?.isIntersecting && (entry.intersectionRatio ?? 0) > 0.12))
      },
      { threshold: [0, 0.12, 0.35, 0.7] }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inView) {
      setAnimProgress(0)
      return
    }

    let frame = 0
    let gapTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const play = () => {
      if (cancelled) return
      setAnimProgress(0)
      const started = performance.now()
      const tick = (now: number) => {
        if (cancelled) return
        const t = Math.min(1, (now - started) / DEMO_ANIM_MS)
        const eased = 1 - Math.pow(1 - t, 3)
        setAnimProgress(eased)
        if (t < 1) {
          frame = requestAnimationFrame(tick)
          return
        }
        gapTimer = setTimeout(() => {
          gapTimer = null
          play()
        }, DEMO_LOOP_GAP_MS)
      }
      frame = requestAnimationFrame(tick)
    }

    play()
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      if (gapTimer) clearTimeout(gapTimer)
    }
  }, [inView])

  const copy = COPY[locale]
  const account = resolveFundNib(item)
  const reference =
    item.paymentReference ||
    item.deskLedgerRows?.find((row) => /^reference$/i.test(row.label))?.value ||
    ''
  const recipient =
    item.deskLedgerRows?.find((row) => /^recipient$/i.test(row.label) || /^name$/i.test(row.label))
      ?.value || FUND_MZN_RECIPIENT
  const bank = item.deskLedgerRows?.find((row) => /^bank$/i.test(row.label))?.value || FUND_MZN_BANK
  const [copiedKey, setCopiedKey] = useState<'account' | 'reference' | null>(null)

  const liveSell =
    typeof sellMznPerZarProp === 'number' && sellMznPerZarProp > 0
      ? sellMznPerZar(sellMznPerZarProp)
      : sellMznPerZar(MZN_PER_ZAR)
  const { zar: wireZar, mzn: wireMzn } = resolveWireAmounts(item, sellMznPerZarProp)

  const cashMzn = walletsHydrated ? Number(wallets?.cashMZN?.fiatBalance || 0) : 0
  const cashZar = walletsHydrated ? Number(wallets?.cashZAR?.fiatBalance || 0) : 0
  const earningsZar = walletsHydrated ? Number(wallets?.earnings?.fiatBalance || 0) : 0
  const fundedZarFromWallets =
    cashZar +
    earningsZar +
    (liveSell > 0 ? Math.round((cashMzn / liveSell) * 100) / 100 : 0)
  // Unfunded intro stays R0. After MZN lands, fill 0 → first funding.
  const animEndZar = isWire
    ? wireZar
    : fundedZarFromWallets > 0.005
      ? fundedZarFromWallets
      : 0

  const demoZar = demoZarForProgress(animProgress, animEndZar)
  const demoMzn = isWire
    ? wireMzn * (wireZar > 0 ? demoZar / wireZar : 0)
    : zarToMzn(demoZar, liveSell)
  const liquidFillPct = demoLiquidFillPct(demoZar)

  const markCopied = (key: 'account' | 'reference') => {
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500)
  }

  return (
    <div className={styles.root} ref={rootRef}>
      {isWire ? (
        <p className={styles.body}>
          {locale === 'pt' ? (
            <>
              Envie <strong>{formatDeskMajorMzn(wireMzn)}</strong> para a conta abaixo para financiar
              cerca de <strong>{formatDeskMinorZar(wireZar)}</strong>.
            </>
          ) : (
            <>
              Send <strong>{formatDeskMajorMzn(wireMzn)}</strong> to the account below to fund about{' '}
              <strong>{formatDeskMinorZar(wireZar)}</strong>.
            </>
          )}
        </p>
      ) : null}

      <section className={styles.watch} aria-label={bank}>
        <h3 className={styles.watchTitle}>{bank}</h3>
        <div className={styles.transferPanel}>
          <div className={styles.transferBlock}>
            <div className={styles.transferLabel}>{copy.accountLabel}</div>
            <button
              type="button"
              className={styles.transferValueRow}
              aria-label={copiedKey === 'account' ? copy.copied : copy.copyAccount}
              onClick={(event) => {
                event.stopPropagation()
                void copyText(account).then((ok) => {
                  if (ok) markCopied('account')
                })
              }}
            >
              <span className={styles.transferValue}>{account}</span>
              {copiedKey === 'account' ? (
                <Check className={styles.copyIcon} size={16} strokeWidth={2.4} aria-hidden />
              ) : (
                <Copy className={styles.copyIcon} size={16} strokeWidth={2.25} aria-hidden />
              )}
            </button>
            <div className={styles.transferName}>{recipient}</div>
          </div>

          <button
            type="button"
            className={styles.referenceChip}
            aria-label={copiedKey === 'reference' ? copy.copied : copy.copyReference}
            onClick={(event) => {
              event.stopPropagation()
              void copyText(reference).then((ok) => {
                if (ok) markCopied('reference')
              })
            }}
          >
            <span className={styles.referencePrefix}>{copy.refPrefix}</span>
            <span className={styles.referenceValue}>{reference}</span>
            {copiedKey === 'reference' ? (
              <Check className={styles.copyIconDark} size={16} strokeWidth={2.4} aria-hidden />
            ) : (
              <Copy className={styles.copyIconDark} size={16} strokeWidth={2.25} aria-hidden />
            )}
          </button>
        </div>
      </section>

      <section className={styles.watch} aria-label={copy.watchTitle}>
        <h3 className={styles.watchTitle}>
          {isWire
            ? locale === 'pt'
              ? 'O que acontece no cartão'
              : 'What lands on your card'
            : copy.watchTitle}
        </h3>
        <div className={styles.miniCard} aria-hidden>
          <div className={styles.miniCardAmt}>{formatDeskMajorZar(demoZar)}</div>
          <div className={styles.miniCardApprox}>≈ {formatDeskMajorMzn(demoMzn)}</div>
          <span className={styles.ratePill}>{liveSell.toFixed(2)} Mt/R</span>
          <span
            className={styles.liqTrack}
            title="Liquidity bar"
            role="img"
            aria-label={`Liquid ${Math.round(liquidFillPct)} percent`}
          >
            <span
              className={styles.liqFill}
              style={{ width: `${Math.max(0, Math.min(100, liquidFillPct))}%` }}
            />
          </span>
        </div>
        <p className={styles.explain}>
          <span className={styles.explainIcon} aria-hidden>
            <span className={styles.explainIconBar} />
          </span>
          <span>
            {isWire ? (
              locale === 'pt' ? (
                <>
                  A <strong>barra verde</strong> mostra quanto deste financiamento fica líquido já
                  (até <strong>R100.000</strong>/dia). O restante às <strong>09:00</strong>.
                </>
              ) : (
                <>
                  The <strong>green bar</strong> shows how much of this fund is liquid now (up to{' '}
                  <strong>R100,000</strong>/day). The rest lands at <strong>09:00</strong>.
                </>
              )
            ) : (
              copy.explain
            )}
          </span>
        </p>
      </section>

      <div className={styles.how}>
        <button
          type="button"
          className={styles.howToggle}
          aria-expanded={howOpen}
          onClick={(event) => {
            event.stopPropagation()
            setHowOpen((v) => !v)
          }}
        >
          <span>{copy.howTitle}</span>
          <ChevronDown
            className={[styles.howChevron, howOpen ? styles.howChevronOpen : '']
              .filter(Boolean)
              .join(' ')}
            size={16}
            strokeWidth={2.4}
            aria-hidden
          />
        </button>
        {howOpen ? (
          <ol className={styles.howList}>
            {copy.howSteps.map((step, i) => (
              <li key={i} className={styles.howItem}>
                <span className={styles.howIndex} aria-hidden>
                  {i + 1}.
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  )
}

export function fundIntroPrimaryLabel(locale: FundIntroLocale, watching: boolean): string {
  if (locale === 'pt') return watching ? 'A acompanhar a transferência' : 'Já enviei'
  return watching ? 'Watching for your transfer' : "I've sent it"
}

export function fundIntroTitle(locale: FundIntroLocale, item?: ActivityItem): string {
  if (item?.routingAction === 'fund_wire') {
    const { mzn } = resolveWireAmounts(item, null)
    if (mzn > 0) {
      return locale === 'pt'
        ? `Envie ${formatDeskMajorMzn(mzn)}.`
        : `Send ${formatDeskMajorMzn(mzn)}.`
    }
  }
  return locale === 'pt' ? 'Envie MZN aqui.' : 'Send MZN here.'
}

export function fundIntroLine(locale: FundIntroLocale, item?: ActivityItem): string {
  if (item?.routingAction === 'fund_wire') {
    const { zar } = resolveWireAmounts(item, null)
    if (zar > 0) {
      return locale === 'pt'
        ? `Recebe cerca de ${formatDeskMinorZar(zar)}.`
        : `You get about ${formatDeskMinorZar(zar)}.`
    }
  }
  return locale === 'pt'
    ? 'Os primeiros R100.000 por dia são instantâneos. O resto fica pronto às 09:00.'
    : 'The first R100,000 a day is instant. The rest is ready by 09:00.'
}

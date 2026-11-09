'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { ActivityItem } from '@/store/activity'
import {
  buildFundMznDeskSentence,
  FUND_MZN_ACCOUNT_NUMBER,
  FUND_MZN_BANK,
  FUND_MZN_RECIPIENT,
} from '@/lib/notifications/welcomeSignIn'
import { MZN_PER_ZAR, sellMznPerZar, zarToMzn } from '@/lib/mznZar'
import styles from './FundMznIntroCard.module.css'

/** Demo total so the bar can show R100k liquid of a larger book. */
const DEMO_START_ZAR = 100_000
const DEMO_END_ZAR = 160_000
const DEMO_LIQUID_ZAR = 100_000
const DEMO_ANIM_MS = 2200
/** Pause after a full fill before the educational loop restarts. */
const DEMO_LOOP_GAP_MS = 10_000

function formatZarAmount(value: number): string {
  return `R${Math.round(value).toLocaleString('en-US')}`
}

function formatMznApprox(value: number): string {
  return `≈ ${Math.round(value).toLocaleString('en-US')} MZN`
}

export type FundIntroLocale = 'en' | 'pt'

const COPY = {
  en: {
    body: (
      <>
        PAGA helps you convert MZN to ZAR instantly. To receive (or pay out) ZAR in South Africa
        simply (a) Fund your Meticais wallet up to <strong>R100,000</strong>. It&apos;s instantly
        liquid: meaning it&apos;s converted and ready to pay out. Anything above R100k is at{' '}
        <strong>09:00</strong> the next day/s. (b) Your routing Manager will then obtain SA banking
        details to payout. Your MZN account on PAGA follows:
      </>
    ),
    recipient: 'Recipient',
    bank: 'Bank',
    account: 'Account',
    reference: 'Reference',
    refNote: 'Add this reference so we can match your transfer.',
    watchTitle: 'Watch it become liquid',
    explain: (
      <>
        The <strong>green bar</strong> on your ZAR card shows how much is liquid. Up to{' '}
        <strong>R100,000</strong> fills it instantly; the rest fills at <strong>09:00</strong>.
      </>
    ),
    copied: 'Copied',
    copyAccount: 'Copy account number',
    copyReference: 'Copy reference',
  },
  pt: {
    body: (
      <>
        A PAGA ajuda a converter MZN em ZAR de imediato. Para receber (ou pagar) ZAR na África do
        Sul: (a) financie a sua carteira de meticais até <strong>R100.000</strong>. Fica líquido de
        imediato — convertido e pronto a pagar. Acima de R100k, às <strong>09:00</strong> do(s)
        dia(s) seguinte(s). (b) O seu routing Manager obtém depois os dados bancários SA para o
        payout. A sua conta MZN na PAGA segue:
      </>
    ),
    recipient: 'Beneficiário',
    bank: 'Banco',
    account: 'Conta',
    reference: 'Referência',
    refNote: 'Inclua esta referência para conseguirmos identificar a transferência.',
    watchTitle: 'Veja ficar líquido',
    explain: (
      <>
        A <strong>barra verde</strong> no seu cartão ZAR mostra quanto está líquido. Até{' '}
        <strong>R100.000</strong> enche-a de imediato; o restante às <strong>09:00</strong>.
      </>
    ),
    copied: 'Copiado',
    copyAccount: 'Copiar número da conta',
    copyReference: 'Copiar referência',
  },
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function LedgerRow({
  label,
  value,
  strong,
  copyable,
  copyLabel,
  copied,
  onCopy,
  last,
}: {
  label: string
  value: string
  strong?: boolean
  copyable?: boolean
  copyLabel?: string
  copied?: boolean
  onCopy?: () => void
  last?: boolean
}) {
  const valueClass = [styles.ledgerValue, strong ? styles.ledgerValueStrong : ''].filter(Boolean).join(' ')
  const rowClass = [
    styles.ledgerRow,
    copyable ? styles.ledgerRowCopyable : styles.ledgerRowStatic,
    last ? styles.ledgerRowLast : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (!copyable) {
    return (
      <div className={rowClass}>
        <span className={styles.ledgerLabel}>{label}</span>
        <span className={valueClass}>{value}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      className={rowClass}
      aria-label={copied ? COPY.en.copied : copyLabel}
      onClick={(event) => {
        event.stopPropagation()
        onCopy?.()
      }}
    >
      <span className={styles.ledgerLabel}>{label}</span>
      <span className={valueClass}>
        {value}
        {copied ? (
          <Check className={styles.copyIcon} size={15} strokeWidth={2.4} aria-hidden />
        ) : (
          <Copy className={styles.copyIcon} size={15} strokeWidth={2.25} aria-hidden />
        )}
      </span>
    </button>
  )
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
  const [locale, setLocale] = useState<FundIntroLocale>(localeProp)
  const [animProgress, setAnimProgress] = useState(0)
  const [inView, setInView] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocale(localeProp)
  }, [localeProp])

  // Pause the educational fill when scrolled off or desk closed (unmount).
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

  const switchLocale = (next: FundIntroLocale) => {
    setLocale(next)
    onLocaleChange?.(next)
  }

  const copy = COPY[locale]
  const account =
    item.fundAccountNumber ||
    item.deskLedgerRows?.find((row) => /^account$/i.test(row.label))?.value ||
    FUND_MZN_ACCOUNT_NUMBER
  const reference =
    item.paymentReference ||
    item.deskLedgerRows?.find((row) => /^reference$/i.test(row.label))?.value ||
    ''
  const recipient =
    item.deskLedgerRows?.find((row) => /^recipient$/i.test(row.label))?.value || FUND_MZN_RECIPIENT
  const bank = item.deskLedgerRows?.find((row) => /^bank$/i.test(row.label))?.value || FUND_MZN_BANK
  const [copiedKey, setCopiedKey] = useState<'account' | 'reference' | null>(null)

  const liveSell =
    typeof sellMznPerZarProp === 'number' && sellMznPerZarProp > 0
      ? sellMznPerZar(sellMznPerZarProp)
      : sellMznPerZar(MZN_PER_ZAR)
  const demoZar = DEMO_START_ZAR + (DEMO_END_ZAR - DEMO_START_ZAR) * animProgress
  const demoMzn = zarToMzn(demoZar, liveSell)
  const liquidFillPct = Math.max(0, Math.min(100, (DEMO_LIQUID_ZAR / Math.max(demoZar, 1)) * 100))
  const firstName =
    item.deskSentence?.match(/^Hi\s+([^.,]+)/i)?.[1]?.trim() ||
    item.actor?.name?.trim().split(/\s+/)[0] ||
    'there'
  const enSentence = buildFundMznDeskSentence(firstName)

  const markCopied = (key: 'account' | 'reference') => {
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500)
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.langSwitch} role="group" aria-label="Language">
        <button
          type="button"
          className={[styles.langBtn, locale === 'en' ? styles.langBtnActive : ''].filter(Boolean).join(' ')}
          aria-pressed={locale === 'en'}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            switchLocale('en')
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            switchLocale('en')
          }}
        >
          EN
        </button>
        <button
          type="button"
          className={[styles.langBtn, locale === 'pt' ? styles.langBtnActive : ''].filter(Boolean).join(' ')}
          aria-pressed={locale === 'pt'}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            switchLocale('pt')
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            switchLocale('pt')
          }}
        >
          PT
        </button>
      </div>

      <p className={styles.body}>{locale === 'en' ? enSentence : copy.body}</p>

      <div className={styles.ledger}>
        <LedgerRow label={copy.recipient} value={recipient} strong />
        <LedgerRow label={copy.bank} value={bank} />
        <LedgerRow
          label={copy.account}
          value={account}
          strong
          copyable
          copyLabel={copy.copyAccount}
          copied={copiedKey === 'account'}
          onCopy={() => {
            void copyText(account).then((ok) => {
              if (ok) markCopied('account')
            })
          }}
        />
        <LedgerRow
          label={copy.reference}
          value={reference}
          strong
          copyable
          copyLabel={copy.copyReference}
          copied={copiedKey === 'reference'}
          last
          onCopy={() => {
            void copyText(reference).then((ok) => {
              if (ok) markCopied('reference')
            })
          }}
        />
        <p className={styles.refNote}>{copy.refNote}</p>
      </div>

      <section className={styles.watch} aria-label={copy.watchTitle}>
        <h3 className={styles.watchTitle}>{copy.watchTitle}</h3>
        <div className={styles.miniCard} aria-hidden>
          <div className={styles.miniCardAmt}>{formatZarAmount(demoZar)}</div>
          <div className={styles.miniCardApprox}>{formatMznApprox(demoMzn)}</div>
          <span className={styles.ratePill}>{liveSell.toFixed(2)}Mt/R</span>
          <span className={styles.liqRing} title="Liquidity bar">
            <span className={styles.liqTrack}>
              <span className={styles.liqFill} style={{ width: `${liquidFillPct}%` }} />
            </span>
          </span>
        </div>
        <p className={styles.explain}>
          <span className={styles.explainIcon} aria-hidden>
            <span className={styles.explainIconBar} />
          </span>
          <span>{copy.explain}</span>
        </p>
      </section>
    </div>
  )
}

export function fundIntroPrimaryLabel(locale: FundIntroLocale, watching: boolean): string {
  if (locale === 'pt') return watching ? 'A acompanhar a transferência' : 'Já enviei a transferência'
  return watching ? 'Watching for your transfer' : "I've sent the transfer"
}

export function fundIntroSecondaryLabel(locale: FundIntroLocale): string {
  return locale === 'pt' ? 'Relatório de liquidez' : 'Liquidity report'
}

export function fundIntroTitle(locale: FundIntroLocale): string {
  return locale === 'pt' ? 'Financie a sua conta em MZN' : 'Fund your MZN account'
}

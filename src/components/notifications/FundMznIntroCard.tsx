'use client'

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { ActivityItem } from '@/store/activity'
import {
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
        Send meticais to this account. Up to <strong>R100,000</strong> is liquid instantly, ready to
        pay. Anything above is liquid at <strong>09:00</strong> the next day.
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
    justFunded: 'Just funded',
    converting: 'Converting',
    allLiquid: 'All liquid',
    note: 'Most funds are liquid by 09:00 the next day. Some routes take up to 2 banking days.',
    copied: 'Copied',
    copyAccount: 'Copy account number',
    copyReference: 'Copy reference',
  },
  pt: {
    body: (
      <>
        Transfira meticais para esta conta. Até <strong>R100.000</strong> ficam líquidos de
        imediato, prontos a pagar. O restante fica líquido às <strong>09:00</strong> do dia
        seguinte.
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
    justFunded: 'Acabou de financiar',
    converting: 'A converter',
    allLiquid: 'Tudo líquido',
    note: 'A maior parte fica líquida até às 09:00 do dia seguinte; algumas rotas levam até 2 dias úteis.',
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
  useEffect(() => {
    setLocale(localeProp)
  }, [localeProp])

  useEffect(() => {
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / DEMO_ANIM_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      setAnimProgress(eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

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

  const markCopied = (key: 'account' | 'reference') => {
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500)
  }

  return (
    <div className={styles.root}>
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

      <p className={styles.body}>{copy.body}</p>

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
        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <span className={styles.legendBar} />
            <span className={styles.legendLabel}>{copy.justFunded}</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendBar}>
              <span className={styles.legendFill} style={{ width: '55%' }} />
            </span>
            <span className={styles.legendLabel}>{copy.converting}</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendBar}>
              <span className={styles.legendFill} style={{ width: '100%' }} />
            </span>
            <span className={styles.legendLabel}>{copy.allLiquid}</span>
          </div>
        </div>
      </section>

      <p className={styles.note}>{copy.note}</p>
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

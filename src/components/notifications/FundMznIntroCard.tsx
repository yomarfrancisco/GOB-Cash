'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { ActivityItem } from '@/store/activity'
import {
  FUND_MZN_ACCOUNT_NUMBER,
  FUND_MZN_BANK,
  FUND_MZN_RECIPIENT,
} from '@/lib/notifications/welcomeSignIn'
import styles from './FundMznIntroCard.module.css'

export type FundIntroLocale = 'en' | 'pt'

const COPY = {
  en: {
    bodyBefore: 'Send meticais to this account. We start converting the moment it lands. Liquid ZAR is ready to withdraw from ',
    bodyBold: '09:00 every day',
    bodyAfter: '.',
    recipient: 'Recipient',
    bank: 'Bank',
    account: 'Account',
    reference: 'Reference',
    refNote: 'Add this reference so we can match your transfer.',
    watchTitle: 'Watch it become liquid',
    explainBefore: 'The ',
    explainGreen: 'green bar',
    explainMid: ' on your ZAR card shows how much of your funding is liquid. It fills as we convert. ',
    explainFull: 'Full bar: everything is liquid.',
    justFunded: 'Just funded',
    converting: 'Converting',
    allLiquid: 'All liquid',
    note: 'Most funds are liquid by 09:00 the next day. Some routes take up to 2 banking days.',
    copied: 'Copied',
    copyAccount: 'Copy account number',
    copyReference: 'Copy reference',
  },
  pt: {
    bodyBefore:
      'Transfira meticais para esta conta. Começamos a converter assim que o valor entra. Os ZAR líquidos ficam disponíveis para levantamento a partir das ',
    bodyBold: '09:00, todos os dias',
    bodyAfter: '.',
    recipient: 'Beneficiário',
    bank: 'Banco',
    account: 'Conta',
    reference: 'Referência',
    refNote: 'Inclua esta referência para conseguirmos identificar a transferência.',
    watchTitle: 'Veja ficar líquido',
    explainBefore: 'A ',
    explainGreen: 'barra verde',
    explainMid: ' no seu cartão ZAR mostra quanto do financiamento já está líquido. Enche à medida que convertemos. ',
    explainFull: 'Barra cheia: tudo líquido.',
    justFunded: 'Acabou de financiar',
    converting: 'A converter',
    allLiquid: 'Tudo líquido',
    note: 'A maior parte fica líquida até às 09:00 do dia seguinte; algumas rotas levam até 2 dias úteis.',
    copied: 'Copiado',
    copyAccount: 'Copiar número da conta',
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
  locale,
  onLocaleChange,
}: {
  item: ActivityItem
  locale: FundIntroLocale
  onLocaleChange: (locale: FundIntroLocale) => void
}) {
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
          onClick={(event) => {
            event.stopPropagation()
            onLocaleChange('en')
          }}
        >
          EN
        </button>
        <button
          type="button"
          className={[styles.langBtn, locale === 'pt' ? styles.langBtnActive : ''].filter(Boolean).join(' ')}
          aria-pressed={locale === 'pt'}
          onClick={(event) => {
            event.stopPropagation()
            onLocaleChange('pt')
          }}
        >
          PT
        </button>
      </div>

      <p className={styles.body}>
        {copy.bodyBefore}
        <strong>{copy.bodyBold}</strong>
        {copy.bodyAfter}
      </p>

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
          <div className={styles.miniCardTop}>ZAR</div>
          <div>
            <div className={styles.miniCardAmt}>R27,371</div>
            <div className={styles.miniCardApprox}>≈ 122,359 MZN</div>
          </div>
          <div className={styles.miniCardFooter}>
            <span className={styles.ratePill}>4.47 MZN/ZAR</span>
            <span className={styles.liqRing}>
              <span className={styles.liqTrack}>
                <span className={styles.liqFill} />
              </span>
            </span>
          </div>
        </div>
        <p className={styles.explain}>
          <span className={styles.explainIcon} aria-hidden>
            <span className={styles.explainIconBar} />
          </span>
          <span>
            {copy.explainBefore}
            <strong>{copy.explainGreen}</strong>
            {copy.explainMid}
            <strong>{copy.explainFull}</strong>
          </span>
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

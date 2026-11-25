/**
 * Residual / replacement EFT corridors.
 * Route picks Moz instructing bank + payer entity, and the SA beneficiary account.
 * Account numbers are ledger/ops facts — never invented by an LLM.
 */

import { BANKER_DIRECTORY, type BankerDirectoryEntry } from '../routing/bankerDirectory'
import { COMPANIES, type CompanyRecord } from '../settlement/register'

export type SaBeneficiaryBank = {
  bankName: string
  accountName: string
  accountNumber: string
  branchCode: string
  accountType: string
}

export type EftRoute = {
  key: string
  label: string
  /** Moz bank relationship manager we instruct. */
  banker: BankerDirectoryEntry
  /** Moz entity that remits. */
  payer: CompanyRecord
  /** Optional known Moz remitting account — omit digits when unknown. */
  payerAccount?: {
    bankName: string
    accountName: string
    accountNumber?: string
    currency: 'MZN' | 'ZAR'
  }
  /** SA merchant receiving the EFT. */
  beneficiaryCompany: CompanyRecord
  beneficiaryBank: SaBeneficiaryBank
  /** Settlement rail this corridor supports. */
  railId: 'econometrica_capitec' | 'lemon_fnb' | 'lemon_capitec' | 'wolf_fnb' | 'imani_fnb'
}

const ECONOMETRICA_SA: CompanyRecord = {
  ...COMPANIES.econometrica!,
  legalName: 'Econometrica (Pty) Ltd',
  tradingAs: 'Paga',
  registrationNumber: '2026/785154/07',
  taxNumber: null,
  addressLines: [
    'Unit 875 Polofields Lifestyle Estate',
    'Waterfall City, Midrand',
    'Gauteng, 2066, South Africa',
  ],
  invoicePrefix: 'ECM',
}

/** Capitec Business settlement account used as PDF password / merchant payout. */
export const ECONOMETRICA_CAPITEC_BENEFICIARY: SaBeneficiaryBank = {
  bankName: 'Capitec Business',
  accountName: 'Econometrica (Pty) Ltd',
  accountNumber: '1055902139',
  branchCode: '470010',
  accountType: 'Business current',
}

function banker(key: BankerDirectoryEntry['key']): BankerDirectoryEntry {
  const row = BANKER_DIRECTORY.find((b) => b.key === key)
  if (!row) throw new Error(`Missing banker ${key}`)
  return row
}

/**
 * Live residual corridors. Weekday rotation picks among these.
 * Expand payer account numbers when ops confirms them.
 */
export const EFT_ROUTES: readonly EftRoute[] = [
  {
    key: 'bim__econometrica_capitec',
    label: 'BIM → Econometrica Capitec',
    banker: banker('bim'),
    payer: COMPANIES.multivendas!,
    payerAccount: {
      bankName: 'Millennium bim',
      accountName: 'Multi-Vendas, Limitada',
      currency: 'MZN',
    },
    beneficiaryCompany: ECONOMETRICA_SA,
    beneficiaryBank: ECONOMETRICA_CAPITEC_BENEFICIARY,
    railId: 'econometrica_capitec',
  },
  {
    key: 'moza__econometrica_capitec',
    label: 'Moza → Econometrica Capitec',
    banker: banker('moza'),
    payer: COMPANIES.brics_ai_ei!,
    payerAccount: {
      bankName: 'Moza Banco',
      accountName: 'BRICS AI, EI',
      currency: 'MZN',
    },
    beneficiaryCompany: ECONOMETRICA_SA,
    beneficiaryBank: ECONOMETRICA_CAPITEC_BENEFICIARY,
    railId: 'econometrica_capitec',
  },
  {
    key: 'fnb_mz__econometrica_capitec',
    label: 'FNB Moz → Econometrica Capitec',
    banker: banker('fnb_mz'),
    payer: COMPANIES.brics_ai_ei!,
    payerAccount: {
      bankName: 'FNB Moçambique',
      accountName: 'BRICS AI, EI',
      currency: 'MZN',
    },
    beneficiaryCompany: ECONOMETRICA_SA,
    beneficiaryBank: ECONOMETRICA_CAPITEC_BENEFICIARY,
    railId: 'econometrica_capitec',
  },
  {
    key: 'absa_mz__econometrica_capitec',
    label: 'Absa Moz → Econometrica Capitec',
    banker: banker('absa_mz'),
    payer: COMPANIES.brics_ai_ei!,
    payerAccount: {
      bankName: 'Absa Moçambique',
      accountName: 'BRICS AI, EI',
      currency: 'MZN',
    },
    beneficiaryCompany: ECONOMETRICA_SA,
    beneficiaryBank: ECONOMETRICA_CAPITEC_BENEFICIARY,
    railId: 'econometrica_capitec',
  },
  {
    key: 'vista_mz__econometrica_capitec',
    label: 'Vista → Econometrica Capitec',
    banker: banker('vista_mz'),
    payer: COMPANIES.vidrotec!,
    payerAccount: {
      bankName: 'Vista Bank Moçambique',
      accountName: 'Vidrotec, Sociedade Unipessoal, Lda',
      currency: 'MZN',
    },
    beneficiaryCompany: ECONOMETRICA_SA,
    beneficiaryBank: ECONOMETRICA_CAPITEC_BENEFICIARY,
    railId: 'econometrica_capitec',
  },
] as const

export function selectEftRoute(clockMs: number, routeKey?: string | null): EftRoute {
  if (routeKey) {
    const hit = EFT_ROUTES.find((r) => r.key === routeKey)
    if (hit) return hit
  }
  const weekdayIndex = Math.max(0, new Date(clockMs + 2 * 60 * 60 * 1000).getUTCDay() - 1)
  return EFT_ROUTES[weekdayIndex % EFT_ROUTES.length]!
}

export function shortInvoiceNumber(amountZar: number, clockMs: number): string {
  const d = new Date(clockMs + 2 * 60 * 60 * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const suffix = String(Math.round(amountZar * 100)).slice(-6).padStart(6, '0')
  return `ECM-EFT-${y}${m}${day}-${suffix}`
}

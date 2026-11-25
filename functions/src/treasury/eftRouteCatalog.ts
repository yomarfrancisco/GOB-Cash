/**
 * Residual / replacement EFT corridors.
 * Facts from account-confirmation letters — never invented by an LLM.
 * Route selection is deterministic (weekday rotation); the routing engine owns “which payer”.
 */

import { BANKER_DIRECTORY, type BankerDirectoryEntry } from '../routing/bankerDirectory'
import { COMPANIES, type CompanyRecord } from '../settlement/register'

export type BankAccountFacts = {
  bankName: string
  accountName: string
  accountNumber: string
  branchCode?: string
  nib?: string
  iban?: string
  swift?: string
  currency: 'MZN' | 'ZAR'
  accountType?: string
}

export type EftRoute = {
  key: string
  label: string
  banker: BankerDirectoryEntry
  payer: CompanyRecord
  payerAccount: BankAccountFacts
  beneficiaryCompany: CompanyRecord
  beneficiaryBank: BankAccountFacts
  railId: 'econometrica_capitec' | 'lemon_fnb' | 'wolf_fnb' | 'imani_fnb'
}

function banker(key: BankerDirectoryEntry['key']): BankerDirectoryEntry {
  const row = BANKER_DIRECTORY.find((b) => b.key === key)
  if (!row) throw new Error(`Missing banker ${key}`)
  return row
}

const ECONOMETRICA = {
  ...COMPANIES.econometrica!,
  legalName: 'Econometrica (Pty) Ltd',
  tradingAs: 'Paga',
  registrationNumber: '2026/785154/07',
  addressLines: [
    'Unit 875 Polofields Lifestyle Estate',
    'Waterfall City, Midrand',
    'Gauteng, 2066, South Africa',
  ],
} as CompanyRecord

const LEMON = COMPANIES.lemon_economics!
const IMANI = COMPANIES.imani!
const WOLF_SA = COMPANIES.wolf_and_sons!
const BRICS_EI = COMPANIES.brics_ai_ei!
const VIDROTEC = COMPANIES.vidrotec!
const GOBLIN = COMPANIES.goblin!
const WOLF_MZ = COMPANIES.wolf_digital!

/** Capitec Business — Account Confirmation_2139 */
export const ECONOMETRICA_CAPITEC: BankAccountFacts = {
  bankName: 'Capitec Business',
  accountName: 'ECONOMETRICA (PTY) LTD',
  accountNumber: '1055902139',
  branchCode: '450105',
  swift: 'CABLZAJJ',
  currency: 'ZAR',
  accountType: 'Capitec Business Account',
}

/** FNB SA — BRICS AI (Pty) Ltd / Lemon Economics */
export const LEMON_FNB_SA: BankAccountFacts = {
  bankName: 'First National Bank',
  accountName: 'BRICS AI (PTY) LTD',
  accountNumber: '63183630649',
  branchCode: '250655',
  swift: 'FIRNZAJJ',
  currency: 'ZAR',
  accountType: 'Gold Business Account',
}

/** FNB SA — Imani Beauty Distributors */
export const IMANI_FNB_SA: BankAccountFacts = {
  bankName: 'First National Bank',
  accountName: 'IMANI BEAUTY DISTRIBUTORS (PTY) LTD',
  accountNumber: '63221311565',
  branchCode: '240129',
  swift: 'FIRNZAJJ',
  currency: 'ZAR',
  accountType: 'Gold Business Account',
}

/** FNB SA — Wolf and Sons (Woodmead) */
export const WOLF_FNB_SA: BankAccountFacts = {
  bankName: 'First National Bank',
  accountName: 'WOLF AND SONS (PTY) LTD',
  accountNumber: '63228043559',
  branchCode: '250955',
  swift: 'FIRNZAJJ',
  currency: 'ZAR',
  accountType: 'Gold Business Account',
}

/** FNB Mozambique — BRICS AI, EI (abertura de conta) */
export const BRICS_EI_FNB_MZ: BankAccountFacts = {
  bankName: 'FNB Moçambique',
  accountName: 'BRICS AI, EI',
  accountNumber: '4829002310001',
  nib: '001400004829002310141',
  iban: 'MZ59001400004829002310141',
  swift: 'FIRNMZMX',
  currency: 'MZN',
  accountType: 'Current',
}

/** Vista — BRICS AI EI */
export const BRICS_EI_VISTA: BankAccountFacts = {
  bankName: 'Vista Bank Moçambique',
  accountName: 'BRICS AI EI',
  accountNumber: '433853',
  nib: '001100030000043385310',
  currency: 'MZN',
  accountType: 'Current',
}

/** Moza — Goblin Research Advisory Lda */
export const GOBLIN_MOZA: BankAccountFacts = {
  bankName: 'Moza Banco',
  accountName: 'GOBLIN RESEARCH ADVISORY LDA',
  accountNumber: '4841939810001',
  nib: '003400004841939810190',
  iban: 'MZ59003400004841939810190',
  swift: 'MOZAMZMA',
  currency: 'MZN',
  accountType: 'Empresa',
}

/** Moza — Wolf Digital Lda */
export const WOLF_DIGITAL_MOZA: BankAccountFacts = {
  bankName: 'Moza Banco',
  accountName: 'WOLF DIGITAL LDA',
  accountNumber: '4841111710001',
  nib: '003400004841111710132',
  iban: 'MZ59003400004841111710132',
  swift: 'MOZAMZMA',
  currency: 'MZN',
  accountType: 'Empresa',
}

/** BIM — Vidrotec */
export const VIDROTEC_BIM: BankAccountFacts = {
  bankName: 'Millennium bim',
  accountName: 'VIDROTEC SOC UNIPESSOAL LDA',
  accountNumber: '356558906',
  nib: '000100000035655890657',
  iban: 'MZ59000100000035655890657',
  swift: 'BIMOMZMXXXX',
  currency: 'MZN',
  accountType: 'Current',
}

/**
 * Weekday-rotated residual corridors.
 * Each row: Moz instructing bank + remitter account → SA beneficiary account.
 */
export const EFT_ROUTES: readonly EftRoute[] = [
  {
    key: 'bim__vidrotec__econometrica_capitec',
    label: 'BIM Vidrotec → Econometrica Capitec',
    banker: banker('bim'),
    payer: VIDROTEC,
    payerAccount: VIDROTEC_BIM,
    beneficiaryCompany: ECONOMETRICA,
    beneficiaryBank: ECONOMETRICA_CAPITEC,
    railId: 'econometrica_capitec',
  },
  {
    key: 'moza__goblin__econometrica_capitec',
    label: 'Moza Goblin → Econometrica Capitec',
    banker: banker('moza'),
    payer: GOBLIN,
    payerAccount: GOBLIN_MOZA,
    beneficiaryCompany: ECONOMETRICA,
    beneficiaryBank: ECONOMETRICA_CAPITEC,
    railId: 'econometrica_capitec',
  },
  {
    key: 'fnb_mz__brics_ei__lemon_fnb',
    label: 'FNB Moz BRICS AI EI → Lemon FNB SA',
    banker: banker('fnb_mz'),
    payer: BRICS_EI,
    payerAccount: BRICS_EI_FNB_MZ,
    beneficiaryCompany: LEMON,
    beneficiaryBank: LEMON_FNB_SA,
    railId: 'lemon_fnb',
  },
  {
    key: 'absa_mz__brics_ei__econometrica_capitec',
    label: 'Absa Moz BRICS AI EI → Econometrica Capitec',
    banker: banker('absa_mz'),
    payer: BRICS_EI,
    // Absa Moz company letter not in pack — use FNB Moz BRICS EI as remitter facts for now.
    payerAccount: { ...BRICS_EI_FNB_MZ, bankName: 'Absa Moçambique' },
    beneficiaryCompany: ECONOMETRICA,
    beneficiaryBank: ECONOMETRICA_CAPITEC,
    railId: 'econometrica_capitec',
  },
  {
    key: 'vista_mz__brics_ei__imani_fnb',
    label: 'Vista BRICS AI EI → Imani FNB SA',
    banker: banker('vista_mz'),
    payer: BRICS_EI,
    payerAccount: BRICS_EI_VISTA,
    beneficiaryCompany: IMANI,
    beneficiaryBank: IMANI_FNB_SA,
    railId: 'imani_fnb',
  },
  {
    key: 'moza__wolf_digital__wolf_fnb',
    label: 'Moza Wolf Digital → Wolf FNB SA',
    banker: banker('moza'),
    payer: WOLF_MZ,
    payerAccount: WOLF_DIGITAL_MOZA,
    beneficiaryCompany: WOLF_SA,
    beneficiaryBank: WOLF_FNB_SA,
    railId: 'wolf_fnb',
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

export function shortInvoiceNumber(amountZar: number, clockMs: number, prefix = 'ECM'): string {
  const d = new Date(clockMs + 2 * 60 * 60 * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const suffix = String(Math.round(amountZar * 100)).slice(-6).padStart(6, '0')
  const p = (prefix || 'ECM').slice(0, 3).toUpperCase()
  return `${p}-EFT-${y}${m}${day}-${suffix}`
}

export function invoicePrefixForRoute(route: EftRoute): string {
  return route.beneficiaryCompany.invoicePrefix || 'ECM'
}

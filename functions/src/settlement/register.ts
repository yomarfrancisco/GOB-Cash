/**
 * Consortium company register for principal settlement.
 * POS merchants invoice Mozambique buyers. HOE is upstream only — no rail.
 */

import { costMarkupFromIssuingBank } from '../fx/quotedMznZar'

export type PartyKind = 'pos_merchant' | 'moz_buyer' | 'upstream_supplier'

export type AcquirerId = 'fnb' | 'capitec'

export type RailId = 'lemon_fnb' | 'imani_fnb' | 'wolf_fnb' | 'lemon_capitec'

export type CompanyRecord = {
  id: string
  kind: PartyKind
  legalName: string
  formerLegalName?: string | null
  tradingAs?: string | null
  entityContinuity?: string | null
  registrationNumber: string | null
  taxNumber: string | null
  nuit: string | null
  addressLines: string[]
  country: 'ZA' | 'MZ'
  relatedPartyNote?: string | null
  supplyCategory: string
  logoAsset: string | null
  invoicePrefix: string | null
}

export type RailRecord = {
  id: RailId
  machineId: number
  acquirer: AcquirerId
  merchantId: string
  terminalId: string | null
  outletNumber?: string | null
  descriptor: string
  companyId: string
  zarAvailableRule: 'fnb_gross_settlement' | 'capitec_net_payout'
}

export type BuyerCardRecord = {
  deskCardId: number
  shortName: string
  companyId: string
  issuingBank: string
  cardBin6: string
  cardLast4: string
  masked: string
}

export const COMPANIES: Record<string, CompanyRecord> = {
  lemon_economics: {
    id: 'lemon_economics',
    kind: 'pos_merchant',
    legalName: 'Lemon Economics',
    formerLegalName: 'BRICS AI (Pty) Ltd',
    entityContinuity: 'same legal entity following registered name change',
    registrationNumber: '2025/892761/07',
    taxNumber: '9169211290',
    nuit: null,
    addressLines: ['53 2nd Avenue', 'Houghton Estate', 'Johannesburg, Gauteng, 2198', 'South Africa'],
    country: 'ZA',
    relatedPartyNote: 'Directed by Ygor Francisco; related to Mozambique buyers under common control.',
    supplyCategory:
      'Proprietary software, analytical methodologies, artificial-intelligence systems, cloud infrastructure, competitive-intelligence platforms and related professional computer and information services (Schedule A).',
    logoAsset: 'lemon-economics.png',
    invoicePrefix: 'LEM',
  },
  imani: {
    id: 'imani',
    kind: 'pos_merchant',
    legalName: 'Imani Beauty Distributors (Pty) Ltd',
    registrationNumber: '2026/556610/07',
    taxNumber: '9501237235',
    nuit: null,
    addressLines: [
      'Unit 875, The Polofields Lifestyle Estate',
      'Waterfall City, Johannesburg',
      'Gauteng, 2066, South Africa',
    ],
    country: 'ZA',
    relatedPartyNote: 'Directed by Martha Somaes; co-director of Lemon Economics.',
    supplyCategory: 'Premium hair, wigs and beauty supplies (wholesale).',
    logoAsset: 'imani-beauty.png',
    invoicePrefix: 'IBD',
  },
  wolf_and_sons: {
    id: 'wolf_and_sons',
    kind: 'pos_merchant',
    legalName: 'Wolf and Sons',
    tradingAs: 'WandSons',
    registrationNumber: '2026/644517/07',
    taxNumber: '9116577298',
    nuit: null,
    addressLines: ['1 Polofields Drive', 'Waterfall City, Johannesburg', 'Gauteng, 2066, South Africa'],
    country: 'ZA',
    relatedPartyNote: 'Directed by Ygor Francisco.',
    supplyCategory:
      'Management consultancy, econometric and related professional services to business clients across Southern Africa.',
    logoAsset: 'wolf-and-sons.png',
    invoicePrefix: 'WAS',
  },
  house_of_exports: {
    id: 'house_of_exports',
    kind: 'upstream_supplier',
    legalName: 'House of Exports',
    registrationNumber: '2021/975934/07',
    taxNumber: '9370768203',
    nuit: null,
    addressLines: ['Unit 5, 128 Boeing Road East', 'Bedfordview, Gauteng, 2007', 'South Africa'],
    country: 'ZA',
    relatedPartyNote: 'Directed by Omar Luis Francisco; supplies Imani for resale. No POS rail.',
    supplyCategory: 'Import/export supply of goods subsequently resold by POS merchants.',
    logoAsset: 'house-of-exports.png',
    invoicePrefix: 'HOE',
  },
  brics_ai_ei: {
    id: 'brics_ai_ei',
    kind: 'moz_buyer',
    legalName: 'BRICS AI, EI',
    registrationNumber: '69406/11/01/PS/2026',
    taxNumber: null,
    nuit: '119386039',
    addressLines: [
      'Av./Rua Filipe Samuel Magaia No. 1026, R/C',
      'Bairro Central, Kampfumo',
      'Maputo, Mozambique',
    ],
    country: 'MZ',
    relatedPartyNote: 'Sole proprietorship of Ygor Omar Francisco — related-party buyer.',
    supplyCategory: 'Computer programming and related IT services (buyer).',
    logoAsset: null,
    invoicePrefix: null,
  },
  multivendas: {
    id: 'multivendas',
    kind: 'moz_buyer',
    legalName: 'Multi-Vendas, Limitada',
    tradingAs: 'GINAV',
    registrationNumber: '100584638',
    taxNumber: null,
    nuit: '400013306',
    addressLines: [
      'Av. Zedequias Manganhela nº 91, 3º Andar, Esquerdo',
      'Bairro Central, Kampfumo',
      'Maputo, Mozambique',
    ],
    country: 'MZ',
    relatedPartyNote: 'Omar Luís Francisco 90%; invoices may show trading as GINAV.',
    supplyCategory: 'Wholesale/retail trade, import and export (buyer).',
    logoAsset: 'multivendas.png',
    invoicePrefix: null,
  },
  vidrotec: {
    id: 'vidrotec',
    kind: 'moz_buyer',
    legalName: 'Vidrotec, Sociedade Unipessoal, Lda',
    registrationNumber: '100540193',
    taxNumber: null,
    nuit: '400580715',
    addressLines: [
      'Av. Samora Machel No. 172 A, R/C',
      'Bairro Matola Sede, Matola Cidade',
      'Mozambique',
    ],
    country: 'MZ',
    relatedPartyNote: 'Sole shareholder Omar Luís Francisco.',
    supplyCategory: 'Hardware, building materials and glass installation (buyer).',
    logoAsset: null,
    invoicePrefix: null,
  },
  wolf_digital: {
    id: 'wolf_digital',
    kind: 'moz_buyer',
    legalName: 'Wolf Digital, Lda',
    registrationNumber: '105079012',
    taxNumber: null,
    nuit: '402240008',
    addressLines: [
      'Av. Filipe Samuel Magaia No. 1026, R/C',
      'Bairro Central, Kampfumo',
      'Maputo, Mozambique',
    ],
    country: 'MZ',
    relatedPartyNote: 'Administered by Ygor Omar Francisco; 10% of Goblin.',
    supplyCategory: 'Digital services buyer under Schedule A lines.',
    logoAsset: 'wolf-digital.png',
    invoicePrefix: null,
  },
  goblin: {
    id: 'goblin',
    kind: 'moz_buyer',
    legalName: 'Goblin Research Advisory, Lda',
    registrationNumber: '105079216',
    taxNumber: null,
    nuit: '402243181',
    addressLines: [
      'Av. Filipe Samuel Magaia No. 1026, R/C',
      'Bairro Central, Kampfumo',
      'Maputo, Mozambique',
    ],
    country: 'MZ',
    relatedPartyNote: 'Ygor Omar Francisco 90%; Wolf Digital 10%.',
    supplyCategory: 'Economic research and advisory buyer under Schedule A lines.',
    logoAsset: 'goblin-research.png',
    invoicePrefix: null,
  },
}

/** Machine ids stay 1–4 for the live kernel. Rail 4 is Wolf FNB (was Capitec). */
export const RAILS: RailRecord[] = [
  {
    id: 'lemon_fnb',
    machineId: 1,
    acquirer: 'fnb',
    merchantId: '150000001004090',
    terminalId: '67368744',
    outletNumber: '100000002757978',
    descriptor: '*BRICS AI (PTY) LTD',
    companyId: 'lemon_economics',
    zarAvailableRule: 'fnb_gross_settlement',
  },
  {
    id: 'imani_fnb',
    machineId: 2,
    acquirer: 'fnb',
    merchantId: '100000002821196',
    terminalId: '67379427',
    descriptor: 'imani',
    companyId: 'imani',
    zarAvailableRule: 'fnb_gross_settlement',
  },
  {
    id: 'lemon_capitec',
    machineId: 3,
    acquirer: 'capitec',
    merchantId: '000000103951778',
    terminalId: 'NN184154',
    descriptor: 'BRICS AI',
    companyId: 'lemon_economics',
    zarAvailableRule: 'capitec_net_payout',
  },
  {
    id: 'wolf_fnb',
    machineId: 4,
    acquirer: 'fnb',
    merchantId: '100000002904331',
    terminalId: '67390368',
    descriptor: 'WandSons',
    companyId: 'wolf_and_sons',
    zarAvailableRule: 'fnb_gross_settlement',
  },
]

export const BUYER_CARDS: BuyerCardRecord[] = [
  {
    deskCardId: 1,
    shortName: 'BRICS',
    companyId: 'brics_ai_ei',
    issuingBank: 'FNB Mozambique',
    cardBin6: '478705',
    cardLast4: '2921',
    masked: '478705******2921',
  },
  {
    deskCardId: 1,
    shortName: 'BRICS',
    companyId: 'brics_ai_ei',
    issuingBank: 'FNB Mozambique',
    cardBin6: '478705',
    cardLast4: '8594',
    masked: '478705******8594',
  },
  {
    deskCardId: 2,
    shortName: 'Ginav',
    companyId: 'multivendas',
    issuingBank: 'Standard Bank Mozambique',
    cardBin6: '469617',
    cardLast4: '8871',
    masked: '469617******8871',
  },
  {
    deskCardId: 3,
    shortName: 'Vidrotec',
    companyId: 'vidrotec',
    issuingBank: 'Millennium BIM',
    cardBin6: '428670',
    cardLast4: '6696',
    masked: '428670******6696',
  },
  {
    deskCardId: 4,
    shortName: 'Wolf',
    companyId: 'wolf_digital',
    issuingBank: 'BCI',
    cardBin6: '441279',
    cardLast4: '0955',
    masked: '441279******0955',
  },
  {
    deskCardId: 5,
    shortName: 'Goblin',
    companyId: 'goblin',
    issuingBank: 'BCI',
    cardBin6: '441279',
    cardLast4: '0922',
    masked: '441279******0922',
  },
]

export function companyOf(id: string): CompanyRecord {
  const row = COMPANIES[id]
  if (!row) throw new Error(`unknown company ${id}`)
  return row
}

export function railByMachineId(machineId: number): RailRecord | null {
  return RAILS.find((row) => row.machineId === machineId) || null
}

export function railByMerchantId(merchantId: string): RailRecord | null {
  const needle = merchantId.replace(/\D/g, '')
  return (
    RAILS.find((row) => row.merchantId.replace(/\D/g, '') === needle) ||
    RAILS.find((row) => row.merchantId === merchantId) ||
    null
  )
}

export function buyerByCardLast4(last4: string): BuyerCardRecord | null {
  return BUYER_CARDS.find((row) => row.cardLast4 === last4) || null
}

export function buyerByDeskCardId(deskCardId: number): BuyerCardRecord | null {
  return BUYER_CARDS.find((row) => row.deskCardId === deskCardId) || null
}

/** COST markup for a desk card's Moz issuing bank. */
export function costMarkupForDeskCardId(deskCardId: number): number {
  return costMarkupFromIssuingBank(buyerByDeskCardId(deskCardId)?.issuingBank)
}

export function resolveMerchantDescriptor(descriptor: string | null | undefined): CompanyRecord | null {
  if (!descriptor) return null
  const lower = descriptor.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (/brics\s*ai|lemon\s*economics/.test(lower)) return COMPANIES.lemon_economics!
  if (/imani/.test(lower)) return COMPANIES.imani!
  if (/wand\s*sons|wolf\s*and\s*sons|wolf\s*&\s*sons/.test(lower)) return COMPANIES.wolf_and_sons!
  return null
}

/** Schedule A line catalogue for Lemon Economics invoices. */
export const LEMON_SCHEDULE_A_LINES = [
  {
    sku: 'ACD-CI',
    description: 'Competitive Intelligence Platform — Algorithmic Coordination Diagnostic (ACD) access and reporting',
  },
  {
    sku: 'AI-AGENT',
    description: 'AI Intelligence Agent — dataset ingestion, intelligence reports and anomaly monitoring',
  },
  {
    sku: 'DATA-INT',
    description: 'Data Integration Services — secure pipelines to analytics, agent and dashboard',
  },
  {
    sku: 'INFRA',
    description: 'Infrastructure and Deployment — cloud, hosting, version control and optimisation',
  },
  {
    sku: 'MAINT',
    description: 'Maintenance and Support — software maintenance, patches and operational continuity',
  },
  {
    sku: 'CONSULT',
    description: 'Professional Consulting — technology strategy, architecture and implementation support',
  },
] as const

export type CountryCode =
  | 'MZ' // Mozambique
  | 'ZA' // South Africa
  | 'ZM' // Zambia
  | 'ZW' // Zimbabwe
  | 'NA' // Namibia
  | 'MU' // Mauritius
  | 'MW' // Malawi
  | 'LS' // Lesotho
  | 'BW' // Botswana

export type BankAccountDetails = {
  countryCode: CountryCode
  countryName: string
  recipient: string
  bankName: string
  accountNumber: string
  accountType: string
  swift: string
  referencePrefix: string // e.g. "BRICS4DC7RB"
}

// For Mozambique, we support multiple banks
export type MozambiqueBank = 'BCI' | 'ABSA'
// For South Africa, we support multiple banks
export type SouthAfricaBank = 'FNB'
// Union type for all bank selections
export type SelectedBank = MozambiqueBank | SouthAfricaBank

// Mozambique bank accounts (multiple banks supported)
export const MOZAMBIQUE_BANK_ACCOUNTS: Record<'BCI' | 'ABSA', BankAccountDetails> = {
  BCI: {
    countryCode: 'MZ',
    countryName: 'Mozambique',
    recipient: 'MULTI - INVESTIMENTOS',
    bankName: 'BCI',
    accountNumber: '2009  8312  8100  01',
    accountType: 'Current / Cheque',
    swift: 'CGDIMZMA',
    referencePrefix: 'BRICS4DC7RB',
  },
  ABSA: {
    countryCode: 'MZ',
    countryName: 'Mozambique',
    recipient: 'GINAV LDA',
    bankName: 'ABSA',
    accountNumber: '0038104000117',
    accountType: 'Current / Cheque',
    swift: 'ABMZMZMA',
    referencePrefix: 'BRICSABSA7K2X9', // Pattern: BRICSABSA + 6 alphanum
  },
}

// South Africa bank accounts (multiple banks supported)
export const SOUTH_AFRICA_BANK_ACCOUNTS: Record<'FNB', BankAccountDetails> = {
  FNB: {
    countryCode: 'ZA',
    countryName: 'South Africa',
    recipient: 'BRICS AI (PTY) LTD',
    bankName: 'FNB',
    accountNumber: '63183630649', // No spaces as per user requirement
    accountType: 'GOLD BUSINESS ACCOUNT',
    swift: 'FIRNZAJJ',
    referencePrefix: 'BRICSFNB7X1Z', // Keep existing pattern
  },
}

export const DEPOSIT_BANK_ACCOUNTS: Record<CountryCode, BankAccountDetails> = {
  MZ: MOZAMBIQUE_BANK_ACCOUNTS.BCI, // Default to BCI for backward compatibility
  ZA: SOUTH_AFRICA_BANK_ACCOUNTS.FNB, // Default to FNB for backward compatibility
  ZM: {
    countryCode: 'ZM',
    countryName: 'Zambia',
    recipient: 'GoBankless (FNB)',
    bankName: 'First National Bank',
    accountNumber: '6200  0000  0000',
    accountType: 'Cheque',
    swift: 'FIRNZAJJ',
    referencePrefix: 'GBLSZAMB',
  },
  ZW: {
    countryCode: 'ZW',
    countryName: 'Zimbabwe',
    recipient: 'GoBankless (FNB)',
    bankName: 'First National Bank',
    accountNumber: '6200  0000  0000',
    accountType: 'Cheque',
    swift: 'FIRNZAJJ',
    referencePrefix: 'GBLSZWIM',
  },
  NA: {
    countryCode: 'NA',
    countryName: 'Namibia',
    recipient: 'GoBankless (FNB)',
    bankName: 'First National Bank',
    accountNumber: '6200  0000  0000',
    accountType: 'Cheque',
    swift: 'FIRNZAJJ',
    referencePrefix: 'GBLSNAMI',
  },
  MU: {
    countryCode: 'MU',
    countryName: 'Mauritius',
    recipient: 'GoBankless (FNB)',
    bankName: 'First National Bank',
    accountNumber: '6200  0000  0000',
    accountType: 'Cheque',
    swift: 'FIRNZAJJ',
    referencePrefix: 'GBLSMAUR',
  },
  MW: {
    countryCode: 'MW',
    countryName: 'Malawi',
    recipient: 'GoBankless (FNB)',
    bankName: 'First National Bank',
    accountNumber: '6200  0000  0000',
    accountType: 'Cheque',
    swift: 'FIRNZAJJ',
    referencePrefix: 'GBLSMALA',
  },
  LS: {
    countryCode: 'LS',
    countryName: 'Lesotho',
    recipient: 'GoBankless (FNB)',
    bankName: 'First National Bank',
    accountNumber: '6200  0000  0000',
    accountType: 'Cheque',
    swift: 'FIRNZAJJ',
    referencePrefix: 'GBLSLESO',
  },
  BW: {
    countryCode: 'BW',
    countryName: 'Botswana',
    recipient: 'GoBankless (FNB)',
    bankName: 'First National Bank',
    accountNumber: '6200  0000  0000',
    accountType: 'Cheque',
    swift: 'FIRNZAJJ',
    referencePrefix: 'GBLSBOTS',
  },
}

// Country display config for CountrySelectSheet
export const COUNTRY_SELECT_OPTIONS: Array<{
  code: CountryCode
  name: string
  flagPath: string
  subtitle: string
}> = [
  {
    code: 'MZ',
    name: 'Mozambique',
    flagPath: '/assets/mozambique.png',
    subtitle: 'Deposits to BCI or ABSA · Maputo',
  },
  {
    code: 'ZA',
    name: 'South Africa',
    flagPath: '/assets/south africa.png',
    subtitle: 'Deposits to FNB',
  },
  {
    code: 'ZM',
    name: 'Zambia',
    flagPath: '/assets/zambia.png',
    subtitle: 'Deposits to First National Bank',
  },
  {
    code: 'ZW',
    name: 'Zimbabwe',
    flagPath: '/assets/zimbabwe.png',
    subtitle: 'Deposits to First National Bank',
  },
  {
    code: 'NA',
    name: 'Namibia',
    flagPath: '/assets/namibia.png',
    subtitle: 'Deposits to First National Bank',
  },
  {
    code: 'MU',
    name: 'Mauritius',
    flagPath: '/assets/mauritius.png',
    subtitle: 'Deposits to First National Bank',
  },
  {
    code: 'MW',
    name: 'Malawi',
    flagPath: '/assets/malawi.png',
    subtitle: 'Deposits to First National Bank',
  },
  {
    code: 'LS',
    name: 'Lesotho',
    flagPath: '/assets/lesotho.png',
    subtitle: 'Deposits to First National Bank',
  },
  {
    code: 'BW',
    name: 'Botswana',
    flagPath: '/assets/botswana.png',
    subtitle: 'Deposits to First National Bank',
  },
]


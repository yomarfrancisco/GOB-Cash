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

export const DEPOSIT_BANK_ACCOUNTS: Record<CountryCode, BankAccountDetails> = {
  MZ: {
    countryCode: 'MZ',
    countryName: 'Mozambique',
    recipient: 'MULTI - INVESTIMENTOS',
    bankName: 'BCI',
    accountNumber: '2009  8312  8100  01',
    accountType: 'Current / Cheque',
    swift: 'CGDIMZMA',
    referencePrefix: 'BRICS4DC7RB',
  },
  ZA: {
    countryCode: 'ZA',
    countryName: 'South Africa',
    recipient: 'GoBankless (FNB)',
    bankName: 'First National Bank',
    accountNumber: '6200  0000  0000',
    accountType: 'Cheque',
    swift: 'FIRNZAJJ',
    referencePrefix: 'GBLSSAFR',
  },
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
    subtitle: 'Deposits via BCI · Maputo',
  },
  {
    code: 'ZA',
    name: 'South Africa',
    flagPath: '/assets/south africa.png',
    subtitle: 'Deposits via First National Bank',
  },
  {
    code: 'ZM',
    name: 'Zambia',
    flagPath: '/assets/zambia.png',
    subtitle: 'Deposits via First National Bank',
  },
  {
    code: 'ZW',
    name: 'Zimbabwe',
    flagPath: '/assets/zimbabwe.png',
    subtitle: 'Deposits via First National Bank',
  },
  {
    code: 'NA',
    name: 'Namibia',
    flagPath: '/assets/namibia.png',
    subtitle: 'Deposits via First National Bank',
  },
  {
    code: 'MU',
    name: 'Mauritius',
    flagPath: '/assets/mauritius.png',
    subtitle: 'Deposits via First National Bank',
  },
  {
    code: 'MW',
    name: 'Malawi',
    flagPath: '/assets/malawi.png',
    subtitle: 'Deposits via First National Bank',
  },
  {
    code: 'LS',
    name: 'Lesotho',
    flagPath: '/assets/lesotho.png',
    subtitle: 'Deposits via First National Bank',
  },
  {
    code: 'BW',
    name: 'Botswana',
    flagPath: '/assets/botswana.png',
    subtitle: 'Deposits via First National Bank',
  },
]


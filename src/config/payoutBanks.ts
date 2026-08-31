export type PayoutBank = {
  name: string
  swift: string
  logo?: string
}

export const MOZAMBIQUE_PAYOUT_BANKS: PayoutBank[] = [
  { name: 'ABSA', swift: 'ABMZMZMA', logo: '/assets/ABSA_logo.png' },
  { name: 'BCI', swift: 'CGDIMZMA', logo: '/assets/BCI_logo.png' },
  { name: 'FNB Mozambique', swift: 'FIRNMZMX', logo: '/assets/fnb_logo.png' },
  { name: 'Millennium BIM', swift: 'BIMOMZMXXXX', logo: '/assets/BIM_LOGO.png' },
  { name: 'Moza Banco', swift: 'MOZAMZMA', logo: '/assets/moza_logo.png' },
  { name: 'Vista Bank', swift: 'VSTBMZMA', logo: '/assets/vista_logo.png' },
]

export const SOUTH_AFRICA_PAYOUT_BANKS: PayoutBank[] = [
  { name: 'Absa', swift: 'ABSAZAJJ', logo: '/assets/ABSA_logo.png' },
  { name: 'African Bank', swift: 'AFRCZAJJ', logo: '/assets/African-Bank-Logo.png' },
  { name: 'Capitec', swift: 'CABLZAJJ', logo: '/assets/capitec.png' },
  { name: 'Discovery Bank', swift: 'DISCZAJJ', logo: '/assets/Discoverybank.png' },
  { name: 'FNB', swift: 'FIRNZAJJ', logo: '/assets/fnb_logo.png' },
  { name: 'Investec', swift: 'IVESZAJJ', logo: '/assets/Investec.png' },
  { name: 'Nedbank', swift: 'NEDSZAJJ', logo: '/assets/Nedbank.png' },
  { name: 'Standard Bank', swift: 'SBZAZAJJ', logo: '/assets/standardBank.png' },
  { name: 'TymeBank', swift: 'TYMBZAJJ', logo: '/assets/tymebank.png' },
]

export function getPayoutBanks(country: 'Mozambique' | 'South Africa'): PayoutBank[] {
  return country === 'Mozambique' ? MOZAMBIQUE_PAYOUT_BANKS : SOUTH_AFRICA_PAYOUT_BANKS
}

export function findPayoutBank(country: 'Mozambique' | 'South Africa', bankName: string): PayoutBank | undefined {
  return getPayoutBanks(country).find((bank) => bank.name === bankName)
}

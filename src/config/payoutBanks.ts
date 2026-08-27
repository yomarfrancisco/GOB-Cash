export type PayoutBank = {
  name: string
  swift: string
}

export const MOZAMBIQUE_PAYOUT_BANKS: PayoutBank[] = [
  { name: 'ABSA', swift: 'ABMZMZMA' },
  { name: 'BCI', swift: 'CGDIMZMA' },
  { name: 'FNB Mozambique', swift: 'FIRNMZMX' },
  { name: 'Millennium BIM', swift: 'BIMOMZMXXXX' },
  { name: 'Moza Banco', swift: 'MOZAMZMA' },
  { name: 'Vista Bank', swift: 'VSTBMZMA' },
]

export const SOUTH_AFRICA_PAYOUT_BANKS: PayoutBank[] = [
  { name: 'Absa', swift: 'ABSAZAJJ' },
  { name: 'African Bank', swift: 'AFRCZAJJ' },
  { name: 'Capitec', swift: 'CABLZAJJ' },
  { name: 'Discovery Bank', swift: 'DISCZAJJ' },
  { name: 'FNB', swift: 'FIRNZAJJ' },
  { name: 'Investec', swift: 'IVESZAJJ' },
  { name: 'Nedbank', swift: 'NEDSZAJJ' },
  { name: 'Standard Bank', swift: 'SBZAZAJJ' },
  { name: 'TymeBank', swift: 'TYMBZAJJ' },
]

export function getPayoutBanks(country: 'Mozambique' | 'South Africa'): PayoutBank[] {
  return country === 'Mozambique' ? MOZAMBIQUE_PAYOUT_BANKS : SOUTH_AFRICA_PAYOUT_BANKS
}

export function findPayoutBank(country: 'Mozambique' | 'South Africa', bankName: string): PayoutBank | undefined {
  return getPayoutBanks(country).find((bank) => bank.name === bankName)
}

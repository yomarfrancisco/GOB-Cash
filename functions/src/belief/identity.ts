/**
 * Explicit identity examples for merchant principals vs card-issuing banks.
 * Merchant principals are not card issuers.
 */
import { CARD_ISSUING_BANKS, MERCHANT_PRINCIPALS } from './types'

export { CARD_ISSUING_BANKS, MERCHANT_PRINCIPALS }

export function isMerchantPrincipal(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(MERCHANT_PRINCIPALS, id)
}

export function isCardIssuingBank(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(CARD_ISSUING_BANKS, id)
}

export const IDENTITY_EXAMPLES = {
  merchantPrincipals: [
    { id: 'lemon_economics', label: MERCHANT_PRINCIPALS.lemon_economics },
    { id: 'wolf_and_sons', label: MERCHANT_PRINCIPALS.wolf_and_sons },
    { id: 'imani_beauty', label: MERCHANT_PRINCIPALS.imani_beauty },
  ],
  cardIssuingBanks: [
    { id: 'bim', label: CARD_ISSUING_BANKS.bim },
    { id: 'bci', label: CARD_ISSUING_BANKS.bci },
    { id: 'fnb_mozambique', label: CARD_ISSUING_BANKS.fnb_mozambique },
    { id: 'vista', label: CARD_ISSUING_BANKS.vista },
    { id: 'standard_bank_mozambique', label: CARD_ISSUING_BANKS.standard_bank_mozambique },
  ],
} as const

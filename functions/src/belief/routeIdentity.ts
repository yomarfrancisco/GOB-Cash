/**
 * Map desk / settlement / bank-mail identifiers onto RouteEvidence keys.
 * Merchant principal ≠ card-issuing bank.
 */
import {
  buyerByDeskCardId,
  railByMachineId,
  resolveBuyerCardLast4,
  resolveMerchantDescriptor,
  type BuyerCardRecord,
} from '../settlement/register'
import type { RouteIdentityInput } from './emitters'

export function cardIssuerBankIdFromIssuingBank(bank: string | null | undefined): string | null {
  if (!bank) return null
  const lower = bank.toLowerCase()
  if (lower.includes('bim') || lower.includes('millennium')) return 'bim'
  if (lower.includes('bci')) return 'bci'
  if (lower.includes('standard')) return 'standard_bank_mozambique'
  if (lower.includes('fnb')) return 'fnb_mozambique'
  if (lower.includes('vista')) return 'vista'
  if (lower.includes('moza')) return 'moza'
  return null
}

export function merchantPrincipalFromDescriptor(descriptor: string | null | undefined): string | null {
  if (!descriptor) return null
  const company = resolveMerchantDescriptor(descriptor)
  if (company) {
    if (company.id === 'imani') return 'imani_beauty'
    return company.id
  }
  const lower = descriptor.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (/econometrica/.test(lower)) return 'econometrica'
  return null
}

export function routeIdentityFromDeskPair(input: {
  deskCardId: number
  machineId: number
  merchantPrincipalId?: string | null
  invoiceId?: string | null
  economicPaymentId?: string | null
  testRunId?: string | null
  cycleNumber?: number | null
}): RouteIdentityInput | null {
  const buyer = buyerByDeskCardId(input.deskCardId)
  const rail = railByMachineId(input.machineId)
  if (!buyer || !rail) return null
  const merchant =
    input.merchantPrincipalId ||
    (rail.companyId === 'imani' ? 'imani_beauty' : rail.companyId)
  return {
    merchantPrincipalId: merchant,
    invoiceIssuerEntityId: rail.companyId,
    mozambiqueBuyerId: buyer.payerFamilyId || buyer.canonicalCardId,
    cardId: String(input.deskCardId),
    cardIssuerBankId: cardIssuerBankIdFromIssuingBank(buyer.issuingBank),
    posTerminalId: String(input.machineId),
    acquirerBankId: rail.acquirer,
    invoiceId: input.invoiceId ?? null,
    economicPaymentId: input.economicPaymentId ?? null,
    testRunId: input.testRunId ?? null,
    cycleNumber: input.cycleNumber ?? null,
  }
}

export function routeIdentityFromBankDecline(input: {
  cardLast4: string | null
  merchant: string | null
  amountZar: number
  evidenceId: string
}): { identity: RouteIdentityInput; buyer: BuyerCardRecord } | null {
  if (!input.cardLast4) return null
  const resolved = resolveBuyerCardLast4(input.cardLast4)
  if (!resolved.ok) return null
  const buyer = resolved.buyer
  const merchant = merchantPrincipalFromDescriptor(input.merchant) || 'unknown_merchant'
  const rail =
    merchant === 'econometrica'
      ? railByMachineId(5)
      : merchant === 'imani_beauty'
        ? railByMachineId(2)
        : merchant === 'wolf_and_sons'
          ? railByMachineId(4)
          : merchant === 'lemon_economics'
            ? railByMachineId(1)
            : null
  return {
    buyer,
    identity: {
      merchantPrincipalId: merchant,
      invoiceIssuerEntityId: rail?.companyId || merchant,
      mozambiqueBuyerId: buyer.payerFamilyId || buyer.canonicalCardId,
      cardId: String(buyer.deskCardId),
      cardIssuerBankId: cardIssuerBankIdFromIssuingBank(buyer.issuingBank),
      posTerminalId: rail ? String(rail.machineId) : null,
      acquirerBankId: rail?.acquirer || null,
      invoiceId: null,
      economicPaymentId: `bank-decline-${input.evidenceId}`,
      testRunId: null,
      cycleNumber: null,
    },
  }
}

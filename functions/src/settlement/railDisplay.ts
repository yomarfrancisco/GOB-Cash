/**
 * Operator-facing rail labels from the settlement register.
 * Inventory shortNames stay for matching; desk copy uses legal principals.
 */
import { cardShortName, machineShortName } from '../routing/inventory'
import { buyerByDeskCardId, companyOf, railByMachineId } from './register'

function acquirerLabel(acquirer: string): string {
  if (/^fnb$/i.test(acquirer)) return 'FNB'
  if (/^capitec$/i.test(acquirer)) return 'Capitec'
  return acquirer.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function payerDisplay(cardId: number): {
  buyerName: string
  issuingBank: string
  shortName: string
} {
  const buyer = buyerByDeskCardId(cardId)
  const shortName = cardShortName(cardId)
  if (!buyer) {
    return { buyerName: shortName, issuingBank: 'issuing bank', shortName }
  }
  try {
    return {
      buyerName: companyOf(buyer.companyId).legalName,
      issuingBank: buyer.issuingBank,
      shortName: buyer.shortName || shortName,
    }
  } catch {
    return { buyerName: shortName, issuingBank: buyer.issuingBank, shortName }
  }
}

export function posDisplay(machineId: number): {
  merchantName: string
  acquirer: string
  railShort: string
} {
  const rail = railByMachineId(machineId)
  const railShort = machineShortName(machineId)
  if (!rail) {
    return { merchantName: railShort, acquirer: 'acquirer', railShort }
  }
  try {
    return {
      merchantName: companyOf(rail.companyId).legalName,
      acquirer: acquirerLabel(rail.acquirer),
      railShort,
    }
  } catch {
    return {
      merchantName: railShort,
      acquirer: acquirerLabel(rail.acquirer),
      railShort,
    }
  }
}

/** Sell ticket line: amount · payer (issuer) → merchant / acquirer */
export function formatSellTicketLine(amountZar: number, cardId: number, machineId: number): string {
  const payer = payerDisplay(cardId)
  const pos = posDisplay(machineId)
  const amount = `R${amountZar.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  // Drop trailing ,00 for whole rands when locale uses comma decimals oddly — keep simple:
  const zar = Number.isInteger(amountZar)
    ? `R${amountZar.toLocaleString('en-ZA')}`
    : amount.replace(/,00$/, '')
  return `${zar} · ${payer.buyerName} (${payer.issuingBank}) → ${pos.merchantName} / ${pos.acquirer}`
}

/** Restock swipe line */
export function formatSwipeTicketLine(amountZar: number, cardId: number, machineId: number): string {
  const payer = payerDisplay(cardId)
  const pos = posDisplay(machineId)
  const zar = Number.isInteger(amountZar)
    ? `R${amountZar.toLocaleString('en-ZA')}`
    : `R${amountZar.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `${payer.shortName} (${payer.issuingBank}) on ${pos.merchantName} / ${pos.acquirer} for ${zar}`
}

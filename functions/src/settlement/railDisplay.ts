/**
 * Operator-facing rail labels.
 * Sell cards stay high-level; restock swipes use short desk names + clock times.
 */
import { cardShortName, machineShortName } from '../routing/inventory'
import { buyerByDeskCardId, companyOf, railByMachineId } from './register'

function bankShort(issuingBank: string): string {
  if (/FNB/i.test(issuingBank) && /Moz/i.test(issuingBank)) return 'FNB Moz'
  if (/Standard/i.test(issuingBank)) return 'Std Bank Moz'
  if (/BIM|Millennium/i.test(issuingBank)) return 'Millennium BIM'
  if (/BCI/i.test(issuingBank)) return 'BCI'
  return issuingBank
}

function acquirerLabel(acquirer: string): string {
  if (/^fnb$/i.test(acquirer)) return 'FNB'
  if (/^capitec$/i.test(acquirer)) return 'Capitec'
  return acquirer.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function payerDisplay(cardId: number): {
  buyerName: string
  issuingBank: string
  bankShort: string
  shortName: string
} {
  const buyer = buyerByDeskCardId(cardId)
  const shortName = cardShortName(cardId)
  if (!buyer) {
    return { buyerName: shortName, issuingBank: 'issuing bank', bankShort: 'issuer', shortName }
  }
  try {
    return {
      buyerName: companyOf(buyer.companyId).legalName,
      issuingBank: buyer.issuingBank,
      bankShort: bankShort(buyer.issuingBank),
      shortName: buyer.shortName || shortName,
    }
  } catch {
    return {
      buyerName: shortName,
      issuingBank: buyer.issuingBank,
      bankShort: bankShort(buyer.issuingBank),
      shortName,
    }
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

function formatZarCompact(amountZar: number): string {
  const rounded = Math.round(amountZar * 100) / 100
  const nearestInt = Math.round(rounded)
  if (Math.abs(rounded - nearestInt) < 0.005) {
    return `R${nearestInt.toLocaleString('en-ZA')}`
  }
  return `R${rounded.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Full legal line (rarely used on sell cards now). */
export function formatSellTicketLine(amountZar: number, cardId: number, machineId: number): string {
  const payer = payerDisplay(cardId)
  const pos = posDisplay(machineId)
  return `${formatZarCompact(amountZar)} · ${payer.buyerName} (${payer.issuingBank}) → ${pos.merchantName} / ${pos.acquirer}`
}

/** Restock swipe: short desk names — BRICS (FNB Moz) on Lemon Capitec for R1 479 */
export function formatSwipeTicketLine(amountZar: number, cardId: number, machineId: number): string {
  const payer = payerDisplay(cardId)
  const pos = posDisplay(machineId)
  return `${payer.shortName} (${payer.bankShort}) on ${pos.railShort} for ${formatZarCompact(amountZar)}`
}

import type { FnbEvent } from './fnbParse'

export type CardFloat = {
  cardLast4: string
  accountLast4: string | null
  availableZar: number | null
  reservedZar: number
  receiptedZar: number
}

export function applyFnbEvent(float: CardFloat | null, event: FnbEvent, cardLast4: string): CardFloat {
  const base: CardFloat = float || {
    cardLast4,
    accountLast4: null,
    availableZar: null,
    reservedZar: 0,
    receiptedZar: 0,
  }
  if (event.kind === 'card_spend') {
    return {
      ...base,
      accountLast4: event.accountLast4,
      reservedZar: Math.round((base.reservedZar + event.amountZar) * 100) / 100,
      availableZar:
        base.availableZar == null ? null : Math.round((base.availableZar - event.amountZar) * 100) / 100,
    }
  }
  return {
    ...base,
    receiptedZar: Math.round((base.receiptedZar + event.amountZar) * 100) / 100,
  }
}

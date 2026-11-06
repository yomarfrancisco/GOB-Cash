import { roundMajor } from './reserveBooks'

export type ReserveSplitCopy = {
  title: string
  body: string
  deskSentence: string
  dropdownTitle: string
  dropdownBody: string
  deskLedgerRows: Array<{ label: string; value: string }>
  deskStep: number
}

function fmtZar(n: number): string {
  return `R${roundMajor(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtMzn(n: number): string {
  return `Mt ${roundMajor(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDest(currency: 'ZAR' | 'MZN', n: number): string {
  return currency === 'ZAR' ? fmtZar(n) : fmtMzn(n)
}

function clearWindowLabel(settleAtMs: number | null | undefined): string {
  if (!(typeof settleAtMs === 'number' && settleAtMs > 0)) return 'the next 09:00 clear'
  const SAST = 2 * 60 * 60 * 1000
  const d = new Date(settleAtMs + SAST)
  const hours = Math.max(0, Math.ceil((settleAtMs - Date.now()) / 3_600_000))
  const clock = d.toISOString().slice(11, 16)
  if (hours <= 0) return `~${clock} SAST`
  if (hours < 30) return `~${hours}h (clears ~${clock} SAST)`
  return `tomorrow ~09:00 SAST`
}

/**
 * Desk + dropdown copy for reserve-backed conversion splits.
 * Same voice as EN_ROUTE book/clear — concise, no UI for the treasury itself.
 */
export function reserveSplitDeskCopy(params: {
  destCurrency: 'ZAR' | 'MZN'
  fundedDest: number
  instantDest: number
  routedDest: number
  settleAtMs?: number | null
}): ReserveSplitCopy {
  const funded = roundMajor(params.fundedDest)
  const instant = roundMajor(params.instantDest)
  const routed = roundMajor(params.routedDest)
  const dest = params.destCurrency
  const fundedLabel = fmtDest(dest, funded)
  const instantLabel = fmtDest(dest, instant)
  const routedLabel = fmtDest(dest, routed)
  const window = clearWindowLabel(params.settleAtMs)

  if (instant > 0 && !(routed > 0)) {
    const sentence = `${fundedLabel} funded · paid out now from reserve.`
    return {
      title: dest === 'ZAR' ? 'ZAR paid from reserve' : 'MZN paid from reserve',
      body: sentence,
      deskSentence: sentence,
      dropdownTitle: 'Paid now',
      dropdownBody: `${fundedLabel} · reserve`,
      deskLedgerRows: [
        { label: 'Funded', value: fundedLabel },
        { label: 'Paid now', value: instantLabel },
      ],
      deskStep: 4,
    }
  }

  if (!(instant > 0) && routed > 0) {
    const sentence = `${fundedLabel} funded · on ROUTE — liquid ${window}.`
    return {
      title: 'ZAR booked',
      body: sentence,
      deskSentence: sentence,
      dropdownTitle: 'On ROUTE',
      dropdownBody: `${routedLabel} · clears ${window}`,
      deskLedgerRows: [
        { label: 'Funded', value: fundedLabel },
        { label: 'On ROUTE', value: routedLabel },
        { label: 'Clears', value: window },
      ],
      deskStep: 3,
    }
  }

  const sentence = `${fundedLabel} funded · ${instantLabel} paid out now from reserve · ${routedLabel} on ROUTE — liquid ${window}.`
  return {
    title: dest === 'ZAR' ? 'ZAR split · reserve + ROUTE' : 'MZN split · reserve + ROUTE',
    body: sentence,
    deskSentence: sentence,
    dropdownTitle: 'Reserve + ROUTE',
    dropdownBody: `${instantLabel} now · ${routedLabel} ${window}`,
    deskLedgerRows: [
      { label: 'Funded', value: fundedLabel },
      { label: 'Paid now', value: instantLabel },
      { label: 'On ROUTE', value: routedLabel },
      { label: 'Clears', value: window },
    ],
    deskStep: 3,
  }
}

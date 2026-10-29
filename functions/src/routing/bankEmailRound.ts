import { BANKER_DIRECTORY, type BankerDirectoryEntry } from './bankerDirectory'

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export type BankEmailAttachmentPreview = {
  ticketId: string
  filename: string
  amountZar: number
}

export type BankEmailPreview = {
  bankKey: BankerDirectoryEntry['key']
  bank: string
  shortBank: string
  banker: string
  to: string
  salutation: string
  reason: 'untested at this amount'
  testedAmountZar: number
  sendAtMs: number
  sendTimeLabel: string
  subject: string
  bodyPt: string
  attachments: BankEmailAttachmentPreview[]
}

export type BankEmailRoundPreview = {
  roundId: string
  cycleNumber: number
  roundIndex: number
  due: boolean
  noRoundReason?: 'weekend' | 'no_eft_tickets'
  horizonHours: 24 | 72
  sendAtMs: number
  dayLabel: string
  expectedReplyAtMs: number
  expectedReplyLabel: string
  nextRoundAtMs: number
  nextRoundLabel: string
  selected: BankEmailPreview[]
  notSelected: string[]
  synthetic: true
}

export type ExpectedBankReplyPreview = {
  roundId: string
  cycleNumber: number
  replyAtMs: number
  rows: Array<{
    bankKey: BankerDirectoryEntry['key']
    bank: string
    banker: string
    testedAmountZar: number
    status: 'expected'
    wouldLearn: string
  }>
}

type EftTicketInput = {
  amount: number
  dueIso?: string | null
  ticketId?: string
}

function sastDate(ms: number): Date {
  return new Date(ms + SAST_OFFSET_MS)
}

function atSastHour(ms: number, hour: number): number {
  const d = sastDate(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour - 2, 0, 0, 0)
}

function addDays(ms: number, days: number): number {
  return ms + days * DAY_MS
}

export function formatDeskDay(ms: number): string {
  const d = sastDate(ms)
  return `${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`
}

function sastDayNumber(ms: number): number {
  const d = sastDate(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Reply previews become due on the simulated desk day, regardless of its clock hour. */
export function isExpectedBankReplyDue(
  round: Pick<BankEmailRoundPreview, 'expectedReplyAtMs'>,
  clockMs: number
): boolean {
  return sastDayNumber(clockMs) >= sastDayNumber(round.expectedReplyAtMs)
}

export function formatPtDate(ms: number): string {
  const d = sastDate(ms)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

export function formatPtZar(value: number): string {
  const fixed = Math.max(0, value).toFixed(2)
  const [whole, cents] = fixed.split('.')
  return `ZAR ${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`
}

function emailBody(
  banker: BankerDirectoryEntry,
  amountsZar: number[],
  creditByMs: number
): string {
  const totalZar = amountsZar.reduce((sum, amount) => sum + amount, 0)
  const invoiceLines = amountsZar.map(
    (amount, index) => `Factura [n.º ${index + 1}] · ${formatPtZar(amount)}`
  )
  return [
    `${banker.salutation} ${banker.banker},`,
    '',
    amountsZar.length === 1
      ? 'Junto enviamos a factura de suporte à instrução de EFT de hoje:'
      : 'Junto enviamos as facturas de suporte às instruções de EFT de hoje:',
    '',
    ...invoiceLines,
    ...(amountsZar.length > 1 ? [`Total · ${formatPtZar(totalZar)}`] : []),
    `Crédito previsto · até ${formatPtDate(creditByMs)}`,
    '',
    'Agradecemos que nos confirme se o montante pode ser processado nestas condições.',
    '',
    'Com os melhores cumprimentos,',
    '[Nome]',
    '[Empresa]',
  ].join('\n')
}

/** One round per weekday; weekends never produce expected email. */
export function isBankEmailRoundDay(clockMs: number): boolean {
  const weekday = sastDate(clockMs).getUTCDay()
  return weekday >= 1 && weekday <= 5
}

function daysUntilNextWeekday(ms: number): number {
  for (let delta = 1; delta <= 3; delta += 1) {
    if (isBankEmailRoundDay(addDays(ms, delta))) return delta
  }
  return 1
}

function selectBank(sendAtMs: number): BankerDirectoryEntry | null {
  const active = BANKER_DIRECTORY.filter((bank) => bank.active)
  if (!active.length) return null
  const weekdayIndex = Math.max(0, sastDate(sendAtMs).getUTCDay() - 1)
  return active[weekdayIndex % active.length] || null
}

export function buildBankEmailRound(input: {
  cycleNumber: number
  clockMs: number
  horizonHours: 24 | 72
  eftTickets: EftTicketInput[]
}): BankEmailRoundPreview {
  const sendAtMs = atSastHour(input.clockMs, 9)
  const roundIndex = Math.max(0, sastDate(sendAtMs).getUTCDay() - 1)
  const expectedReplyAtMs = addDays(sendAtMs, daysUntilNextWeekday(sendAtMs))
  const nextRoundAtMs = addDays(sendAtMs, daysUntilNextWeekday(sendAtMs))
  const weekdayDue = isBankEmailRoundDay(sendAtMs)
  const tickets = input.eftTickets.filter((ticket) => Number(ticket.amount) > 0)
  const due = weekdayDue && tickets.length > 0
  const banker = due ? selectBank(sendAtMs) : null
  const amountsZar = tickets.map((ticket) => Math.round(Number(ticket.amount) * 100) / 100)
  const testedAmountZar =
    Math.round(amountsZar.reduce((sum, amount) => sum + amount, 0) * 100) / 100
  const selected = banker
    ? [
      {
        bankKey: banker.key,
        bank: banker.bank,
        shortBank: banker.shortBank,
        banker: banker.banker,
        to: banker.email,
        salutation: banker.salutation,
        reason: 'untested at this amount' as const,
        testedAmountZar,
        sendAtMs,
        sendTimeLabel: '09:00',
        subject: `Instruções de EFT · ${formatPtDate(sendAtMs)} · ${formatPtZar(testedAmountZar)}`,
        bodyPt: emailBody(banker, amountsZar, addDays(sendAtMs, 2)),
        attachments: tickets.map((ticket, index) => ({
          ticketId: ticket.ticketId || `eft-c${input.cycleNumber}-${index + 1}`,
          filename: `Factura_EFT_${input.cycleNumber}_${index + 1}.pdf`,
          amountZar: amountsZar[index]!,
        })),
      },
    ]
    : []
  const selectedKeys = new Set(selected.map((row) => row.bankKey))
  return {
    roundId: `bank-email-round-c${input.cycleNumber}`,
    cycleNumber: input.cycleNumber,
    roundIndex,
    due,
    ...(!weekdayDue
      ? { noRoundReason: 'weekend' as const }
      : tickets.length === 0
        ? { noRoundReason: 'no_eft_tickets' as const }
        : {}),
    horizonHours: input.horizonHours,
    sendAtMs,
    dayLabel: formatDeskDay(sendAtMs),
    expectedReplyAtMs,
    expectedReplyLabel: formatDeskDay(expectedReplyAtMs),
    nextRoundAtMs,
    nextRoundLabel: formatDeskDay(nextRoundAtMs),
    selected,
    notSelected: BANKER_DIRECTORY.filter((bank) => bank.active && !selectedKeys.has(bank.key)).map(
      (bank) => bank.shortBank
    ),
    synthetic: true,
  }
}

export function expectedRepliesForRound(round: BankEmailRoundPreview): ExpectedBankReplyPreview | null {
  if (!round.due || !round.selected.length) return null
  return {
    roundId: round.roundId,
    cycleNumber: round.cycleNumber,
    replyAtMs: round.expectedReplyAtMs,
    rows: round.selected.map((email) => ({
      bankKey: email.bankKey,
      bank: email.bank,
      banker: email.banker,
      testedAmountZar: email.testedAmountZar,
      status: 'expected',
      wouldLearn: 'amount acceptance, timing and document needs',
    })),
  }
}

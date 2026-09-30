/**
 * E0 protected preview fixture.
 *
 * Isolation contract:
 * - Pure in-memory data only (this module).
 * - Never imports Firestore, bank-mail, invoices, wallets, or live planners.
 * - Never reads `routeEvidence` / `routeEvidenceSim` / production collections.
 * - Control actions are recorded fixture values (absorbing planner snapshots), not live decide* calls.
 * - Belief facts are precomputed explanatory strings for Sam — not LLM output.
 */

export const E0_FIXTURE_NAMESPACE = 'e0_preview_fixture_v1' as const
export const E0_ISOLATION = {
  readsProductionRouteEvidence: false,
  writesEvidence: false,
  mutatesInvoicesWalletsRoutesDecisions: false,
  callsLivePlanner: false,
  callsLlm: false,
  usesProductionBankMail: false,
  source: 'deterministic_in_memory_fixture',
  namespace: E0_FIXTURE_NAMESPACE,
} as const

export type E0LifecycleLabel =
  | 'Pending'
  | 'Delayed'
  | 'Settled evidence'
  | 'Under review'
  | 'Recovered'
  | 'Reversal recorded'

export type E0MomentId =
  | 'authorised'
  | 'captured'
  | 'delayed'
  | 'zar_available'
  | 'under_review'
  | 'recovered'
  | 'reversed'

export type E0Moment = {
  id: E0MomentId
  step: number
  title: string
  /** Compact read-only state chip. */
  label: E0LifecycleLabel
  /** Production planner recorded action (fixture snapshot). */
  controlAction: { kind: 'execute' | 'reduce_to' | 'wait' | 'bounded_exploration'; amountZar: number | null }
  /** What changed disclosure. */
  whatChanged: string
  /** Sam’s natural explanation — belief facts only. */
  samBody: string
  /** Internal lifecycle for tests — not shown as raw field names. */
  lifecycle: 'pending' | 'delayed' | 'settled' | 'under_review' | 'recovered' | 'reversal'
}

/**
 * Corrected seven-step sequence. Ordinary first zar_available → settled (not recovered).
 * zar_available after interruption → recovered.
 */
export const E0_FIXTURE_MOMENTS: E0Moment[] = [
  {
    id: 'authorised',
    step: 1,
    title: 'Payment authorised',
    label: 'Pending',
    controlAction: { kind: 'execute', amountZar: 8000 },
    whatChanged: 'Authorisation accepted on the planned route. Settlement has not arrived.',
    samBody:
      'The payment was authorised. Usable ZAR has not settled yet, so I’m treating this as pending — not as settled evidence.',
    lifecycle: 'pending',
  },
  {
    id: 'captured',
    step: 2,
    title: 'Payment captured',
    label: 'Pending',
    controlAction: { kind: 'execute', amountZar: 8000 },
    whatChanged: 'Capture confirmed progression. Recommendation size was not increased.',
    samBody:
      'The payment was captured, but the ZAR has not settled yet. I’m keeping the next step bounded until usable ZAR arrives.',
    lifecycle: 'pending',
  },
  {
    id: 'delayed',
    step: 3,
    title: 'Settlement delayed',
    label: 'Delayed',
    controlAction: { kind: 'execute', amountZar: 8000 },
    whatChanged: 'Delay recorded as an interruption — not recovery and not permanent failure.',
    samBody:
      'The payment is delayed. I’ve recorded that as an interruption, not as evidence that the route has recovered or failed permanently.',
    lifecycle: 'delayed',
  },
  {
    id: 'zar_available',
    step: 4,
    title: 'Usable ZAR credited',
    label: 'Settled evidence',
    controlAction: { kind: 'execute', amountZar: 8000 },
    whatChanged: 'Usable ZAR arrived after the delay, establishing settled evidence on this route.',
    samBody:
      'R8,000 settled as usable ZAR on this route. That is the largest recently settled ticket under similar conditions; it is not a bank-balance estimate.',
    lifecycle: 'settled',
  },
  {
    id: 'under_review',
    step: 5,
    title: 'Second payment under review',
    label: 'Under review',
    controlAction: { kind: 'execute', amountZar: 8000 },
    whatChanged: 'A later payment was placed under review. Route held while unresolved.',
    samBody:
      'The next payment is under review. I’m holding this route while that remains unresolved.',
    lifecycle: 'under_review',
  },
  {
    id: 'recovered',
    step: 6,
    title: 'Later settlement after review',
    label: 'Recovered',
    controlAction: { kind: 'execute', amountZar: 8000 },
    whatChanged:
      'A later usable ZAR credit after the review reopens assessment; the earlier review stays in history.',
    samBody:
      'A later payment settled successfully. That reopens the route for assessment, while the earlier review remains in its history.',
    lifecycle: 'recovered',
  },
  {
    id: 'reversed',
    step: 7,
    title: 'Reversal recorded',
    label: 'Reversal recorded',
    controlAction: { kind: 'reduce_to', amountZar: 4800 },
    whatChanged:
      'Reversal increased finality risk. Historical settlement remains; next proposal is reduced.',
    samBody:
      'R8,000 was later reversed. The earlier settlement remains part of the record, but I’m reducing the next proposed payment while finality risk is reassessed.',
    lifecycle: 'reversal',
  },
]

const BANNED =
  /bank balance estimate|remaining capacity|pSettle|Beta|SAC|DRL|posterior|probability|hidden.?world|raw policy|issuerId|merchantId/i

export function assertE0FixtureSafe(): void {
  for (const m of E0_FIXTURE_MOMENTS) {
    if (BANNED.test(m.samBody) || BANNED.test(m.whatChanged)) {
      throw new Error(`E0 fixture unsafe copy in ${m.id}`)
    }
  }
  // First successful settle after delay may be recovered in fold; UI projects settled for ordinary first credit.
  const firstZar = E0_FIXTURE_MOMENTS.find((m) => m.id === 'zar_available')
  if (firstZar?.lifecycle !== 'settled') throw new Error('First zar_available must present as settled')
  const afterReview = E0_FIXTURE_MOMENTS.find((m) => m.id === 'recovered')
  if (afterReview?.lifecycle !== 'recovered') throw new Error('Post-review settle must present as recovered')
}

assertE0FixtureSafe()

export function formatControlAction(action: E0Moment['controlAction']): string {
  if (action.kind === 'wait' || action.amountZar == null) return 'wait'
  const amount = `R${action.amountZar.toLocaleString('en-ZA')}`
  if (action.kind === 'execute') return `execute · ${amount}`
  if (action.kind === 'reduce_to') return `reduce to · ${amount}`
  if (action.kind === 'bounded_exploration') return `bounded · ${amount}`
  return `${action.kind} · ${amount}`
}

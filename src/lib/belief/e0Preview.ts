/**
 * E0 explain-only preview moments (mirrors functions/src/belief/explainOnly.ts).
 * Control planner remains the sole action source; belief layer supplies facts only.
 */

export type E0Moment = {
  id: string
  title: string
  controlAction: { kind: string; amountZar: number | null }
  lifecycle: string
  samLines: string[]
}

const BANNED =
  /bank balance|remaining capacity|capacity we.?ve observed|pSettle|Beta|SAC|DRL|hidden.?world|probability|posterior/i

export function assertE0Safe(text: string): void {
  if (BANNED.test(text)) throw new Error(`E0 violation: ${text}`)
}

export const E0_MOMENTS: E0Moment[] = [
  {
    id: 'pending_after_auth',
    title: 'After authorisation',
    controlAction: { kind: 'execute', amountZar: 8000 },
    lifecycle: 'pending',
    samLines: [
      'Payment authorised; settlement not yet credited as usable ZAR.',
      'The next payment is still pending, so I’m not treating that result as additional settled evidence.',
    ],
  },
  {
    id: 'after_capture',
    title: 'After capture',
    controlAction: { kind: 'execute', amountZar: 8000 },
    lifecycle: 'pending',
    samLines: [
      'Capture confirms progression. I am not treating that as settled usable ZAR.',
      'The next payment is still pending, so I’m not treating prior progress as additional settled evidence.',
    ],
  },
  {
    id: 'after_settle',
    title: 'After usable ZAR',
    controlAction: { kind: 'execute', amountZar: 8000 },
    lifecycle: 'clear',
    samLines: [
      'R8,000 previously settled on this route.',
      'Recent settlement timing on this route was about 24 hours after the payment event.',
      'Settlement evidence maturity is thin (1 settled observation).',
    ],
  },
  {
    id: 'under_review',
    title: 'Under review',
    controlAction: { kind: 'execute', amountZar: 8000 },
    lifecycle: 'under_review',
    samLines: [
      'R8,000 previously settled on this route.',
      'This payment is under review. I’ve recorded the interruption, but there is not yet evidence that the route has recovered.',
    ],
  },
  {
    id: 'after_recovery',
    title: 'After recovery',
    controlAction: { kind: 'execute', amountZar: 8000 },
    lifecycle: 'recovered',
    samLines: [
      'R8,000 previously settled on this route.',
      'A later payment settled successfully. That reopens the route for assessment; it does not erase the earlier review.',
    ],
  },
]

for (const m of E0_MOMENTS) {
  for (const line of m.samLines) assertE0Safe(line)
}

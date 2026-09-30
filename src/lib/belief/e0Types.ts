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
  label: E0LifecycleLabel
  controlAction: { kind: 'execute' | 'reduce_to' | 'wait' | 'bounded_exploration'; amountZar: number | null }
  whatChanged: string
  samBody: string
  lifecycle: 'pending' | 'delayed' | 'settled' | 'under_review' | 'recovered' | 'reversal'
}

export function formatControlAction(action: E0Moment['controlAction']): string {
  if (action.kind === 'wait' || action.amountZar == null) return 'wait'
  const amount = `R${action.amountZar.toLocaleString('en-ZA')}`
  if (action.kind === 'execute') return `execute · ${amount}`
  if (action.kind === 'reduce_to') return `reduce to · ${amount}`
  if (action.kind === 'bounded_exploration') return `bounded · ${amount}`
  return `${action.kind} · ${amount}`
}

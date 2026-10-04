import { stepTitle, type DeskStepNumber } from './continuousCycle'

/** Closed step qualifiers — never weekdays or Day n of 14. */
export type StepQualifier = 'Add ZAR' | 'Hold' | 'Waiting'

/** Lane A: Step N · Verb · optional closed qualifier. Same open and done. */
export function stepCardTitle(step: DeskStepNumber, qualifier?: StepQualifier): string {
  return qualifier ? stepTitle(step, qualifier) : stepTitle(step)
}

/** Lane B: bank rail notice. Amount stays in the body. */
export function bankCardTitle(rail: 'FNB' | 'Capitec', verb: string): string {
  const v = verb.trim()
  if (!v) return `Bank · ${rail}`
  if (/^Bank\s*·/i.test(v)) return v
  return `Bank · ${rail} ${v}`
}

/** Lane B: window lifecycle. */
export function windowCardTitle(state: 'Opened' | 'Closed' | 'Add ZAR'): string {
  return `Window · ${state}`
}

/** Lane B: desk ask / advice. */
export function askCardTitle(topic: string): string {
  const t = (topic || '').trim()
  if (!t) return 'Ask · Clarify'
  if (/^(Ask|Proposal|Bank|Window|Friction|Step\s+\d)\b/i.test(t)) return t
  return `Ask · ${t}`
}

/** Lane B: accept/discard proposal. */
export function proposalCardTitle(topic: string): string {
  const t = (topic || '').trim()
  if (!t) return 'Proposal · Rule'
  if (/^Proposal\s*·/i.test(t)) return t
  if (/^Step\s+\d/i.test(t)) return t
  return `Proposal · ${t}`
}

/** Lane B: friction / outcome prompts. */
export function frictionCardTitle(kind: string): string {
  const t = (kind || '').trim()
  if (!t) return 'Friction · Check'
  if (/^Friction\s*·/i.test(t)) return t
  return `Friction · ${t}`
}

/** Normalize freeform advice/proposal titles at publish time. */
export function sideCardTitle(routingAction: 'advice' | 'proposal', title: string): string {
  return routingAction === 'proposal' ? proposalCardTitle(title) : askCardTitle(title)
}

/**
 * Final scheduled-ledger POS / principal / acquirer constraints.
 *
 * These bind AFTER day packing and route assignment — not during preliminary
 * scoring. Desk calendars must fail closed when the finished assignment set
 * violates any band, or when any payment remains unrouted.
 */
import { createHash } from 'crypto'
import {
  OPERATING_POLICY_V1,
  acquirerOfTerminal,
  merchantPrincipalOfTerminal,
  type CardId,
  type TerminalId,
} from './operatingPolicyV1'
import { REFERENCE_TERMINALS } from './referenceNetwork'

/** Minimal payment shape for final-ledger checks (avoids circular imports). */
export type LedgerPayment = {
  invoiceId?: string
  economicPaymentId?: string
  amountZar: number
  date?: string
  cardId: CardId | string
  terminalId: TerminalId | string
  merchantPrincipalId: string
  acquirerBankId: string
}

export type LedgerShareRow = {
  key: string
  n: number
  zar: number
  shareN: number
  shareV: number
}

export type FinalLedgerVerdict = {
  ok: boolean
  totalN: number
  totalZar: number
  bookHash: string
  assignmentHash: string
  byPos: LedgerShareRow[]
  byPrincipal: LedgerShareRow[]
  byAcquirer: LedgerShareRow[]
  byCard: LedgerShareRow[]
  byPair: LedgerShareRow[]
  violations: string[]
}

function money(n: number) {
  return Math.round(n * 100) / 100
}

function sha16(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)
}

export function liveCleanTerminalIds(): TerminalId[] {
  return REFERENCE_TERMINALS.filter((t) => t.modeledEligible && t.liveExecutable).map(
    (t) => t.terminalId
  )
}

/** Minimum count for a POS on an N-payment month (15%, Econometrica 16%). */
export function minCountForPos(terminalId: TerminalId, totalN: number): number {
  const policy = OPERATING_POLICY_V1
  const share =
    terminalId === 'Econometrica'
      ? policy.posPlanningTargets.Econometrica
      : policy.pos.minShareCount
  return Math.ceil(share * totalN - 1e-12)
}

export function maxCountForPos(totalN: number): number {
  return Math.floor(OPERATING_POLICY_V1.pos.maxShareCount * totalN + 1e-12)
}

export function lemonMaxCount(totalN: number): number {
  return Math.floor(OPERATING_POLICY_V1.principal.maxShareCount * totalN + 1e-12)
}

export function capitecMinCount(totalN: number): number {
  return Math.ceil(OPERATING_POLICY_V1.acquirer.referenceCapitecMinShare * totalN - 1e-12)
}

export function capitecMaxCount(totalN: number): number {
  return Math.floor(OPERATING_POLICY_V1.acquirer.maxShare * totalN + 1e-12)
}

/**
 * Hard feasibility after tentatively assigning `terminalId` on a desk month of size `totalN`.
 * Count-band lookahead only — value bands are asserted on the finished ledger.
 */
export function assignmentPreservesFinalCountBands(input: {
  totalN: number
  assignedCounts: Map<TerminalId, number>
  assignedSoFar: number
  nextTerminalId: TerminalId
}): boolean {
  const { totalN, nextTerminalId } = input
  if (totalN <= 0) return false
  const live = liveCleanTerminalIds()
  if (!live.includes(nextTerminalId)) return false

  const counts = new Map<TerminalId, number>()
  for (const t of live) counts.set(t, input.assignedCounts.get(t) || 0)
  counts.set(nextTerminalId, (counts.get(nextTerminalId) || 0) + 1)

  const assignedAfter = input.assignedSoFar + 1
  const remaining = totalN - assignedAfter
  if (remaining < 0) return false

  const maxPos = maxCountForPos(totalN)
  for (const t of live) {
    if ((counts.get(t) || 0) > maxPos) return false
  }

  const lemonN = (counts.get('BricsFNB') || 0) + (counts.get('BricsCapitec') || 0)
  if (lemonN > lemonMaxCount(totalN)) return false

  const capN = (counts.get('BricsCapitec') || 0) + (counts.get('Econometrica') || 0)
  if (capN > capitecMaxCount(totalN)) return false
  if (capN + remaining < capitecMinCount(totalN)) return false

  let shortfall = 0
  for (const t of live) {
    const need = minCountForPos(t, totalN)
    const have = counts.get(t) || 0
    if (have > maxPos) return false
    shortfall += Math.max(0, need - have)
  }
  if (shortfall > remaining) return false

  return true
}

function shareRows(
  payments: LedgerPayment[],
  keyOf: (p: LedgerPayment) => string
): LedgerShareRow[] {
  const totalN = payments.length
  const totalZar = money(payments.reduce((s, p) => s + p.amountZar, 0))
  const map = new Map<string, { n: number; zar: number }>()
  for (const p of payments) {
    const k = keyOf(p)
    const cur = map.get(k) || { n: 0, zar: 0 }
    cur.n += 1
    cur.zar = money(cur.zar + p.amountZar)
    map.set(k, cur)
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      n: v.n,
      zar: v.zar,
      shareN: totalN ? v.n / totalN : 0,
      shareV: totalZar ? v.zar / totalZar : 0,
    }))
    .sort((a, b) => b.zar - a.zar || a.key.localeCompare(b.key))
}

/**
 * Evaluate the finished scheduled ledger against OperatingPolicyV1 hard bands.
 * Fail closed: any violation → ok=false.
 */
export function evaluateFinalDeskLedger(
  payments: LedgerPayment[],
  opts?: { enforceReferenceCapitecBand?: boolean; skipRolling7?: boolean }
): FinalLedgerVerdict {
  const policy = OPERATING_POLICY_V1
  const enforceCap = opts?.enforceReferenceCapitecBand !== false
  const violations: string[] = []
  const totalN = payments.length
  const totalZar = money(payments.reduce((s, p) => s + p.amountZar, 0))

  if (totalN === 0) {
    violations.push('ledger is empty')
  }

  // Fail closed: every payment must carry a concrete card×POS assignment.
  for (const p of payments) {
    if (!p.cardId || !p.terminalId) {
      violations.push(`unrouted payment ${p.invoiceId || p.economicPaymentId || '?'}`)
    }
    if (!(p.amountZar > 0)) {
      violations.push(`non-positive amount on ${p.invoiceId || p.economicPaymentId || '?'}`)
    }
  }

  const live = liveCleanTerminalIds()
  const byPos = shareRows(payments, (p) => String(p.terminalId))
  const byPrincipal = shareRows(payments, (p) => p.merchantPrincipalId)
  const byAcquirer = shareRows(payments, (p) => p.acquirerBankId)
  const byCard = shareRows(payments, (p) => String(p.cardId))
  const byPair = shareRows(payments, (p) => `${p.cardId}×${p.terminalId}`)

  // Reconcile: pair / POS / card / principal row counts must equal totalN.
  const sumN = (rows: LedgerShareRow[]) => rows.reduce((s, r) => s + r.n, 0)
  if (sumN(byPos) !== totalN) violations.push(`POS table n=${sumN(byPos)} ≠ ledger n=${totalN}`)
  if (sumN(byPair) !== totalN) violations.push(`pair table n=${sumN(byPair)} ≠ ledger n=${totalN}`)
  if (sumN(byCard) !== totalN) violations.push(`card table n=${sumN(byCard)} ≠ ledger n=${totalN}`)
  if (sumN(byPrincipal) !== totalN)
    violations.push(`principal table n=${sumN(byPrincipal)} ≠ ledger n=${totalN}`)
  if (sumN(byAcquirer) !== totalN)
    violations.push(`acquirer table n=${sumN(byAcquirer)} ≠ ledger n=${totalN}`)

  for (const t of live) {
    const row = byPos.find((r) => r.key === t)
    const n = row?.n || 0
    const zar = row?.zar || 0
    const shareN = totalN ? n / totalN : 0
    const shareV = totalZar ? zar / totalZar : 0
    const minShare =
      t === 'Econometrica' ? policy.posPlanningTargets.Econometrica : policy.pos.minShareCount
    if (shareN + 1e-12 < minShare || shareV + 1e-12 < minShare) {
      violations.push(
        `${t} below floor: n=${(shareN * 100).toFixed(1)}% v=${(shareV * 100).toFixed(1)}% (need ≥${(
          minShare * 100
        ).toFixed(0)}%)`
      )
    }
    if (shareN > policy.pos.maxShareCount + 1e-12 || shareV > policy.pos.maxShareValue + 1e-12) {
      violations.push(
        `${t} above ceiling: n=${(shareN * 100).toFixed(1)}% v=${(shareV * 100).toFixed(1)}%`
      )
    }
  }

  const lemon = byPrincipal.find((r) => r.key === 'lemon_economics')
  if (lemon) {
    if (
      lemon.shareN > policy.principal.maxShareCount + 1e-12 ||
      lemon.shareV > policy.principal.maxShareValue + 1e-12
    ) {
      violations.push(
        `lemon_economics above 35%: n=${(lemon.shareN * 100).toFixed(1)}% v=${(lemon.shareV * 100).toFixed(1)}%`
      )
    }
  }

  const capitec = byAcquirer.find((r) => r.key === 'capitec')
  const capShareN = capitec?.shareN || 0
  const capShareV = capitec?.shareV || 0
  if (capShareN > policy.acquirer.maxShare + 1e-12 || capShareV > policy.acquirer.maxShare + 1e-12) {
    violations.push(
      `capitec above ${policy.acquirer.maxShare * 100}%: n=${(capShareN * 100).toFixed(1)}% v=${(
        capShareV * 100
      ).toFixed(1)}%`
    )
  }
  if (enforceCap) {
    if (
      capShareN + 1e-12 < policy.acquirer.referenceCapitecMinShare ||
      capShareV + 1e-12 < policy.acquirer.referenceCapitecMinShare ||
      capShareN > policy.acquirer.referenceCapitecMaxShare + 1e-12 ||
      capShareV > policy.acquirer.referenceCapitecMaxShare + 1e-12
    ) {
      violations.push(
        `capitec outside 25–35%: n=${(capShareN * 100).toFixed(1)}% v=${(capShareV * 100).toFixed(1)}%`
      )
    }
  }

  if (!opts?.skipRolling7) {
    for (const v of rolling7Violations(payments)) {
      violations.push(`rolling7 ${v}`)
    }
    if (!deskOperationalOk(payments)) {
      violations.push('desk operational caps (POS day value/count or card×POS <2-day gap)')
    }
  }

  const bookHash = sha16({
    n: totalN,
    zar: totalZar,
    amounts: payments.map((p) => money(p.amountZar)).sort((a, b) => a - b),
  })
  const assignmentHash = sha16(
    payments.map((p) => ({
      invoiceId: p.invoiceId,
      amountZar: money(p.amountZar),
      date: p.date,
      cardId: p.cardId,
      terminalId: p.terminalId,
    }))
  )

  return {
    ok: violations.length === 0,
    totalN,
    totalZar,
    bookHash,
    assignmentHash,
    byPos,
    byPrincipal,
    byAcquirer,
    byCard,
    byPair,
    violations,
  }
}

export function assertFinalDeskLedger(
  payments: LedgerPayment[],
  opts?: { enforceReferenceCapitecBand?: boolean; label?: string }
): FinalLedgerVerdict {
  const verdict = evaluateFinalDeskLedger(payments, opts)
  if (!verdict.ok) {
    const label = opts?.label || 'final desk ledger'
    throw new Error(
      `${label} failed closed (${verdict.violations.length} violations; bookHash=${verdict.bookHash}):\n` +
        verdict.violations.map((v) => `  - ${v}`).join('\n')
    )
  }
  return verdict
}

type MutableLedgerPayment = LedgerPayment & {
  terminalId: TerminalId
  merchantPrincipalId: string
  acquirerBankId: string
}

function rolling7Violations(payments: LedgerPayment[]): string[] {
  const policy = OPERATING_POLICY_V1
  const violations: string[] = []
  const dates = [...new Set(payments.map((p) => p.date).filter(Boolean) as string[])].sort()
  for (const date of dates) {
    const asOf = Date.parse(date + 'T12:00:00Z')
    const cut = asOf - 6 * 86400000
    const window = payments.filter(
      (p) => p.date && Date.parse(p.date + 'T12:00:00Z') >= cut && p.date <= date
    )
    if (window.length < 10) continue
    const wV = money(window.reduce((s, p) => s + p.amountZar, 0))
    for (const t of liveCleanTerminalIds()) {
      const list = window.filter((p) => p.terminalId === t)
      if (list.length / window.length > policy.pos.maxShareCount + 1e-9) {
        violations.push(`${t}@${date}:R7n`)
      }
      if (wV > 0 && list.reduce((s, p) => s + p.amountZar, 0) / wV > policy.pos.maxShareValue + 1e-9) {
        violations.push(`${t}@${date}:R7v`)
      }
    }
  }
  return violations
}

function withTerminal<T extends MutableLedgerPayment>(p: T, terminalId: TerminalId): T {
  return {
    ...p,
    terminalId,
    merchantPrincipalId: merchantPrincipalOfTerminal(terminalId),
    acquirerBankId: acquirerOfTerminal(terminalId),
  }
}

/** Daily POS caps + card×POS min 2-day gap — repair must not violate these. */
function deskOperationalOk(payments: LedgerPayment[]): boolean {
  const policy = OPERATING_POLICY_V1
  const byDayPos = new Map<string, LedgerPayment[]>()
  for (const p of payments) {
    if (!p.date) return false
    const k = `${p.date}|${p.terminalId}`
    byDayPos.set(k, [...(byDayPos.get(k) || []), p])
  }
  for (const [k, list] of byDayPos) {
    const date = k.split('|')[0]!
    const dayNum = Number(date.slice(8, 10))
    const maxPos =
      dayNum <= policy.pos.coldPosNetworkDays
        ? policy.pos.coldAttemptsPerDay
        : policy.pos.establishedAttemptsPerDay
    if (list.length > maxPos) return false
    if (money(list.reduce((s, p) => s + p.amountZar, 0)) > policy.pos.maxValuePerDayZar + 0.05)
      return false
  }
  const byPair = new Map<string, string[]>()
  for (const p of payments) {
    if (!p.date) continue
    const pk = `${p.cardId}×${p.terminalId}`
    byPair.set(pk, [...(byPair.get(pk) || []), p.date])
  }
  for (const dates of byPair.values()) {
    const sorted = [...dates].sort()
    for (let i = 1; i < sorted.length; i++) {
      const gap =
        (Date.parse(sorted[i]! + 'T12:00:00Z') - Date.parse(sorted[i - 1]! + 'T12:00:00Z')) /
        86400000
      if (gap > 0 && gap < 2 - 1e-9) return false
    }
  }
  return true
}

/**
 * Repair rolling-7 POS concentration by exchanging / moving terminals
 * while preserving month-band legality. Cards/dates/amounts stay fixed.
 */
export function repairRolling7PosConcentration<T extends MutableLedgerPayment>(payments: T[]): T[] {
  const out = payments.map((p) => ({ ...p }))
  const live = liveCleanTerminalIds()
  const idOf = (p: T) => p.economicPaymentId || p.invoiceId || ''

  const apply = (trial: T[]) => {
    for (let i = 0; i < out.length; i++) out[i] = trial[i]!
  }

  for (let iter = 0; iter < 400; iter++) {
    const r7 = rolling7Violations(out)
    if (!r7.length) return out

    let progressed = false
    for (const date of [...new Set(out.map((p) => p.date).filter(Boolean) as string[])].sort()) {
      const asOf = Date.parse(date + 'T12:00:00Z')
      const cut = asOf - 6 * 86400000
      const window = out.filter(
        (p) => p.date && Date.parse(p.date + 'T12:00:00Z') >= cut && p.date <= date
      )
      if (window.length < 10) continue
      const wV = money(window.reduce((s, p) => s + p.amountZar, 0))
      for (const heavy of live) {
        const heavyList = window.filter((p) => p.terminalId === heavy)
        const heavyN = heavyList.length / window.length
        const heavyV = wV > 0 ? heavyList.reduce((s, p) => s + p.amountZar, 0) / wV : 0
        if (
          heavyN <= OPERATING_POLICY_V1.pos.maxShareCount + 1e-9 &&
          heavyV <= OPERATING_POLICY_V1.pos.maxShareValue + 1e-9
        ) {
          continue
        }

        // 1) Exchange a heavy-window payment with a light-POS payment (count-neutral).
        for (const victim of heavyList) {
          for (const donor of out) {
            if (donor.terminalId === heavy) continue
            if (!live.includes(donor.terminalId as TerminalId)) continue
            const trial = out.map((p) => {
              if (idOf(p) === idOf(victim)) return withTerminal(p, donor.terminalId as TerminalId)
              if (idOf(p) === idOf(donor)) return withTerminal(p, heavy)
              return p
            })
            if (!evaluateFinalDeskLedger(trial, { skipRolling7: true }).ok) continue
            if (!deskOperationalOk(trial)) continue
            if (rolling7Violations(trial).length < r7.length) {
              apply(trial)
              progressed = true
              break
            }
          }
          if (progressed) break
        }
        if (progressed) break

        // 2) One-way move onto a lighter POS when month bands still hold.
        for (const light of live) {
          if (light === heavy) continue
          for (const victim of heavyList) {
            const trial = out.map((p) =>
              idOf(p) === idOf(victim) ? withTerminal(p, light) : p
            )
            if (!evaluateFinalDeskLedger(trial, { skipRolling7: true }).ok) continue
            if (!deskOperationalOk(trial)) continue
            if (rolling7Violations(trial).length < r7.length) {
              apply(trial)
              progressed = true
              break
            }
          }
          if (progressed) break
        }
        if (progressed) break
      }
      if (progressed) break
    }
    if (!progressed) break
  }
  return out
}

/** Re-export helpers used by the allocator for terminal identity. */
export { acquirerOfTerminal, merchantPrincipalOfTerminal }

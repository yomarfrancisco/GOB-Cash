/**
 * Production writers: bank / desk events → RouteEvidence + belief snapshots.
 * Never mutates the live absorbing planCycle default — explain / rank only.
 */
import * as admin from 'firebase-admin'
import type { SettlementInvoice } from '../settlement/invoice'
import {
  evidenceFromAuthorisation,
  evidenceFromBankDecline,
  evidenceFromEftBankTransfer,
  evidenceFromZarAvailable,
} from './emitters'
import { defaultEftCorridorId } from '../routing/channelSplit'
import { foldEvidence } from './fold'
import { persistRouteEvidence } from './persist'
import { ROUTE_BELIEFS_COLLECTION, ROUTE_EVIDENCE_COLLECTION } from './collections'
import { routeIdentityFromBankDecline, routeIdentityFromDeskPair } from './routeIdentity'
import type { CauseClass, RouteEvidence } from './types'
import { BELIEF_SCHEMA_VERSION } from './types'

function db() {
  return admin.firestore()
}

async function refreshBeliefSnapshots(hintKeys?: string[]): Promise<void> {
  try {
    const snap = await db()
      .collection(ROUTE_EVIDENCE_COLLECTION)
      .orderBy('eventAt', 'desc')
      .limit(400)
      .get()
    const evidence = snap.docs.map((doc) => doc.data() as RouteEvidence).reverse()
    const asOf = new Date().toISOString()
    const beliefs = foldEvidence(evidence, asOf)
    const batch = db().batch()
    const write =
      hintKeys && hintKeys.length
        ? beliefs.filter((row) => hintKeys.some((k) => k && row.beliefKey.includes(k)))
        : beliefs
    for (const row of write.slice(0, 80)) {
      batch.set(
        db().collection(ROUTE_BELIEFS_COLLECTION).doc(row.beliefKey.replace(/[^\w.-]+/g, '_')),
        { ...row, updatedAt: asOf, schemaVersion: BELIEF_SCHEMA_VERSION },
        { merge: true }
      )
    }
    await batch.commit()
  } catch (error) {
    console.warn('[belief] snapshot refresh skipped', error)
  }
}

export async function recordZarAvailableFromInvoice(input: {
  invoice: SettlementInvoice
  amountZar: number
  settlementDocId: string
  at?: string
}): Promise<void> {
  const { invoice } = input
  if (invoice.deskCardId == null || invoice.machineId == null) return
  const identity = routeIdentityFromDeskPair({
    deskCardId: invoice.deskCardId,
    machineId: invoice.machineId,
    merchantPrincipalId: invoice.issuerId === 'imani' ? 'imani_beauty' : invoice.issuerId,
    invoiceId: invoice.id,
    economicPaymentId: invoice.economicPaymentId,
    testRunId: invoice.testRunId,
    cycleNumber: invoice.cycleNumber,
  })
  if (!identity) return
  const eventAt = input.at || new Date().toISOString()
  const row = evidenceFromZarAvailable({
    ...identity,
    requestedZar: invoice.totalZar,
    settledZar: input.amountZar,
    eventAt,
    settledAt: eventAt,
    evidenceRef: input.settlementDocId,
  })
  const result = await persistRouteEvidence(row)
  if (result.wrote) {
    await refreshBeliefSnapshots([
      identity.cardId || '',
      identity.acquirerBankId || '',
      identity.cardIssuerBankId || '',
    ])
  }
}

export async function recordAuthorisationsFromAssignments(input: {
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
  testRunId: string
  cycleNumber: number
  eventAt?: string
}): Promise<void> {
  const eventAt = input.eventAt || new Date().toISOString()
  const hintKeys: string[] = []
  for (const row of input.assignments) {
    const identity = routeIdentityFromDeskPair({
      deskCardId: row.cardId,
      machineId: row.machineId,
      economicPaymentId: `pay-c${input.cycleNumber}-${row.cardId}-${row.machineId}`,
      testRunId: input.testRunId,
      cycleNumber: input.cycleNumber,
    })
    if (!identity) continue
    const evidence = evidenceFromAuthorisation({
      ...identity,
      requestedZar: row.amount,
      eventAt,
      attemptEligibility: 'eligible_submitted',
    })
    const result = await persistRouteEvidence(evidence)
    if (result.wrote) {
      hintKeys.push(identity.cardId || '', identity.acquirerBankId || '')
    }
  }
  if (hintKeys.length) await refreshBeliefSnapshots(hintKeys)
}

export async function recordDeclineFromBankReceipt(input: {
  evidenceId: string
  amountZar: number
  cardLast4: string | null
  merchant: string | null
  bankLabel: string
  causeClass?: CauseClass
  eventAt?: string
}): Promise<void> {
  const mapped = routeIdentityFromBankDecline({
    cardLast4: input.cardLast4,
    merchant: input.merchant,
    amountZar: input.amountZar,
    evidenceId: input.evidenceId,
  })
  if (!mapped) return
  const eventAt = input.eventAt || new Date().toISOString()
  const payload = evidenceFromBankDecline({
    ...mapped.identity,
    eventAt,
    requestedZar: input.amountZar,
    causeClass: input.causeClass || 'unknown',
    evidenceRef: input.evidenceId,
    notes: [`${input.bankLabel} decline receipt`],
  })
  const result = await persistRouteEvidence(payload)
  if (result.wrote) {
    await refreshBeliefSnapshots([mapped.identity.cardId || '', mapped.identity.cardIssuerBankId || ''])
  }
}

/**
 * FNB MZ bank_transfer / funding credit → EFT corridor zar_available (never card×POS).
 * amountZar is the ZAR-equivalent of the transfer when known; else pass MZN/cost approx.
 */
export async function recordEftFromBankTransfer(input: {
  evidenceId: string
  amountZar: number
  destinationNib?: string | null
  bankReference?: string | null
  eventAt?: string
  economicPaymentId?: string | null
}): Promise<void> {
  if (!(input.amountZar > 0)) return
  const eventAt = input.eventAt || new Date().toISOString()
  const corridor = defaultEftCorridorId(
    'fnb_mozambique',
    input.destinationNib ? `nib_${input.destinationNib.slice(-6)}` : 'sa_corridor'
  )
  const row = evidenceFromEftBankTransfer({
    eftCorridorId: corridor,
    cardIssuerBankId: 'fnb_mozambique',
    economicPaymentId:
      input.economicPaymentId ||
      (input.bankReference ? `eft-${input.bankReference}` : `eft-${input.evidenceId}`),
    requestedZar: input.amountZar,
    settledZar: input.amountZar,
    eventAt,
    evidenceRef: input.evidenceId,
    notes: ['Funding/conversion EFT bank_transfer matched to corridor'],
  })
  const result = await persistRouteEvidence(row)
  if (result.wrote) {
    await refreshBeliefSnapshots([`eft:${corridor}`, 'fnb_mozambique'])
  }
}

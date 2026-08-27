/**
 * When a deposit proof is marked credited, write the settled activity event.
 * Pending count then drops because the matching DEPOSIT_PROOF_PENDING group is settled.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()
const CORE_AGENT_UID = 'xHKmkizXhPOU25vwTIB6dxhMzSH2'

function depositGroupId(country: string, reference: string): string {
  return `deposit:${country}:${reference}`
}

async function writeCreditedActivity(params: {
  userId: string
  proofId: string
  country: 'MZ' | 'ZA'
  reference: string
}): Promise<void> {
  const currency = params.country === 'ZA' ? 'ZAR' : 'MZN'
  const groupId = depositGroupId(params.country, params.reference)
  const eventId = `credited-${groupId}`

  await db.collection('users').doc(params.userId).collection('activityEvents').doc(eventId).set({
    id: eventId,
    kind: 'DEPOSIT_CREDITED',
    title: `${currency} account credited`,
    body: `Your ${currency} account has been credited. Reference ${params.reference}.`,
    actorType: 'ai_manager',
    avatarKind: 'mzn_deposited',
    amountCurrency: currency,
    amountSign: 'credit',
    txId: groupId,
    depositReference: params.reference,
    bankCountry: params.country,
    proofId: params.proofId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    recordingSource: 'OPS',
  })
}

export const onDepositProofWrite = functions
  .region('us-central1')
  .firestore.document('users/{userId}/depositProofs/{proofId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return

    const after = change.after.data() || {}
    const before = change.before.exists ? change.before.data() || {} : {}
    if (after.status !== 'credited' || before.status === 'credited') return

    const country = after.bankCountry === 'ZA' ? 'ZA' : 'MZ'
    const reference = typeof after.depositReference === 'string' ? after.depositReference : ''
    if (!reference) {
      console.warn('[Deposit] Credited proof is missing depositReference', context.params)
      return
    }

    await writeCreditedActivity({
      userId: context.params.userId,
      proofId: context.params.proofId,
      country,
      reference,
    })
  })

export const tx_confirmDepositProof = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    if (context.auth.uid !== CORE_AGENT_UID) {
      throw new functions.https.HttpsError('permission-denied', 'Only the core agent can confirm a deposit.')
    }

    const userId = typeof data?.userId === 'string' ? data.userId : ''
    const proofId = typeof data?.proofId === 'string' ? data.proofId : ''
    if (!userId || !proofId) {
      throw new functions.https.HttpsError('invalid-argument', 'userId and proofId are required')
    }

    const proofRef = db.collection('users').doc(userId).collection('depositProofs').doc(proofId)
    const proofSnap = await proofRef.get()
    if (!proofSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Deposit proof not found')
    }

    await proofRef.update({
      status: 'credited',
      creditedAt: admin.firestore.FieldValue.serverTimestamp(),
      creditedBy: context.auth.uid,
    })

    return { ok: true }
  })

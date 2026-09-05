/**
 * Email the FX conversion PDF to the agent after an internal conversion.
 * Client delivery can be added later without changing the PDF.
 */

import * as admin from 'firebase-admin'
import { sendEmailViaResend } from '../utils/resendEmail'
import {
  conversionProofFilename,
  conversionProofHeadline,
  formatBuyer,
  generateConversionProofEmailHtml,
  generateConversionProofPdf,
  getConversionData,
} from '../utils/generateConversionProof'

const db = admin.firestore()

async function agentEmailForUser(userId: string): Promise<string | null> {
  const userSnap = await db.collection('users').doc(userId).get()
  const fromProfile = String(userSnap.data()?.email || '').trim()
  if (fromProfile) return fromProfile

  try {
    const authUser = await admin.auth().getUser(userId)
    return authUser.email || null
  } catch {
    return null
  }
}

export async function sendAgentConversionProofEmail(txId: string): Promise<void> {
  const data = await getConversionData(txId)
  if (!data) {
    console.warn('[ConversionProofEmail] Conversion not found', { txId })
    return
  }

  const txRef = db.collection('transactions').doc(txId)
  const txSnap = await txRef.get()
  if (txSnap.data()?.agentProofEmailAt) {
    console.log('[ConversionProofEmail] Already sent to agent', { txId })
    return
  }

  const to = await agentEmailForUser(data.userId)
  if (!to) {
    console.warn('[ConversionProofEmail] Agent has no email', { txId, userId: data.userId })
    return
  }

  const pdf = await generateConversionProofPdf(data)
  const filename = conversionProofFilename(data.txId)
  const subject = `FX Conversion Request — ${conversionProofHeadline(data)} · ${formatBuyer(data)}`

  await sendEmailViaResend(to, subject, generateConversionProofEmailHtml(data), [
    { filename, content: pdf.toString('base64') },
  ])

  await txRef.update({
    agentProofEmailAt: admin.firestore.Timestamp.now(),
    agentProofEmailTo: to,
  })
  console.log('[ConversionProofEmail] Sent to agent', { txId, to })
}

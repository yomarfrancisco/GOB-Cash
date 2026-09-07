/**
 * Weekly settlement statement: activity + dropdown only (no email yet).
 * Instructed ZAR→MZN conversions are treated as completed.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import {
  WEEKLY_SETTLEMENT_KIND,
  generateWeeklySettlementPdf,
  loadWeeklySettlementData,
  loadWeeklySettlementUserIds,
  periodFromId,
  weeklyPeriod,
  weeklySettlementBody,
  weeklySettlementFilename,
  type WeekWhich,
  type WeeklyPeriod,
  type WeeklySettlementData,
} from '../utils/generateWeeklySettlement'

const db = admin.firestore()

async function writeWeeklyActivity(data: WeeklySettlementData): Promise<boolean> {
  const eventRef = db
    .collection('users')
    .doc(data.userId)
    .collection('activityEvents')
    .doc(data.period.id)
  const existing = await eventRef.get()
  if (existing.exists) {
    console.log('[WeeklySettlement] Already posted', { userId: data.userId, periodId: data.period.id })
    return false
  }

  const now = admin.firestore.Timestamp.now()
  await eventRef.set({
    id: data.period.id,
    kind: WEEKLY_SETTLEMENT_KIND,
    title: 'Weekly settlement statement',
    body: weeklySettlementBody(data),
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: data.zarSold,
    amountSign: 'debit',
    txId: data.period.id,
    hasDownloadButton: true,
    createdAt: now,
    recordingSource: 'SYSTEM',
    periodStart: admin.firestore.Timestamp.fromDate(data.period.start),
    periodEnd: admin.firestore.Timestamp.fromDate(data.period.end),
  })
  return true
}

export async function postWeeklySettlementForUser(
  userId: string,
  period: WeeklyPeriod
): Promise<{ posted: boolean; periodId: string; conversionCount: number }> {
  const data = await loadWeeklySettlementData(userId, period)
  if (!data) {
    return { posted: false, periodId: period.id, conversionCount: 0 }
  }
  const posted = await writeWeeklyActivity(data)
  return { posted, periodId: period.id, conversionCount: data.rows.length }
}

export async function postWeeklySettlementsOnce(which: WeekWhich = 'previous'): Promise<void> {
  const period = weeklyPeriod(which)
  const userIds = await loadWeeklySettlementUserIds(period)
  console.log('[WeeklySettlement] Period', { periodId: period.id, users: userIds.length })
  for (const userId of userIds) {
    try {
      const result = await postWeeklySettlementForUser(userId, period)
      console.log('[WeeklySettlement] User', { userId, ...result })
    } catch (error) {
      console.error('[WeeklySettlement] Failed for user', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export const sendWeeklySettlementStatements = functions.pubsub
  .schedule('every monday 07:00')
  .timeZone('Africa/Johannesburg')
  .onRun(async () => {
    await postWeeklySettlementsOnce('previous')
  })

/** Signed-in user can post their own current or previous week statement into activity. */
export const tx_sendMyWeeklySettlementStatement = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    const which: WeekWhich = data?.week === 'previous' ? 'previous' : 'current'
    const period = weeklyPeriod(which)
    const result = await postWeeklySettlementForUser(context.auth.uid, period)
    if (result.conversionCount === 0) {
      throw new functions.https.HttpsError(
        'not-found',
        `No ZAR sales in ${period.label}.`
      )
    }
    return result
  })

export const getWeeklySettlementProof = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    const periodId = String(data?.periodId || data?.txId || '')
    const period = periodFromId(periodId)
    if (!period) {
      throw new functions.https.HttpsError('invalid-argument', 'periodId is required')
    }

    const statement = await loadWeeklySettlementData(context.auth.uid, period)
    if (!statement) {
      throw new functions.https.HttpsError('not-found', 'Weekly statement not found')
    }

    const pdf = await generateWeeklySettlementPdf(statement)
    return {
      pdfBase64: pdf.toString('base64'),
      filename: weeklySettlementFilename(statement),
      mimeType: 'application/pdf',
    }
  })

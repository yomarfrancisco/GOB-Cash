/**
 * Monthly settlement statement: activity + dropdown only (no email yet).
 * Instructed ZAR→MZN conversions are treated as completed.
 * Current month is month-to-date until the calendar month closes.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import {
  MONTHLY_SETTLEMENT_KIND,
  generateWeeklySettlementPdf,
  loadWeeklySettlementData,
  loadWeeklySettlementUserIds,
  monthlyPeriod,
  periodFromId,
  weeklySettlementBody,
  weeklySettlementFilename,
  type WeekWhich,
  type WeeklyPeriod,
  type WeeklySettlementData,
} from '../utils/generateWeeklySettlement'

const db = admin.firestore()

async function writeMonthlyActivity(data: WeeklySettlementData): Promise<boolean> {
  const eventRef = db
    .collection('users')
    .doc(data.userId)
    .collection('activityEvents')
    .doc(data.period.id)
  const existing = await eventRef.get()
  if (existing.exists) {
    console.log('[MonthlySettlement] Already posted', { userId: data.userId, periodId: data.period.id })
    return false
  }

  const now = admin.firestore.Timestamp.now()
  await eventRef.set({
    id: data.period.id,
    kind: MONTHLY_SETTLEMENT_KIND,
    title: 'Monthly settlement statement',
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

export async function postMonthlySettlementForUser(
  userId: string,
  period: WeeklyPeriod
): Promise<{ posted: boolean; periodId: string; conversionCount: number }> {
  const data = await loadWeeklySettlementData(userId, period)
  if (!data) {
    return { posted: false, periodId: period.id, conversionCount: 0 }
  }
  const posted = await writeMonthlyActivity(data)
  return { posted, periodId: period.id, conversionCount: data.rows.length }
}

export async function postMonthlySettlementsOnce(which: WeekWhich = 'previous'): Promise<void> {
  const period = monthlyPeriod(which)
  const userIds = await loadWeeklySettlementUserIds(period)
  console.log('[MonthlySettlement] Period', { periodId: period.id, users: userIds.length })
  for (const userId of userIds) {
    try {
      const result = await postMonthlySettlementForUser(userId, period)
      console.log('[MonthlySettlement] User', { userId, ...result })
    } catch (error) {
      console.error('[MonthlySettlement] Failed for user', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export const sendMonthlySettlementStatements = functions.pubsub
  .schedule('0 7 1 * *')
  .timeZone('Africa/Johannesburg')
  .onRun(async () => {
    await postMonthlySettlementsOnce('previous')
  })

/** Signed-in user can post previous and/or current-month statements into activity. */
export const tx_sendMyMonthlySettlementStatement = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    const uid = context.auth.uid
    const which: WeekWhich | 'auto' =
      data?.month === 'previous' || data?.month === 'current' ? data.month : 'auto'

    const tryMonth = async (month: WeekWhich) =>
      postMonthlySettlementForUser(uid, monthlyPeriod(month))

    if (which === 'current' || which === 'previous') {
      const result = await tryMonth(which)
      if (result.conversionCount === 0) {
        throw new functions.https.HttpsError(
          'not-found',
          `No ZAR sales in ${monthlyPeriod(which).label}.`
        )
      }
      return result
    }

    const previous = await tryMonth('previous')
    const current = await tryMonth('current')
    if (current.conversionCount > 0) return current
    if (previous.conversionCount > 0) return previous
    throw new functions.https.HttpsError(
      'not-found',
      `No ZAR sales in ${monthlyPeriod('current').label}.`
    )
  })

export const getMonthlySettlementProof = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    const periodId = String(data?.periodId || data?.txId || '')
    const period = periodFromId(periodId)
    if (!period || !period.id.startsWith('monthly-')) {
      throw new functions.https.HttpsError('invalid-argument', 'periodId is required')
    }

    const statement = await loadWeeklySettlementData(context.auth.uid, period)
    if (!statement) {
      throw new functions.https.HttpsError('not-found', 'Monthly statement not found')
    }

    const pdf = await generateWeeklySettlementPdf(statement)
    return {
      pdfBase64: pdf.toString('base64'),
      filename: weeklySettlementFilename(statement),
      mimeType: 'application/pdf',
    }
  })

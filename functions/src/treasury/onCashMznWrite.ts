/**
 * When cashMZN fiatBalance increases for any user, run the first-fund
 * acknowledge + sub-R100k auto-convert / payout-hold flow, and on the first
 * crossing above zero send a one-shot Didit KYC SMS via Twilio.
 */

import * as functions from 'firebase-functions'
import { handleCashMznCredit } from './firstPayoutFlow'
import { roundMajor } from './reserveBooks'
import {
  firstFundKycSmsSecrets,
  maybeSendFirstFundKycSms,
} from '../kyc/sendFirstFundKycSms'

export const onCashMznWalletWrite = functions
  .region('us-central1')
  .runWith({
    secrets: firstFundKycSmsSecrets,
    timeoutSeconds: 120,
    memory: '512MB',
  })
  .firestore.document('users/{userId}/wallets/cashMZN')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return

    const beforeBal = change.before.exists
      ? roundMajor(Number(change.before.data()?.fiatBalance || 0))
      : 0
    const afterBal = roundMajor(Number(change.after.data()?.fiatBalance || 0))
    const delta = roundMajor(afterBal - beforeBal)
    if (!(delta > 0.005)) return

    const userId = context.params.userId as string
    const updatedMs =
      typeof change.after.updateTime?.toMillis === 'function'
        ? change.after.updateTime.toMillis()
        : Date.now()
    const creditKey = `${Math.round(beforeBal * 100)}-${Math.round(afterBal * 100)}-${updatedMs}`

    try {
      const kycInvite = await maybeSendFirstFundKycSms({
        userId,
        beforeBalanceMzn: beforeBal,
        afterBalanceMzn: afterBal,
      })
      if (kycInvite.sent || kycInvite.skipped) {
        console.log('[onCashMznWalletWrite] kycInvite', { userId, ...kycInvite })
      }
    } catch (error) {
      // Never block first-payout / convert on KYC SMS failure.
      console.error('[onCashMznWalletWrite] kycInvite failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      const result = await handleCashMznCredit({
        userId,
        deltaMzn: delta,
        afterBalanceMzn: afterBal,
        creditKey,
      })
      console.log('[onCashMznWalletWrite]', { userId, delta, ...result })
    } catch (error) {
      console.error('[onCashMznWalletWrite] failed', {
        userId,
        delta,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

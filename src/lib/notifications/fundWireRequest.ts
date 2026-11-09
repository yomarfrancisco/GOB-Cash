'use client'

import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import { DESK_TEAM } from '@/lib/desk/threadModel'
import { useActivityStore } from '@/store/activity'
import {
  buildWolfMozaPaymentReference,
  FUND_MZN_ACCOUNT_NUMBER,
  FUND_MZN_BANK,
  FUND_MZN_RECIPIENT,
} from '@/lib/notifications/welcomeSignIn'

function fmtMzn(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} MZN`
}

function fmtZar(n: number): string {
  return `R${Math.round(n).toLocaleString('en-US')}`
}

/**
 * Desk calculator → slim bank-wire instructions (subset of fund_intro).
 * Does not convert — only tells the user where to send MZN.
 */
export async function pushFundWireRequest(params: {
  amountMZN: number
  amountZAR: number
}): Promise<string | null> {
  const user = getFirebaseAuth().currentUser
  if (!user) return null

  const amountMZN = Math.round(Number(params.amountMZN) * 100) / 100
  const amountZAR = Math.round(Number(params.amountZAR) * 100) / 100
  if (!(amountMZN > 0.005) || !(amountZAR > 0.005)) return null

  const paymentReference = buildWolfMozaPaymentReference()
  const id = `fund-wire-${Date.now()}`
  const title = 'Send MZN to fund'
  const deskSentence = `Send ${fmtMzn(amountMZN)} to the account below to fund about ${fmtZar(amountZAR)}.`
  const deskLedgerRows = [
    { label: 'Send', value: fmtMzn(amountMZN), valueStrong: true },
    { label: 'Gets you', value: `about ${fmtZar(amountZAR)}`, valueStrong: true },
    { label: 'Recipient', value: FUND_MZN_RECIPIENT, valueStrong: true },
    { label: 'Bank', value: FUND_MZN_BANK },
    {
      label: 'Account',
      value: FUND_MZN_ACCOUNT_NUMBER,
      valueStrong: true,
      copyable: true,
    },
    {
      label: 'Reference',
      value: paymentReference,
      valueStrong: true,
      copyable: true,
    },
  ]

  useActivityStore.getState().add({
    id,
    kind: 'CONVERSION_ROUTING_INSTRUCTION',
    title,
    body: deskSentence,
    deskSentence,
    deskLedgerRows,
    routingAction: 'fund_wire',
    fundAccountNumber: FUND_MZN_ACCOUNT_NUMBER,
    paymentReference,
    fundTargetMzn: amountMZN,
    fundTargetZar: amountZAR,
    amount: { currency: 'ZAR', value: amountZAR, sign: 'credit' },
    actor: {
      type: 'ai',
      name: DESK_TEAM.sam.name,
      avatarUrl: DESK_TEAM.sam.avatar,
    },
    deskSpeaker: 'sam',
    createdAt: Date.now(),
  })

  try {
    await setDoc(doc(getFirestoreDb(), 'users', user.uid, 'activityEvents', id), {
      id,
      kind: 'CONVERSION_ROUTING_INSTRUCTION',
      title,
      body: deskSentence,
      deskSentence,
      deskLedgerRows,
      dropdownTitle: title,
      dropdownBody: `${fmtMzn(amountMZN)} → about ${fmtZar(amountZAR)}`,
      fundAccountNumber: FUND_MZN_ACCOUNT_NUMBER,
      paymentReference,
      fundTargetMzn: amountMZN,
      fundTargetZar: amountZAR,
      amountCurrency: 'ZAR',
      amountValue: amountZAR,
      amountSign: 'credit',
      actorType: 'ai_manager',
      deskSpeaker: 'sam',
      routingAction: 'fund_wire',
      createdAt: serverTimestamp(),
      recordingSource: 'USER_UI',
    })
  } catch (error) {
    console.warn('[FundWire] Failed to persist fund request', error)
  }

  return id
}

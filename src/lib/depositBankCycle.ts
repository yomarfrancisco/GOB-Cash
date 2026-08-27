'use client'

import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from './firebase'
import type { MozambiqueBank, SelectedBank, SouthAfricaBank } from '@/config/depositBankAccounts'

export const MZ_DEPOSIT_BANK_CYCLE: MozambiqueBank[] = ['BCI', 'ABSA', 'FNB', 'MOZA', 'VISTA', 'BIM']
export const ZA_DEPOSIT_BANK_CYCLE: SouthAfricaBank[] = ['FNB']

type CycleCountry = 'MZ' | 'ZA'

type CycleSlot = {
  assignedBank: SelectedBank
  awaitingProof: boolean
}

function banksFor(country: CycleCountry): SelectedBank[] {
  return country === 'MZ' ? MZ_DEPOSIT_BANK_CYCLE : ZA_DEPOSIT_BANK_CYCLE
}

function nextBank(country: CycleCountry, current?: SelectedBank): SelectedBank {
  const list = banksFor(country)
  if (!current) return list[0]
  const index = list.indexOf(current)
  if (index < 0) return list[0]
  return list[(index + 1) % list.length]
}

function readSlot(data: Record<string, unknown> | undefined, country: CycleCountry): CycleSlot | null {
  const cycle = data?.depositBankCycle as Record<string, CycleSlot> | undefined
  const slot = cycle?.[country]
  if (!slot?.assignedBank) return null
  return {
    assignedBank: slot.assignedBank,
    awaitingProof: slot.awaitingProof === true,
  }
}

export async function resolveAssignedDepositBank(country: CycleCountry): Promise<SelectedBank> {
  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) throw new Error('You must be signed in to deposit.')

  const db = getFirestoreDb()
  const userRef = doc(db, 'users', user.uid)
  const snap = await getDoc(userRef)
  const slot = readSlot(snap.data() as Record<string, unknown> | undefined, country)

  if (slot?.awaitingProof) {
    return slot.assignedBank
  }

  const assignedBank = nextBank(country, slot?.assignedBank)
  await updateDoc(userRef, {
    [`depositBankCycle.${country}`]: {
      assignedBank,
      awaitingProof: true,
    },
  })
  return assignedBank
}

export async function completeAssignedDepositBank(country: CycleCountry): Promise<void> {
  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) throw new Error('You must be signed in to deposit.')

  const db = getFirestoreDb()
  const userRef = doc(db, 'users', user.uid)
  const snap = await getDoc(userRef)
  const slot = readSlot(snap.data() as Record<string, unknown> | undefined, country)
  if (!slot) return

  await updateDoc(userRef, {
    [`depositBankCycle.${country}`]: {
      assignedBank: slot.assignedBank,
      awaitingProof: false,
    },
  })
}

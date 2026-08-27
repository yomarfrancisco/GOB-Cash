'use client'

import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import { getFirebaseAuth, getFirebaseStorage, getFirestoreDb } from './firebase'
import type { SelectedBank } from '@/config/depositBankAccounts'

export const DEPOSIT_PROOF_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export function assertDepositProofPdf(file: File): void {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    throw new Error('Please attach a PDF file.')
  }
  if (file.size <= 0) {
    throw new Error('That PDF looks empty. Please choose another file.')
  }
  if (file.size > DEPOSIT_PROOF_MAX_BYTES) {
    throw new Error('PDF must be 10 MB or smaller.')
  }
}

export async function uploadDepositProof(params: {
  file: File
  country: 'MZ' | 'ZA'
  bankId: SelectedBank
}): Promise<void> {
  assertDepositProofPdf(params.file)

  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) throw new Error('You must be signed in to attach proof.')

  const db = getFirestoreDb()
  const proofsRef = collection(db, 'users', user.uid, 'depositProofs')
  const proofDoc = await addDoc(proofsRef, {
    bankCountry: params.country,
    bankId: params.bankId,
    fileName: params.file.name,
    fileSize: params.file.size,
    contentType: 'application/pdf',
    createdAt: serverTimestamp(),
    status: 'uploaded',
  })

  const storagePath = `depositProofs/${user.uid}/${proofDoc.id}.pdf`
  const storageRef = ref(getFirebaseStorage(), storagePath)
  await uploadBytes(storageRef, params.file, { contentType: 'application/pdf' })
}

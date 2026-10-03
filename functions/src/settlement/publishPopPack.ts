import * as admin from 'firebase-admin'
import { CONVERSION_ROUTING_KIND, ROUTING_ADMIN_UID } from '../routing/conversionRouter'
import {
  conversionProofFilename,
  generateConversionProofPdf,
  getConversionData,
} from '../utils/generateConversionProof'
import { zipBuffers } from './zipBuffers'

const db = () => admin.firestore()

function bucket() {
  return admin.storage().bucket()
}

/**
 * One Sam desk card + one zip of conversion POP PDFs for a cycle
 * (instead of a download button on each Leo/Amina or conversion card).
 */
export async function publishPopPackDeskNotice(params: {
  conversionTxIds: string[]
  testRunId?: string
  cycleNumber?: number
  adminUid?: string
}): Promise<void> {
  const txIds = [...new Set(params.conversionTxIds.filter((id) => typeof id === 'string' && id.trim()))]
  if (!txIds.length) return

  const adminUid = params.adminUid || ROUTING_ADMIN_UID
  const packKey =
    params.testRunId && typeof params.cycleNumber === 'number'
      ? `${params.testRunId}-c${params.cycleNumber}`
      : txIds.sort().join('-').slice(0, 80)
  const id = `pop-pack-${packKey}`
  const ref = db().collection('users').doc(adminUid).collection('activityEvents').doc(id)
  if ((await ref.get()).exists) return

  const files: Array<{ name: string; data: Buffer }> = []
  for (const txId of txIds) {
    const data = await getConversionData(txId)
    if (!data) continue
    const pdf = await generateConversionProofPdf(data)
    files.push({ name: conversionProofFilename(txId), data: pdf })
  }
  if (!files.length) return

  const filename =
    typeof params.cycleNumber === 'number'
      ? `cycle-${params.cycleNumber}-pops.zip`
      : `pops-${new Date().toISOString().slice(0, 10)}.zip`
  const storagePath = `conversion-proofs/packs/${packKey}/${filename}`
  await bucket().file(storagePath).save(zipBuffers(files), {
    contentType: 'application/zip',
    metadata: { cacheControl: 'private, max-age=0' },
  })

  const body =
    files.length === 1
      ? `Proof of payment is ready. Download the POP zip from the desk card.`
      : `${files.length} proofs of payment are ready. Download the zip from the desk card.`

  await ref.set({
    id,
    kind: CONVERSION_ROUTING_KIND,
    title:
      typeof params.cycleNumber === 'number'
        ? `POPs · Cycle ${params.cycleNumber}`
        : `POPs · ${files.length} PDFs`,
    body,
    dropdownTitle: filename,
    dropdownBody: `${files.length} POP${files.length === 1 ? '' : 's'}`,
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: 0,
    amountSign: 'debit',
    txId: id,
    hasDownloadButton: true,
    proofZipStoragePath: storagePath,
    proofZipFilename: filename,
    conversionTxIds: txIds,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'pop_pack',
    deskSpeaker: 'sam',
    ...(params.testRunId ? { testRunId: params.testRunId } : {}),
    ...(typeof params.cycleNumber === 'number' ? { cycleNumber: params.cycleNumber } : {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    recordingSource: 'SYSTEM',
  })

  // Hide per-conversion download buttons so the desk keeps one Sam zip card.
  await Promise.all(
    txIds.map((txId) =>
      db()
        .collection('users')
        .doc(adminUid)
        .collection('activityEvents')
        .doc(txId)
        .set({ hasDownloadButton: false }, { merge: true })
        .catch(() => undefined)
    )
  )
}

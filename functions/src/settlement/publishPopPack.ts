import * as admin from 'firebase-admin'
import { ROUTING_ADMIN_UID } from '../routing/conversionRouter'
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

function stepEventId(testRunId: string, cycleNumber: number, action: 'deploy' | 'replenish'): string {
  return action === 'replenish'
    ? `routing-${testRunId}-c${cycleNumber}-liq`
    : `routing-${testRunId}-c${cycleNumber}`
}

/**
 * Zip conversion POP PDFs onto the Step 4 · Send or Step 5 · Restock card
 * (same pattern as invoice zips on Step 2). Never opens a standalone POP bubble.
 */
export async function publishPopPackDeskNotice(params: {
  conversionTxIds: string[]
  testRunId?: string
  cycleNumber?: number
  adminUid?: string
  attachAction?: 'deploy' | 'replenish'
}): Promise<void> {
  const txIds = [...new Set(params.conversionTxIds.filter((id) => typeof id === 'string' && id.trim()))]
  if (!txIds.length) return

  const adminUid = params.adminUid || ROUTING_ADMIN_UID
  const events = db().collection('users').doc(adminUid).collection('activityEvents')

  const attachId =
    params.testRunId && typeof params.cycleNumber === 'number' && params.attachAction
      ? stepEventId(params.testRunId, params.cycleNumber, params.attachAction)
      : null
  const attachRef = attachId ? events.doc(attachId) : null
  const attachSnap = attachRef ? await attachRef.get() : null
  const priorIds = Array.isArray(attachSnap?.data()?.conversionTxIds)
    ? (attachSnap!.data()!.conversionTxIds as unknown[]).filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0
      )
    : []
  const mergedIds = [...new Set([...priorIds, ...txIds])]
  const existingZip =
    typeof attachSnap?.data()?.proofZipStoragePath === 'string' &&
    attachSnap.data()!.proofZipStoragePath &&
    priorIds.length === mergedIds.length
      ? String(attachSnap.data()!.proofZipStoragePath)
      : ''

  const files: Array<{ name: string; data: Buffer }> = []
  if (!existingZip) {
    for (const txId of mergedIds) {
      const data = await getConversionData(txId)
      if (!data) continue
      const pdf = await generateConversionProofPdf(data)
      files.push({ name: conversionProofFilename(txId), data: pdf })
    }
    if (!files.length) return
  }

  const packKey =
    params.testRunId && typeof params.cycleNumber === 'number'
      ? `${params.testRunId}-c${params.cycleNumber}-${params.attachAction || 'mix'}`
      : mergedIds.sort().join('-').slice(0, 80)
  const filename =
    typeof params.cycleNumber === 'number'
      ? `cycle-${params.cycleNumber}-pops.zip`
      : `pops-${new Date().toISOString().slice(0, 10)}.zip`
  const storagePath = existingZip || `conversion-proofs/packs/${packKey}/${filename}`
  if (!existingZip) {
    await bucket().file(storagePath).save(zipBuffers(files), {
      contentType: 'application/zip',
      metadata: { cacheControl: 'private, max-age=0' },
    })
  }

  if (attachRef && attachSnap?.exists) {
    await attachRef.set(
      {
        hasDownloadButton: true,
        proofZipStoragePath: storagePath,
        proofZipFilename: filename,
        conversionTxIds: mergedIds,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
  }

  // Hide leftover standalone conversion / POP-pack bubbles from the desk.
  const hideIds = [
    ...mergedIds,
    params.testRunId && typeof params.cycleNumber === 'number'
      ? `pop-pack-${params.testRunId}-c${params.cycleNumber}`
      : null,
  ].filter((id): id is string => Boolean(id))
  await Promise.all(
    hideIds.map((id) =>
      events
        .doc(id)
        .set({ hasDownloadButton: false, deskHidden: true }, { merge: true })
        .catch(() => undefined)
    )
  )
}

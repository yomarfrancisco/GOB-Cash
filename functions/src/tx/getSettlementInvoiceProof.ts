/**
 * Cloud Function: getSettlementInvoiceProof
 *
 * Returns the stored settlement invoice PDF for the routing admin.
 * Reads fresh bytes from Storage (signed URLs on the invoice doc can expire).
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { ROUTING_ADMIN_UID } from '../routing/conversionRouter'
import { INVOICE_COLLECTION } from '../settlement/invoice'
import { settlementInvoiceFilename } from '../settlement/invoicePdf'
import type { SettlementInvoice } from '../settlement/invoice'

export const getSettlementInvoiceProof = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    if (context.auth.uid !== ROUTING_ADMIN_UID) {
      throw new functions.https.HttpsError('permission-denied', 'Routing admin only')
    }

    const invoiceId = data?.invoiceId
    if (!invoiceId || typeof invoiceId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'invoiceId is required')
    }

    const snap = await admin.firestore().collection(INVOICE_COLLECTION).doc(invoiceId).get()
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Invoice not found')
    }

    const invoice = { id: invoiceId, ...(snap.data() as Omit<SettlementInvoice, 'id'>) }
    const storagePath =
      typeof invoice.storagePath === 'string' && invoice.storagePath.trim()
        ? invoice.storagePath.trim()
        : null
    if (!storagePath) {
      throw new functions.https.HttpsError('failed-precondition', 'Invoice PDF is not stored yet')
    }

    const [bytes] = await admin.storage().bucket().file(storagePath).download()
    const filename = settlementInvoiceFilename(invoice as SettlementInvoice)

    return {
      pdfBase64: Buffer.from(bytes).toString('base64'),
      filename,
      mimeType: 'application/pdf',
    }
  })

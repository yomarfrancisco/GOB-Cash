/**
 * Phase 1: Resend email.received → verified ingress → private archive.
 * Does not parse banks, match tickets, or touch the desk.
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { archiveReceivedEmail } from './bankMailPure'
import { handleBankMailWebhook } from './bankMailPure'
import { resendReceivingClient } from './resendReceiving'
import {
  EVIDENCE_COLLECTION,
  INGRESS_COLLECTION,
  REJECTED_COLLECTION,
  type EvidenceRecord,
  type IngressRecord,
  type SafeLog,
} from './bankMailTypes'

const inboundSecret = defineSecret('RESEND_INBOUND_SECRET')
const inboundApiKey = defineSecret('RESEND_INBOUND_API_KEY')

const safeLog: SafeLog = {
  info(event, fields) {
    const safe: Record<string, string | number | boolean | null> = {}
    for (const [key, value] of Object.entries(fields || {})) {
      if (['status', 'reason', 'duplicate', 'retryable', 'emailId', 'rawBytes', 'attachments'].includes(key)) {
        safe[key] = value
      }
    }
    console.log(JSON.stringify({ event, ...safe }))
  },
}

function db() {
  return admin.firestore()
}

export const inbound_bankMail = functions
  .region('us-central1')
  .runWith({ secrets: [inboundSecret], timeoutSeconds: 20, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    const result = await handleBankMailWebhook({
      method: req.method,
      rawBody: req.rawBody,
      headers: req.headers as Record<string, unknown>,
      secret: inboundSecret.value(),
      log: safeLog,
      store: {
        async createIngress(record) {
          try {
            await db().collection(INGRESS_COLLECTION).doc(record.svixId).create(record)
            return 'created'
          } catch (error) {
            const code = (error as { code?: number }).code
            if (code === 6) return 'exists'
            throw error
          }
        },
        async createRejected(record) {
          try {
            await db().collection(REJECTED_COLLECTION).doc(record.svixId).create(record)
            return 'created'
          } catch (error) {
            const code = (error as { code?: number }).code
            if (code === 6) return 'exists'
            throw error
          }
        },
      },
    })
    res.status(result.status).json(result.body)
  })

export const inbound_archiveBankMail = functions
  .region('us-central1')
  .runWith({
    secrets: [inboundApiKey],
    timeoutSeconds: 120,
    memory: '512MB',
    failurePolicy: true,
  })
  .firestore.document(`${INGRESS_COLLECTION}/{svixId}`)
  .onCreate(async (snap) => {
    const ingress = snap.data() as IngressRecord
    if (ingress.status !== 'received') return
    const bucket = admin.storage().bucket()
    const outcome = await archiveReceivedEmail({
      ingress,
      log: safeLog,
      receiving: resendReceivingClient(inboundApiKey.value()),
      objects: {
        async putPrivateIfAbsent(path, bytes, contentType) {
          const file = bucket.file(path)
          const [exists] = await file.exists()
          if (exists) return 'exists'
          await file.save(bytes, {
            resumable: false,
            contentType,
            metadata: { metadata: { sha256: '' } },
            predefinedAcl: 'private',
          })
          return 'stored'
        },
      },
      evidence: {
        async get(emailId) {
          const doc = await db().collection(EVIDENCE_COLLECTION).doc(emailId).get()
          return doc.exists ? (doc.data() as EvidenceRecord) : null
        },
        async create(record) {
          try {
            await db().collection(EVIDENCE_COLLECTION).doc(record.resendEmailId).create(record)
            return 'created'
          } catch (error) {
            const code = (error as { code?: number }).code
            if (code === 6) return 'exists'
            throw error
          }
        },
      },
      ingressMutator: {
        async get(svixId) {
          const doc = await db().collection(INGRESS_COLLECTION).doc(svixId).get()
          return doc.exists ? (doc.data() as IngressRecord) : null
        },
        async update(svixId, patch) {
          await db().collection(INGRESS_COLLECTION).doc(svixId).set(patch, { merge: true })
        },
      },
    })
    if (!outcome.ok && outcome.retryable) {
      throw new Error('archive_retryable')
    }
  })

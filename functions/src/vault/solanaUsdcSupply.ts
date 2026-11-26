/**
 * Vault: Solana Pay USDC supply to PAGA treasury.
 * Create a unique reference pubkey per request; watch it for confirmation;
 * credit users/{uid}/vault/position and post the Earn "received" activity event.
 *
 * Uses JSON-RPC + bs58 (no @solana/web3.js — keeps Cloud Functions cold start / deploy light).
 */
import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import bs58 from 'bs58'

const TREASURY = '2pVRNVuUekuTgpY7nCj7aUD1mZ7LApBNspxVCiuTYHyh'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const LABEL = 'PAGA'
const MESSAGE = 'Supply USDC to PAGA'

function db() {
  return admin.firestore()
}

function solanaRpcUrl(): string {
  const fromConfig = functions.config()?.solana?.rpc_url
  if (typeof fromConfig === 'string' && fromConfig.trim()) return fromConfig.trim()
  return process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
}

function buildSolanaPayUrl(reference: string): string {
  const params = new URLSearchParams()
  params.set('spl-token', USDC_MINT)
  params.set('reference', reference)
  params.set('label', LABEL)
  params.set('message', MESSAGE)
  return `solana:${TREASURY}?${params.toString()}`
}

/** Random 32-byte pubkey as base58 — Solana Pay reference account. */
function generateReferencePubkey(): string {
  return bs58.encode(crypto.randomBytes(32))
}

function formatUsdcReceivedTitle(amountUsdc: number): string {
  const whole = Math.round(Math.max(0, amountUsdc))
  const spaced = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${spaced} USDC received.`
}

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(solanaRpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) {
    throw new Error(`Solana RPC HTTP ${res.status}`)
  }
  const json = (await res.json()) as { result?: T; error?: { message?: string } }
  if (json.error) {
    throw new Error(json.error.message || 'Solana RPC error')
  }
  return json.result as T
}

type TokenBalance = {
  mint: string
  owner?: string
  accountIndex: number
  uiTokenAmount?: { uiAmountString?: string | null; uiAmount?: number | null }
}

type ParsedTx = {
  meta: {
    err: unknown
    preTokenBalances?: TokenBalance[] | null
    postTokenBalances?: TokenBalance[] | null
  } | null
  transaction: {
    message: {
      accountKeys: Array<string | { pubkey: string; signer?: boolean }>
    }
  }
}

function emptyPosition() {
  return {
    suppliedUsdc: 0,
    trailingApyPct: 8.4,
    withdrawableNowUsd: 0,
    committedUsdc: 0,
    zarFunded: 0,
    zarEarned: 0,
    earnedUsdToday: 0,
    deliveriesToday: 0,
    deliveriesZarToday: 0,
    suppliedAtMs: null as number | null,
    backAtMs: null as number | null,
    legs: [] as unknown[],
    expectedEarnedUsd: 0,
    linkedSolanaWallet: null as string | null,
    lastSupply: null as null | {
      amountUsdc: number
      sender: string
      signature: string
      atMs: number
    },
    pendingSupply: null as null | {
      id: string
      reference: string
      createdAtMs: number
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
}

function accountKeyString(
  k: string | { pubkey: string }
): string {
  return typeof k === 'string' ? k : String(k.pubkey || '')
}

function usdcReceivedByTreasury(tx: ParsedTx): number {
  const meta = tx.meta
  if (!meta) return 0
  const pre = meta.preTokenBalances || []
  const post = meta.postTokenBalances || []
  const treasury = TREASURY

  let preAmt = 0
  let postAmt = 0
  for (const b of pre) {
    if (b.mint === USDC_MINT && b.owner === treasury) {
      preAmt = Number(b.uiTokenAmount?.uiAmountString ?? b.uiTokenAmount?.uiAmount ?? 0)
    }
  }
  for (const b of post) {
    if (b.mint === USDC_MINT && b.owner === treasury) {
      postAmt = Number(b.uiTokenAmount?.uiAmountString ?? b.uiTokenAmount?.uiAmount ?? 0)
    }
  }
  if (!(postAmt > preAmt)) {
    const keys = tx.transaction.message.accountKeys.map(accountKeyString)
    for (const b of pre) {
      if (b.mint !== USDC_MINT) continue
      if (keys[b.accountIndex] === treasury) {
        preAmt = Number(b.uiTokenAmount?.uiAmountString ?? b.uiTokenAmount?.uiAmount ?? 0)
      }
    }
    for (const b of post) {
      if (b.mint !== USDC_MINT) continue
      if (keys[b.accountIndex] === treasury) {
        postAmt = Number(b.uiTokenAmount?.uiAmountString ?? b.uiTokenAmount?.uiAmount ?? 0)
      }
    }
  }
  const delta = postAmt - preAmt
  return delta > 0 ? Math.round(delta * 1e6) / 1e6 : 0
}

function senderFromTx(tx: ParsedTx): string | null {
  const keys = tx.transaction.message.accountKeys
  if (!keys.length) return null
  return accountKeyString(keys[0]) || null
}

async function findConfirmedSupply(reference: string): Promise<{
  signature: string
  amountUsdc: number
  sender: string
} | null> {
  const sigs = await solanaRpc<Array<{ signature: string; err: unknown }>>(
    'getSignaturesForAddress',
    [reference, { limit: 5 }]
  )
  if (!sigs?.length) return null

  for (const s of sigs) {
    if (s.err) continue
    const tx = await solanaRpc<ParsedTx | null>('getTransaction', [
      s.signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
    ])
    if (!tx || tx.meta?.err) continue
    const amountUsdc = usdcReceivedByTreasury(tx)
    if (!(amountUsdc > 0)) continue
    const sender = senderFromTx(tx) || 'unknown'
    return { signature: s.signature, amountUsdc, sender }
  }
  return null
}

async function creditSupply(params: {
  uid: string
  supplyId: string
  reference: string
  amountUsdc: number
  sender: string
  signature: string
}): Promise<void> {
  const { uid, supplyId, reference, amountUsdc, sender, signature } = params
  const supplyRef = db().collection('users').doc(uid).collection('vaultSupplies').doc(supplyId)
  const positionRef = db().collection('users').doc(uid).collection('vault').doc('position')
  const eventId = `vault-usdc-${signature.slice(0, 32)}`
  const eventRef = db().collection('users').doc(uid).collection('activityEvents').doc(eventId)
  const atMs = Date.now()

  await db().runTransaction(async (tx) => {
    const supplySnap = await tx.get(supplyRef)
    if (!supplySnap.exists) return
    const supply = supplySnap.data() || {}
    if (supply.status === 'confirmed') return

    const posSnap = await tx.get(positionRef)
    const prev = posSnap.exists ? posSnap.data() || {} : emptyPosition()
    const prevSupplied = Number(prev.suppliedUsdc) || 0
    const prevFree = Number(prev.withdrawableNowUsd) || 0
    const nextSupplied = Math.round((prevSupplied + amountUsdc) * 1e6) / 1e6
    const nextFree = Math.round((prevFree + amountUsdc) * 1e6) / 1e6

    tx.set(
      positionRef,
      {
        ...emptyPosition(),
        ...prev,
        suppliedUsdc: nextSupplied,
        withdrawableNowUsd: nextFree,
        committedUsdc: Math.max(0, nextSupplied - nextFree),
        trailingApyPct: prev.trailingApyPct ?? 8.4,
        suppliedAtMs: prev.suppliedAtMs || atMs,
        linkedSolanaWallet: sender,
        lastSupply: {
          amountUsdc,
          sender,
          signature,
          atMs,
        },
        pendingSupply: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    tx.set(
      supplyRef,
      {
        status: 'confirmed',
        amountUsdc,
        sender,
        signature,
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        confirmedAtMs: atMs,
      },
      { merge: true }
    )

    const title = formatUsdcReceivedTitle(amountUsdc)
    const body =
      'It starts funding deliveries in the 09:00 cycle. Anything not funding a delivery can be withdrawn any time.'

    tx.set(eventRef, {
      id: eventId,
      kind: 'VAULT_USDC_RECEIVED',
      title,
      body,
      deskSentence: body,
      amountCurrency: 'USDT',
      amountValue: amountUsdc,
      amountSign: 'credit',
      actorType: 'ai_manager',
      deskSpeaker: 'sam',
      vaultUsdcAmount: amountUsdc,
      vaultSender: sender,
      vaultSignature: signature,
      vaultReference: reference,
      vaultNetwork: 'solana',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      recordingSource: 'VAULT_SOLANA_PAY',
    })
  })

  await positionRef.set(
    {
      pendingSupply: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  await db()
    .collection('vaultSupplyByRef')
    .doc(reference)
    .set({ status: 'confirmed', confirmedAtMs: atMs }, { merge: true })
}

export const vault_createUsdcSupply = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in required')
    }
    const uid = context.auth.uid
    const reference = generateReferencePubkey()
    const supplyId = `sup_${Date.now().toString(36)}_${reference.slice(0, 8)}`
    const solanaPayUrl = buildSolanaPayUrl(reference)
    const createdAtMs = Date.now()

    await db().collection('users').doc(uid).collection('vaultSupplies').doc(supplyId).set({
      id: supplyId,
      uid,
      reference,
      status: 'pending',
      treasury: TREASURY,
      mint: USDC_MINT,
      solanaPayUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs,
    })

    await db().collection('vaultSupplyByRef').doc(reference).set({
      uid,
      supplyId,
      status: 'pending',
      createdAtMs,
    })

    await db()
      .collection('users')
      .doc(uid)
      .collection('vault')
      .doc('position')
      .set(
        {
          pendingSupply: { id: supplyId, reference, createdAtMs },
          trailingApyPct: 8.4,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

    return {
      supplyId,
      reference,
      solanaPayUrl,
      treasury: TREASURY,
      mint: USDC_MINT,
    }
  })

export const vault_checkUsdcSupply = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in required')
    }
    const uid = context.auth.uid
    const supplyId = String((data || {}).supplyId || '')
    if (!supplyId) {
      throw new functions.https.HttpsError('invalid-argument', 'supplyId required')
    }

    const supplyRef = db().collection('users').doc(uid).collection('vaultSupplies').doc(supplyId)
    const snap = await supplyRef.get()
    if (!snap.exists) return { status: 'not_found' as const }
    const supply = snap.data() || {}
    if (supply.status === 'confirmed') {
      return {
        status: 'confirmed' as const,
        amountUsdc: Number(supply.amountUsdc) || 0,
        sender: String(supply.sender || ''),
        signature: String(supply.signature || ''),
      }
    }

    const reference = String(supply.reference || '')
    if (!reference) return { status: 'pending' as const }

    let found: Awaited<ReturnType<typeof findConfirmedSupply>> = null
    try {
      found = await findConfirmedSupply(reference)
    } catch (err) {
      functions.logger.warn('vault_checkUsdcSupply rpc', err)
      return { status: 'pending' as const }
    }
    if (!found) return { status: 'pending' as const }

    await creditSupply({
      uid,
      supplyId,
      reference,
      amountUsdc: found.amountUsdc,
      sender: found.sender,
      signature: found.signature,
    })

    return {
      status: 'confirmed' as const,
      amountUsdc: found.amountUsdc,
      sender: found.sender,
      signature: found.signature,
    }
  })

/** Sweep pending Solana Pay supplies every minute. */
export const vault_pollUsdcSupplies = functions
  .region('us-central1')
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    const cutoff = Date.now() - 1000 * 60 * 60 * 24
    const pending = await db()
      .collection('vaultSupplyByRef')
      .where('status', '==', 'pending')
      .limit(40)
      .get()

    for (const doc of pending.docs) {
      const data = doc.data() || {}
      const createdAtMs = Number(data.createdAtMs) || 0
      if (createdAtMs && createdAtMs < cutoff) continue
      const uid = String(data.uid || '')
      const supplyId = String(data.supplyId || '')
      const reference = doc.id
      if (!uid || !supplyId || !reference) continue
      try {
        const found = await findConfirmedSupply(reference)
        if (!found) continue
        await creditSupply({
          uid,
          supplyId,
          reference,
          amountUsdc: found.amountUsdc,
          sender: found.sender,
          signature: found.signature,
        })
      } catch (err) {
        functions.logger.warn('vault_pollUsdcSupplies', { id: doc.id, err })
      }
    }
    return null
  })

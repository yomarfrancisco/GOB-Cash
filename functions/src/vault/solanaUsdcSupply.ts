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
  const n = Math.max(0, Number(amountUsdc) || 0)
  // Keep fractional dust visible (self-fund tests were rounding 0.01 → "0 USDC").
  const label =
    n >= 999.995
      ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
      : n.toLocaleString('en-US', { maximumFractionDigits: 6 })
          .replace(/,/g, ' ')
  return `${label} USDC received.`
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

type ParsedIx = {
  program?: string
  programId?: string
  parsed?: {
    type?: string
    info?: {
      source?: string
      destination?: string
      authority?: string
      multisigAuthority?: string
      mint?: string
      amount?: string
      tokenAmount?: { uiAmount?: number | null; uiAmountString?: string | null; amount?: string }
    }
  }
}

type ParsedTx = {
  meta: {
    err: unknown
    preTokenBalances?: TokenBalance[] | null
    postTokenBalances?: TokenBalance[] | null
    innerInstructions?: Array<{ instructions?: ParsedIx[] }> | null
  } | null
  transaction: {
    message: {
      accountKeys: Array<string | { pubkey: string; signer?: boolean }>
      instructions?: ParsedIx[]
    }
  }
}

/** Observed treasury USDC ATA (owner = TREASURY). */
const TREASURY_USDC_ATA = '3BWBdkrcQ2o51927WAniP1hSjhcaECF9px3EZcABPA74'

/** Part 19 note schedule (SAST). Keep in sync with src/lib/vault/deliveryNote.ts. */
const NOTE = {
  openHour: 9,
  cutoffHour: 21,
  openRatePct: 6.5,
  stepDownPct: 0.25,
  stepEveryMinutes: 60,
  floorRatePct: 3.5,
  sastOffsetMs: 2 * 60 * 60 * 1000,
} as const

function liveNoteRatePctAt(atMs: number): number {
  const shifted = new Date(atMs + NOTE.sastOffsetMs)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth() + 1
  const d = shifted.getUTCDate()
  const openMs =
    Date.UTC(y, m - 1, d, NOTE.openHour, 0, 0) - NOTE.sastOffsetMs
  const cutoffMs =
    Date.UTC(y, m - 1, d, NOTE.cutoffHour, 0, 0) - NOTE.sastOffsetMs
  if (atMs < openMs) return NOTE.openRatePct
  const end = Math.min(atMs, cutoffMs)
  const steps = Math.floor((end - openMs) / (NOTE.stepEveryMinutes * 60_000))
  const rate = NOTE.openRatePct - steps * NOTE.stepDownPct
  return Math.max(NOTE.floorRatePct, Math.round(rate * 100) / 100)
}

function blendLockedRate(
  prevRate: number | null,
  prevSupplied: number,
  nextRate: number,
  addUsdc: number
): number {
  if (!(prevSupplied > 0.005) || prevRate == null || !Number.isFinite(prevRate)) {
    return nextRate
  }
  const total = prevSupplied + addUsdc
  if (!(total > 0.005)) return nextRate
  return Math.round(((prevRate * prevSupplied + nextRate * addUsdc) / total) * 100) / 100
}

function emptyPosition() {
  return {
    suppliedUsdc: 0,
    trailingApyPct: null as number | null,
    lockedRatePct: null as number | null,
    usedUsdc: 0,
    withdrawableNowUsd: 0,
    committedUsdc: 0,
    zarFunded: 0,
    zarEarned: 0,
    earnedUsdToday: 0,
    deliveriesToday: 0,
    deliveriesZarToday: 0,
    suppliedAtMs: null as number | null,
    backAtMs: null as number | null,
    settledAtMs: null as number | null,
    returnedUsdc: null as number | null,
    notePhase: null as string | null,
    noteFull: false,
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

async function isSignatureClaimed(signature: string): Promise<boolean> {
  const snap = await db().collection('vaultClaimedSigs').doc(signature).get()
  return snap.exists
}

function allParsedInstructions(tx: ParsedTx): ParsedIx[] {
  const top = tx.transaction.message.instructions || []
  const inner =
    tx.meta?.innerInstructions?.flatMap((group) => group.instructions || []) || []
  return [...top, ...inner]
}

/** USDC amount from transfer / transferChecked that touches the treasury ATA. */
function usdcInstructionAmountToTreasury(tx: ParsedTx): number {
  let best = 0
  for (const ix of allParsedInstructions(tx)) {
    const parsed = ix.parsed
    if (!parsed || typeof parsed !== 'object') continue
    const type = String(parsed.type || '')
    if (!/transfer/i.test(type)) continue
    const info = parsed.info || {}
    const mint = info.mint || ''
    if (mint && mint !== USDC_MINT) continue
    const dest = String(info.destination || '')
    const src = String(info.source || '')
    // Destination or source is treasury ATA (self-fund still counts while pending).
    if (dest !== TREASURY_USDC_ATA && src !== TREASURY_USDC_ATA) continue
    let amt = 0
    if (info.tokenAmount) {
      amt = Number(info.tokenAmount.uiAmountString ?? info.tokenAmount.uiAmount ?? 0)
    } else if (info.amount != null) {
      amt = Number(info.amount) / 1e6
    }
    if (amt > best) best = amt
  }
  return best > 0 ? Math.round(best * 1e6) / 1e6 : 0
}

function signerPubkeys(tx: ParsedTx): string[] {
  return tx.transaction.message.accountKeys
    .map((k, i) => {
      if (typeof k === 'string') return i === 0 ? k : ''
      return k.signer ? k.pubkey : ''
    })
    .filter(Boolean)
}

/**
 * Resolve a credit amount for a signature.
 * Prefers net treasury USDC increase; falls back to transferChecked instruction
 * amount (covers treasury self-fund / Phantom omitting Solana Pay reference).
 */
async function parseInboundFromSig(
  signature: string,
  opts?: { allowSelfFund?: boolean; reference?: string }
): Promise<{
  signature: string
  amountUsdc: number
  sender: string
} | null> {
  const tx = await solanaRpc<ParsedTx | null>('getTransaction', [
    signature,
    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
  ])
  if (!tx || tx.meta?.err) return null
  if (await isSignatureClaimed(signature)) return null

  const keys = tx.transaction.message.accountKeys.map(accountKeyString)
  const hasReference =
    Boolean(opts?.reference) && keys.some((k) => k === opts!.reference)

  const delta = usdcReceivedByTreasury(tx)
  const instructed = usdcInstructionAmountToTreasury(tx)
  const amountUsdc = Math.max(delta, instructed)
  if (!(amountUsdc > 0.0000005)) return null

  const signers = signerPubkeys(tx)
  const external = signers.find((k) => k && k !== TREASURY)
  const allowSelf = Boolean(opts?.allowSelfFund) || hasReference
  if (!external && !allowSelf) return null

  const sender = external || signers[0] || TREASURY
  return { signature, amountUsdc, sender }
}

/**
 * 1) Solana Pay reference account (preferred)
 * 2) Fallback: treasury txs after pending created — net credit OR instruction
 *    amount (self-fund / missing reference still attributes while pending)
 */
async function findConfirmedSupply(params: {
  reference: string
  createdAtMs?: number
}): Promise<{
  signature: string
  amountUsdc: number
  sender: string
} | null> {
  const { reference, createdAtMs } = params

  try {
    const refSigs = await solanaRpc<Array<{ signature: string; err: unknown }>>(
      'getSignaturesForAddress',
      [reference, { limit: 8 }]
    )
    for (const s of refSigs || []) {
      if (s.err) continue
      const found = await parseInboundFromSig(s.signature, {
        allowSelfFund: true,
        reference,
      })
      if (found) return found
    }
  } catch (err) {
    functions.logger.warn('findConfirmedSupply reference scan', err)
  }

  // Look back from pending create (or last 24h) so a late Phantom confirm still matches.
  const sinceMs =
    createdAtMs && createdAtMs > 0 ? Math.min(createdAtMs, Date.now()) - 60_000 : Date.now() - 86_400_000
  const sinceSec = Math.floor(sinceMs / 1000)
  try {
    const treasurySigs = await solanaRpc<
      Array<{ signature: string; err: unknown; blockTime?: number | null }>
    >('getSignaturesForAddress', [TREASURY, { limit: 25 }])
    for (const s of treasurySigs || []) {
      if (s.err) continue
      if (s.blockTime != null && s.blockTime < sinceSec) continue
      const found = await parseInboundFromSig(s.signature, {
        allowSelfFund: true,
        reference,
      })
      if (found) return found
    }
  } catch (err) {
    functions.logger.warn('findConfirmedSupply treasury scan', err)
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
    const depositRate = liveNoteRatePctAt(atMs)
    const prevLocked =
      prev.lockedRatePct == null ? null : Number(prev.lockedRatePct)
    const blended = blendLockedRate(prevLocked, prevSupplied, depositRate, amountUsdc)
    const expectedEarnedUsd =
      Math.round(nextSupplied * (blended / 100) * 100) / 100

    tx.set(
      positionRef,
      {
        ...emptyPosition(),
        ...prev,
        suppliedUsdc: nextSupplied,
        withdrawableNowUsd: nextFree,
        committedUsdc: Math.max(0, nextSupplied - nextFree),
        usedUsdc: Math.max(0, Number(prev.usedUsdc) || Number(prev.committedUsdc) || 0),
        trailingApyPct: null,
        lockedRatePct: blended,
        notePhase: 'funded',
        noteFull: false,
        expectedEarnedUsd,
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
        lockedRatePct: depositRate,
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        confirmedAtMs: atMs,
      },
      { merge: true }
    )

    const title = formatUsdcReceivedTitle(amountUsdc)
    const body = `Your rate is locked at ${blended}%. Back by 04:00 with return only on the USDC used for deliveries.`

    tx.set(eventRef, {
      id: eventId,
      kind: 'VAULT_USDC_RECEIVED',
      title,
      body,
      deskSentence: body,
      // Vault / Earn piggy feed only — never the desk (lamp) timeline.
      deskHidden: true,
      amountCurrency: 'USDC',
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

  await db()
    .collection('vaultClaimedSigs')
    .doc(signature)
    .set(
      {
        uid,
        supplyId,
        amountUsdc,
        sender,
        claimedAtMs: atMs,
      },
      { merge: true }
    )
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
    const createdAtMs = Number(supply.createdAtMs) || 0

    let found: Awaited<ReturnType<typeof findConfirmedSupply>> = null
    try {
      found = await findConfirmedSupply({ reference, createdAtMs })
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
        const found = await findConfirmedSupply({
          reference,
          createdAtMs: Number(data.createdAtMs) || 0,
        })
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

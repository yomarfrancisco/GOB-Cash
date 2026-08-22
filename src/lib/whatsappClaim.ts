export const WHATSAPP_CLAIM_TTL_MS = 24 * 60 * 60 * 1000
export const WHATSAPP_CLAIM_PUBLIC_ORIGIN = 'https://gobankless.app'

export type WhatsAppClaimPayload = {
  amountZAR: number
  expiresAt: number
  nonce: string
}

export type WhatsAppClaimBank = {
  country: string
  bankName: string
  accountHolderName: string
  accountNumber: string
  swiftBic: string
}

function toBase64Url(value: string): string {
  const bytes = btoa(unescape(encodeURIComponent(value)))
  return bytes.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const base64 = padded + '==='.slice((padded.length + 3) % 4)
  return decodeURIComponent(escape(atob(base64)))
}

function makeNonce(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  }
  return Math.random().toString(36).slice(2, 12)
}

export function formatClaimAmount(amountZAR: number): string {
  return `R${amountZAR.toFixed(2)}`
}

export function createWhatsAppClaimToken(amountZAR: number): string {
  const payload = {
    a: Number(amountZAR.toFixed(2)),
    e: Date.now() + WHATSAPP_CLAIM_TTL_MS,
    n: makeNonce(),
  }
  return toBase64Url(JSON.stringify(payload))
}

export function parseWhatsAppClaimToken(token: string): WhatsAppClaimPayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as { a?: number; e?: number; n?: string }
    const amountZAR = Number(parsed.a)
    const expiresAt = Number(parsed.e)
    const nonce = typeof parsed.n === 'string' ? parsed.n : ''
    if (!Number.isFinite(amountZAR) || amountZAR <= 0) return null
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null
    if (!nonce) return null
    return { amountZAR, expiresAt, nonce }
  } catch {
    return null
  }
}

export function guestHandleFromNonce(nonce: string): string {
  return `$guest-${nonce.slice(0, 4).toLowerCase()}`
}

export function getWhatsAppClaimOrigin(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return window.location.origin
    }
  }
  return WHATSAPP_CLAIM_PUBLIC_ORIGIN
}

export function buildWhatsAppClaimUrl(token: string): string {
  return `${getWhatsAppClaimOrigin()}/claim/${token}`
}

export function buildWhatsAppClaimMessage(amountZAR: number, claimUrl: string): string {
  return `Hi, I'd like to send you ${formatClaimAmount(amountZAR)} on GoBankless. You can withdraw the funds within 24 hours here ${claimUrl}.`
}

export function buildWhatsAppClaimAmaText(amountZAR: number, bank: WhatsAppClaimBank): string {
  const amount = formatClaimAmount(amountZAR)
  return [
    'Bank withdrawal request received ✅',
    '',
    `**Amount:** ${amount}`,
    '**Method:** Bank transfer',
    `**Country:** ${bank.country}`,
    `**Bank:** ${bank.bankName}`,
    `**Account holder:** ${bank.accountHolderName}`,
    '',
    `You will receive ${amount} in your bank account.`,
    '',
    '*Note: Bank payouts typically take 24–72 hours depending on your bank/network.*',
  ].join('\n')
}

export function downloadWhatsAppClaimProof(amountZAR: number, bank: WhatsAppClaimBank): void {
  const amount = formatClaimAmount(amountZAR)
  const body = [
    'GoBankless withdrawal proof',
    `Amount: ${amount}`,
    'Method: Bank transfer',
    `Country: ${bank.country}`,
    `Bank: ${bank.bankName}`,
    `Account holder: ${bank.accountHolderName}`,
    `Requested: ${new Date().toISOString()}`,
  ].join('\n')

  const blob = new Blob([body], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'GoBankless-withdrawal-proof.txt'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function exitWhatsAppClaimToHome(): void {
  if (typeof window === 'undefined') return
  window.location.replace('/')
}

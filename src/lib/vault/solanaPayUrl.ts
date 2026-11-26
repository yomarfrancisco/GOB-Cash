import {
  PAGA_SOLANA_TREASURY,
  SOLANA_PAY_LABEL,
  SOLANA_PAY_MESSAGE,
  SOLANA_USDC_MINT,
} from '@/config/solanaTreasury'

/** Build a Solana Pay transfer request (amount omitted — Phantom prompts). */
export function buildUsdcSupplySolanaPayUrl(reference: string): string {
  const params = new URLSearchParams()
  params.set('spl-token', SOLANA_USDC_MINT)
  params.set('reference', reference)
  params.set('label', SOLANA_PAY_LABEL)
  params.set('message', SOLANA_PAY_MESSAGE)
  return `solana:${PAGA_SOLANA_TREASURY}?${params.toString()}`
}

export function isMobileSolanaClient(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export function shortenSolanaAddress(address: string, head = 4, tail = 4): string {
  const a = String(address || '')
  if (a.length <= head + tail + 1) return a
  return `${a.slice(0, head)}…${a.slice(-tail)}`
}

export function shortenTxSignature(signature: string): string {
  const s = String(signature || '')
  if (s.length <= 6) return s
  return `··${s.slice(-4)}`
}

/** "5 000 USDC received." (keeps fractional amounts under 1,000) */
export function formatUsdcReceivedTitle(amountUsdc: number): string {
  const n = Math.max(0, Number(amountUsdc) || 0)
  const label =
    n >= 999.995
      ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
      : n.toLocaleString('en-US', { maximumFractionDigits: 6 }).replace(/,/g, ' ')
  return `${label} USDC received.`
}

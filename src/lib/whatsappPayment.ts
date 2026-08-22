import { formatZARWithDot } from '@/lib/money'
import { validateRecipientInput } from '@/lib/recipientValidation'

function toWhatsAppDigits(raw: string): string | null {
  const cleaned = raw.replace(/[()\s-]/g, '')
  if (!cleaned) return null
  const digits = cleaned.replace(/^\+/, '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 20) return null
  return digits
}

export function buildWhatsAppPaymentMessage(amountZAR: number): string {
  return `Hi, I'd like to send you ${formatZARWithDot(amountZAR)} on GoBankless.`
}

export function openWhatsAppPaymentDraft(amountZAR: number, recipient?: string): void {
  if (typeof window === 'undefined') return

  const text = encodeURIComponent(buildWhatsAppPaymentMessage(amountZAR))
  const trimmed = recipient?.trim() ?? ''
  const digits =
    trimmed && validateRecipientInput(trimmed) ? toWhatsAppDigits(trimmed) : null

  const url = digits
    ? `https://wa.me/${digits}?text=${text}`
    : `https://wa.me/?text=${text}`

  window.open(url, '_blank', 'noopener,noreferrer')
}

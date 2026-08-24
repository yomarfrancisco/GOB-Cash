import { validateRecipientInput } from '@/lib/recipientValidation'
import {
  buildWhatsAppClaimMessage,
  buildWhatsAppClaimUrl,
  createWhatsAppClaimToken,
} from '@/lib/whatsappClaim'

function toWhatsAppDigits(raw: string): string | null {
  const cleaned = raw.replace(/[()\s-]/g, '')
  if (!cleaned) return null
  const digits = cleaned.replace(/^\+/, '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 20) return null
  return digits
}

export function openWhatsAppPaymentDraft(
  amountMZN: number,
  amountZAR: number,
  recipient?: string
): void {
  if (typeof window === 'undefined') return

  const token = createWhatsAppClaimToken(amountZAR)
  const claimUrl = buildWhatsAppClaimUrl(token)
  const text = encodeURIComponent(buildWhatsAppClaimMessage(amountZAR, claimUrl, amountMZN))
  const trimmed = recipient?.trim() ?? ''
  const digits =
    trimmed && validateRecipientInput(trimmed) ? toWhatsAppDigits(trimmed) : null

  const url = digits
    ? `https://wa.me/${digits}?text=${text}`
    : `https://wa.me/?text=${text}`

  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Samba message templates for deposit chat flow
 * Deterministic templates based on chatStep
 */

import type { ChatStep } from '@/types/transactions'

export interface SambaMessageTemplate {
  text: string
  variables?: Record<string, string>
}

export function getSambaMessage(
  chatStep: ChatStep,
  variables: {
    handleCustomer?: string
    customerFirstName?: string
    displayName?: string
    amount?: string
    currency?: string
    country?: string
    bankName?: string
    bankCountry?: string
    depositReference?: string
  }
): string {
  const handleCustomer = variables.handleCustomer || variables.customerFirstName || variables.displayName || 'there'
  const amount = variables.amount || '0'
  const currency = variables.currency || 'ZAR'
  const country = variables.country || ''
  const bankName = variables.bankName || 'your bank'
  const reference = variables.depositReference || ''

  switch (chatStep) {
    case 'INTRO_CONFIRM_INTENT':
      return `Hi ${handleCustomer} — I'm Ema from GoBankless.\n\nTo confirm:\n\n• Deposit amount: ${amount}\n• Deposit method: Direct bank transfer\n• Country: ${country}\n• Bank: ${bankName}\n• You will receive: USDT (TRC-20)\n• Next step: After you send the bank transfer, reply "SENT" and upload proof of payment (screenshot or reference).\n\nWhen you're ready, send "SENT" + proof.`

    case 'WAITING_FOR_SENT_PROOF':
      return `Thanks — proof received.\n\nWe're now verifying the deposit with our bank.\n\nIn the meantime, please confirm the USDT wallet address you want us to send to:\n\n• Network: TRON (TRC-20) only (address starts with "T")\n• Please double-check the address — crypto transfers are irreversible.\n\nReply with your TRC-20 address when ready.`

    case 'WAITING_FOR_WALLET_ADDRESS':
      return `Got it 👍\n\nI've saved your TRON (TRC-20) address.\n\nI'll notify you here as soon as the deposit is confirmed.`

    case 'WAITING_FOR_AGENT_CONFIRMATION':
      return `Thanks — I've received that.\n\nWe're now verifying the deposit with our bank.\n\nThis usually takes 1–2 hours during business hours.\n\nI'll notify you here as soon as the deposit is confirmed.`

    case 'DEPOSIT_CONFIRMED_LOCKED_DONE':
      return `Deposit confirmed ✓\n\nAmount received: ${amount} ${currency}\n\nThanks — we're ready for the next step.`

    default:
      return `I'm here to help with your deposit. Please follow the steps above.`
  }
}

export function getSambaHelperResponse(userMessage: string, chatStep: ChatStep): string | null {
  // Helper responses when user veers off track
  const lowerMessage = userMessage.toLowerCase().trim()

  // Check if user is asking a question (simple heuristic)
  const isQuestion = lowerMessage.includes('?') || 
    lowerMessage.startsWith('what') ||
    lowerMessage.startsWith('how') ||
    lowerMessage.startsWith('why') ||
    lowerMessage.startsWith('when') ||
    lowerMessage.startsWith('where')

  if (isQuestion && chatStep !== 'DEPOSIT_CONFIRMED_LOCKED_DONE') {
    return `Good question — happy to clarify.\n\nOnce you've made the transfer, just reply **SENT** here and I'll take you to the next step.`
  }

  // Invalid TRON address response
  if (chatStep === 'WAITING_FOR_WALLET_ADDRESS' && !lowerMessage.startsWith('t') && lowerMessage.length > 10) {
    return `That doesn't look like a TRON (TRC-20) address.\n\nPlease send a TRC-20 address that starts with **T**.\n\nLet me know if you'd like help finding it in your wallet.`
  }

  return null
}

/**
 * Validate TRON (TRC-20) address format
 * Basic validation: starts with T, ~34 characters
 */
export function isValidTronAddress(address: string): boolean {
  const trimmed = address.trim()
  return trimmed.startsWith('T') && trimmed.length >= 26 && trimmed.length <= 34
}


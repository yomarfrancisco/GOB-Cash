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
    customerFirstName?: string
    bankName?: string
    bankCountry?: string
    depositReference?: string
  }
): string {
  const firstName = variables.customerFirstName || 'there'
  const bankName = variables.bankName || 'your bank'
  const bankCountry = variables.bankCountry || ''
  const reference = variables.depositReference || ''

  switch (chatStep) {
    case 'INTRO_CONFIRM_INTENT':
      return `Hi ${firstName} 👋\n\nI'm Samba from GoBankless. I'll guide you through this deposit.\n\nHere's what we have:\n\n• Deposit method: Direct bank transfer\n• Bank: ${bankName} (${bankCountry})\n• Reference: ${reference}\n\nPlease make your transfer using the reference above.\n\nOnce done, reply **SENT** and attach your proof of payment (or paste the bank reference).`

    case 'WAITING_FOR_WALLET_ADDRESS':
      return `Thanks — I've received that.\n\nWe're now verifying the deposit with our bank.\n\nThis usually takes 1–2 hours during business hours.\n\nWhile we wait, please send the **USDT wallet address** where you'd like to receive funds later.\n\nImportant:\n• Network: **TRON (TRC-20) only**\n• Addresses usually start with **T**`

    case 'WAITING_FOR_WALLET_ADDRESS':
      return `Got it 👍\n\nI've saved your TRON (TRC-20) address.\n\nI'll notify you here as soon as the deposit is confirmed.`

    case 'WAITING_FOR_AGENT_CONFIRMATION':
      return `Thanks — I've received that.\n\nWe're now verifying the deposit with our bank.\n\nThis usually takes 1–2 hours during business hours.\n\nI'll notify you here as soon as the deposit is confirmed.`

    case 'DEPOSIT_CONFIRMED_LOCKED_DONE':
      return `Deposit confirmed ✓\n\nYour funds have been received and are now securely locked for settlement.\n\nYou'll see the updated balance reflected in your wallet.\n\nI'll be here if you need anything else.`

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


'use client'

import React, { useEffect, useRef, useState } from 'react'
import { getFirestoreDb } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore'
import { getFirebaseAuth } from '@/lib/firebase'
import type { TransactionMessage, ChatStep, BankDepositTransaction, SenderType } from '@/types/transactions'
import { getSambaMessage, getSambaHelperResponse, isValidTronAddress } from '@/lib/depositChat/sambaMessages'
import { tx_userMarkDepositSent, tx_appendUserMessage, tx_appendSambaMessage, tx_setWithdrawalAddressCandidate } from '@/lib/transactions/clientFunctions'
import { useUserProfileStore } from '@/store/userProfile'
import { useNotificationStore } from '@/store/notifications'
import ActionSheet from './ActionSheet'
import ChatHeader from './Inbox/ChatHeader'
import ChatMessageBubble from './Inbox/ChatMessageBubble'
import ChatInputBar from './Inbox/ChatInputBar'
import chatStyles from './Inbox/FinancialInboxChatSheet.module.css'

type DepositChatSheetProps = {
  open: boolean
  onClose: () => void
  txId: string
}

/**
 * Normalized message format for chat renderer
 */
interface NormalizedChatMessage {
  id: string
  from: 'ai' | 'user'
  text: string
  createdAt: any
}

/**
 * Normalize transaction message to Ama chat format
 * Client-side transformation only - Firestore schema unchanged
 */
function normalizeTransactionMessage(txMessage: TransactionMessage): NormalizedChatMessage {
  // Map senderType to from field
  // Actual values written by callables:
  // - tx_appendUserMessage writes 'USER'
  // - tx_appendSambaMessage writes 'SAMBA'
  // - System messages write 'SYSTEM'
  // Legacy values: 'CUSTOMER', 'AGENT' (for backward compatibility)
  let from: 'ai' | 'user'
  if (txMessage.senderType === 'SAMBA' || txMessage.senderType === 'SYSTEM' || txMessage.senderType === 'AGENT') {
    from = 'ai' // Display Samba/System/Agent messages as Ama
  } else if (txMessage.senderType === 'USER' || txMessage.senderType === 'CUSTOMER') {
    from = 'user'
  } else {
    // Unknown - default to ai (shouldn't happen with proper types)
    from = 'ai'
  }

  return {
    id: txMessage.id,
    from,
    text: txMessage.text,
    createdAt: txMessage.createdAt,
  }
}

export default function DepositChatSheet({ open, onClose, txId }: DepositChatSheetProps) {
  const [messages, setMessages] = useState<TransactionMessage[]>([])
  const [transaction, setTransaction] = useState<BankDepositTransaction | null>(null)
  const [inputText, setInputText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageAreaRef = useRef<HTMLDivElement>(null)
  const { profile } = useUserProfileStore()
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const auth = getFirebaseAuth()
  const sambaMessageSentRef = useRef<Set<ChatStep>>(new Set())
  const depositConfirmedNotifiedRef = useRef(false)

  // Subscribe to messages
  useEffect(() => {
    if (!open || !txId) return

    const db = getFirestoreDb()
    const messagesRef = collection(db, 'transactions', txId, 'messages')
    const q = query(messagesRef, orderBy('createdAt', 'asc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: TransactionMessage[] = []
      snapshot.forEach((docSnap) => {
        msgs.push(docSnap.data() as TransactionMessage)
      })
      setMessages(msgs)
    })

    return () => unsubscribe()
  }, [open, txId])

  // Subscribe to transaction updates (for chatStep changes)
  useEffect(() => {
    if (!open || !txId) return

    const db = getFirestoreDb()
    const txRef = doc(db, 'transactions', txId)

    const unsubscribe = onSnapshot(txRef, (snapshot) => {
      if (snapshot.exists()) {
        const tx = snapshot.data() as BankDepositTransaction
        const prevStep = transaction?.chatStep
        setTransaction(tx)
        
        // If chatStep changed to DEPOSIT_CONFIRMED_LOCKED_DONE, send final Samba message and notification
        if (tx.chatStep === 'DEPOSIT_CONFIRMED_LOCKED_DONE' && prevStep !== 'DEPOSIT_CONFIRMED_LOCKED_DONE') {
          if (!sambaMessageSentRef.current.has('DEPOSIT_CONFIRMED_LOCKED_DONE')) {
            sendSambaMessage('DEPOSIT_CONFIRMED_LOCKED_DONE', tx)
            sambaMessageSentRef.current.add('DEPOSIT_CONFIRMED_LOCKED_DONE')
          }
          
          // Show notification banner
          if (!depositConfirmedNotifiedRef.current) {
            pushNotification({
              kind: 'payment_received',
              title: 'Deposit received',
              action: 'Funds locked for settlement',
              amount: {
                currency: 'ZAR',
                value: tx.amountZar || 0,
              },
              direction: 'up',
              actor: {
                type: 'system',
                name: 'GoBankless',
              },
              routeOnTap: '/transactions',
            })
            depositConfirmedNotifiedRef.current = true
          }
        } else if (tx.chatStep && !sambaMessageSentRef.current.has(tx.chatStep) && tx.chatStep !== 'DEPOSIT_CONFIRMED_LOCKED_DONE') {
          // For other steps, trigger Samba message if needed
          handleChatStepChange(tx.chatStep, tx)
          sambaMessageSentRef.current.add(tx.chatStep)
        }
      }
    })

    return () => unsubscribe()
  }, [open, txId, transaction?.chatStep])

  // Send initial Samba message on open
  useEffect(() => {
    if (!open || !transaction || !txId) return

    // Check if we need to send intro message
    if (transaction.chatStep === 'INTRO_CONFIRM_INTENT' && !sambaMessageSentRef.current.has('INTRO_CONFIRM_INTENT')) {
      // Wait a bit for messages to load, then send intro
      setTimeout(() => {
        // Check if Samba already sent a message (from existing messages)
        const hasSambaMessage = messages.some(m => m.senderType === 'SAMBA')
        if (!hasSambaMessage) {
          sendSambaMessage(transaction.chatStep, transaction)
          sambaMessageSentRef.current.add('INTRO_CONFIRM_INTENT')
        }
      }, 1000)
    }
  }, [open, transaction, messages, txId])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messageAreaRef.current && messagesEndRef.current) {
      // Use scrollIntoView on the messagesEndRef within the scrollable container
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const sendSambaMessage = async (chatStep: ChatStep, tx: BankDepositTransaction) => {
    try {
      const handleCustomer = profile.userHandle || profile.fullName?.split(' ')[0] || 'there'
      const firstName = profile.fullName?.split(' ')[0] || 'there'
      const displayName = profile.fullName || 'there'
      
      // Use depositDetails if available (from persisted amount), otherwise fall back to tx fields
      const depositDetails = tx.depositDetails
      const amount = depositDetails?.amount ? `${depositDetails.amount.toFixed(2)}` : (tx.amountZar ? `${tx.amountZar.toFixed(2)}` : '0')
      const currency = depositDetails?.currency || (tx.depositCurrency === 'MZN' ? 'MZN' : 'ZAR')
      const countryName = depositDetails?.country || (tx.bankCountry === 'MZ' ? 'Mozambique' : tx.bankCountry === 'ZA' ? 'South Africa' : '')
      const bankName = depositDetails?.bankName || tx.bankId || ''
      const bankCountry = tx.bankCountry || ''
      const reference = depositDetails?.reference || tx.depositReference || ''

      const sambaText = getSambaMessage(chatStep, {
        handleCustomer,
        customerFirstName: firstName,
        displayName,
        amount,
        currency,
        country: countryName,
        bankName,
        bankCountry,
        depositReference: reference,
      })

      // Use callable to append Samba message (no direct Firestore writes from client)
      await tx_appendSambaMessage(txId, sambaText)
    } catch (error) {
      console.error('[DepositChat] Failed to send Samba message:', error)
    }
  }

  const handleChatStepChange = async (newStep: ChatStep, tx: BankDepositTransaction) => {
    // Send appropriate Samba message for the new step (if not already sent)
    if (!sambaMessageSentRef.current.has(newStep)) {
      await sendSambaMessage(newStep, tx)
      sambaMessageSentRef.current.add(newStep)
    }
  }

  const handleSend = async () => {
    if (!inputText.trim() || isProcessing) return

    const userMessage = inputText.trim()
    setInputText('')
    setIsProcessing(true)

    try {
      const auth = getFirebaseAuth()
      const user = auth.currentUser
      if (!user) {
        console.error('[DepositChat] No authenticated user')
        return
      }

      // Add user message
      await tx_appendUserMessage(txId, userMessage)

      // Process based on current chatStep
      if (!transaction) return
      const currentStep = transaction.chatStep

      if (currentStep === 'INTRO_CONFIRM_INTENT') {
        // Check if user said "SENT" (case-insensitive)
        if (userMessage.toLowerCase().includes('sent')) {
          // Mark deposit as sent and update chatStep server-side (no client Firestore writes)
          await tx_userMarkDepositSent(txId)
        } else {
          // Check for helper response
            const helperResponse = getSambaHelperResponse(userMessage, currentStep)
            if (helperResponse) {
              // Send as Samba via callable
              await tx_appendSambaMessage(txId, helperResponse)
            }
        }
      } else if (currentStep === 'WAITING_FOR_SENT_PROOF') {
        // After user says SENT, they should provide TRON address
        // Validate TRON address
        if (isValidTronAddress(userMessage)) {
          // Store address and move to WAITING_FOR_WALLET_ADDRESS server-side (no client Firestore writes)
          await tx_setWithdrawalAddressCandidate(txId, userMessage.trim(), 'WAITING_FOR_WALLET_ADDRESS')
          
          // Send Samba confirmation message
          const updatedTx = { ...transaction, chatStep: 'WAITING_FOR_WALLET_ADDRESS' as ChatStep, withdrawalAddressCandidate: userMessage.trim() }
          await sendSambaMessage('WAITING_FOR_WALLET_ADDRESS', updatedTx)
        } else {
          // Invalid address - send helper response
          const helperResponse = getSambaHelperResponse(userMessage, currentStep)
          if (helperResponse) {
            await tx_appendSambaMessage(txId, helperResponse)
          }
        }
      } else if (currentStep === 'WAITING_FOR_WALLET_ADDRESS') {
        // Validate TRON address
        if (isValidTronAddress(userMessage)) {
          // Store address and move to WAITING_FOR_AGENT_CONFIRMATION server-side (no client Firestore writes)
          await tx_setWithdrawalAddressCandidate(txId, userMessage.trim(), 'WAITING_FOR_AGENT_CONFIRMATION')
          
          // Send Samba confirmation message
          const updatedTx = { ...transaction, chatStep: 'WAITING_FOR_AGENT_CONFIRMATION' as ChatStep, withdrawalAddressCandidate: userMessage.trim() }
          await sendSambaMessage('WAITING_FOR_AGENT_CONFIRMATION', updatedTx)
        } else {
          // Invalid address - send helper response
          const helperResponse = getSambaHelperResponse(userMessage, currentStep)
          if (helperResponse) {
            await tx_appendSambaMessage(txId, helperResponse)
          }
        }
      }
    } catch (error) {
      console.error('[DepositChat] Error sending message:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  // Normalize messages for rendering
  const normalizedMessages = messages.map(normalizeTransactionMessage)

  return (
    <ActionSheet open={open} onClose={onClose} title="">
      <div className={chatStyles.container}>
        <ChatHeader
          avatarSrc="/assets/Brics-girl-blue.png"
          avatarSize={38}
          name="Ama — Investment Manager"
          showBackButton={false}
        />
        <div ref={messageAreaRef} className={chatStyles.messageArea}>
          {normalizedMessages.map((message) => (
            <ChatMessageBubble
              key={message.id}
              message={message}
              avatarSrc="/assets/Brics-girl-blue.png"
              avatarSize={31}
              theme="ama"
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
        <ChatInputBar
          value={inputText}
          onChange={setInputText}
          onSend={handleSend}
          placeholder="Type a message..."
          disabled={isProcessing}
        />
      </div>
    </ActionSheet>
  )
}

'use client'

import React, { useEffect, useRef, useState } from 'react'
import { getFirestoreDb } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, doc, addDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseAuth } from '@/lib/firebase'
import type { TransactionMessage, ChatStep, BankDepositTransaction, SenderType } from '@/types/transactions'
import { getSambaMessage, getSambaHelperResponse, isValidTronAddress } from '@/lib/depositChat/sambaMessages'
import { tx_userMarkDepositSent, tx_appendUserMessage, tx_appendSambaMessage, tx_appendEmaMessage, tx_setWithdrawalAddressCandidate } from '@/lib/transactions/clientFunctions'
import { useUserProfileStore } from '@/store/userProfile'
import { useNotificationStore } from '@/store/notifications'
import ActionSheet from './ActionSheet'
import ChatHeader from './Inbox/ChatHeader'
import ChatMessageBubble from './Inbox/ChatMessageBubble'
import ChatInputBar from './Inbox/ChatInputBar'
import TypingBubble from './Inbox/TypingBubble'
import Image from 'next/image'
import chatStyles from './Inbox/FinancialInboxChatSheet.module.css'

type DepositChatSheetProps = {
  open: boolean
  onClose: () => void
  txId: string | null
  error?: string | null
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

export default function DepositChatSheet({ open, onClose, txId, error }: DepositChatSheetProps) {
  const [messages, setMessages] = useState<TransactionMessage[]>([])
  const [transaction, setTransaction] = useState<BankDepositTransaction | null>(null)
  const [inputText, setInputText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [txCreationError, setTxCreationError] = useState<string | null>(error || null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageAreaRef = useRef<HTMLDivElement>(null)
  const { profile } = useUserProfileStore()
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const auth = getFirebaseAuth()
  const sambaMessageSentRef = useRef<Set<ChatStep>>(new Set())
  const depositConfirmedNotifiedRef = useRef(false)

  // Update error state when prop changes
  useEffect(() => {
    setTxCreationError(error || null)
  }, [error])

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
      
      // Reset isProcessing when "SENT" message appears (action was processed)
      if (msgs.some(m => m.senderType === 'USER' && m.text === 'SENT')) {
        setIsProcessing(false)
      }
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

  // Note: Intro message is now sent server-side in createBankDepositRequest
  // No client-side intro message logic needed

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messageAreaRef.current && messagesEndRef.current) {
      // Use scrollIntoView on the messagesEndRef within the scrollable container
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const sendSambaMessage = async (chatStep: ChatStep, tx: BankDepositTransaction) => {
    if (!txId) return // Early return if txId is null
    
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
    // Skip INTRO_CONFIRM_INTENT - server already creates this message in createBankDepositRequest
    // This prevents duplicate intro messages (one with button from server, one without from client)
    if (newStep === 'INTRO_CONFIRM_INTENT') {
      console.log('[DepositChat] Skipping client-side INTRO_CONFIRM_INTENT message - server already created it')
      return
    }
    
    // Send appropriate Samba message for the new step (if not already sent)
    if (!sambaMessageSentRef.current.has(newStep)) {
      await sendSambaMessage(newStep, tx)
      sambaMessageSentRef.current.add(newStep)
    }
  }

  const handleSend = async () => {
    if (!inputText.trim() || isProcessing) return

    // Guard: require txId before sending
    if (!txId) return

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

      // Process based on current chatStep
      if (!transaction) return

      // Add user message
      await tx_appendUserMessage(txId, userMessage)
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

  // Normalize messages for rendering (filter out SYSTEM messages - internal only)
  const normalizedMessages = messages
    .filter(m => m.senderType !== 'SYSTEM')
    .map(normalizeTransactionMessage)

  // Debug logging to identify duplicate intro messages
  if (transaction?.chatStep === 'INTRO_CONFIRM_INTENT' && normalizedMessages.length > 0) {
    const debugMessages = normalizedMessages.map((msg, idx) => {
      const rawMsg = messages.find(m => m.id === msg.id)
      const isIntroMessage = transaction?.chatStep === 'INTRO_CONFIRM_INTENT' && 
                            msg.from === 'ai' && 
                            idx === 0 &&
                            msg.text.includes("I'm")
      
      return {
        index: idx,
        messageId: msg.id,
        role: msg.from, // 'ai' or 'user'
        senderType: rawMsg?.senderType || 'UNKNOWN', // SYSTEM/ASSISTANT/USER/SAMBA/etc.
        isIntroMessage,
        hasButtons: isIntroMessage, // buttons prop will be attached if isIntroMessage is true
        textPreview: msg.text.substring(0, 60),
        fullTextLength: msg.text.length,
        source: rawMsg?.metadata?.chatStep === 'INTRO_CONFIRM_INTENT' 
          ? 'SERVER (createBankDepositRequest with metadata)' 
          : rawMsg?.senderType === 'SAMBA' 
            ? 'CLIENT (handleChatStepChange → sendSambaMessage)' 
            : 'UNKNOWN',
        metadata: rawMsg?.metadata || null,
        createdAt: rawMsg?.createdAt?.toDate?.()?.toISOString() || rawMsg?.createdAt || 'N/A',
      }
    })
    
    console.log('[DepositChat] Debug: All messages in INTRO_CONFIRM_INTENT step:', {
      totalMessages: normalizedMessages.length,
      chatStep: transaction?.chatStep,
      messages: debugMessages,
      summary: {
        messagesWithButton: debugMessages.filter(m => m.hasButtons).length,
        serverMessages: debugMessages.filter(m => m.source.includes('SERVER')).length,
        clientMessages: debugMessages.filter(m => m.source.includes('CLIENT')).length,
      },
    })
  }

  // Typing indicator logic (with mandatory fix)
  const hasAiMessage = messages.some(m => m.senderType === 'SAMBA' || m.senderType === 'SYSTEM')
  const showTypingIndicator =
    txId === null ||
    (txId !== null && messages.length === 0) ||
    (transaction?.chatStep === 'INTRO_CONFIRM_INTENT' && !hasAiMessage)

  // Show error if transaction creation failed
  const showError = txCreationError !== null

  return (
    <ActionSheet open={open} onClose={onClose} title="" className="inboxTallSheet">
      <div className={chatStyles.container}>
        <ChatHeader
          avatarSrc="/assets/Brics-girl-blue.png"
          avatarSize={38}
          name="Ema — Investment Manager"
          showBackButton={false}
        />
        <div ref={messageAreaRef} className={chatStyles.messageArea}>
          {normalizedMessages.map((message, index) => {
            // Add CTA button to intro message when in INTRO_CONFIRM_INTENT step
            const isIntroMessage = transaction?.chatStep === 'INTRO_CONFIRM_INTENT' && 
                                   message.from === 'ai' && 
                                   index === 0 &&
                                   message.text.includes("I'm")
            
            const handleCTAClick = async () => {
              if (!txId || isProcessing) return
              
              const user = auth.currentUser
              if (!user) {
                console.error('[DepositChat] No authenticated user for CTA')
                return
              }
              
              setIsProcessing(true)
              try {
                // Write Firestore action instead of calling Cloud Function (bypasses CORS)
                const db = getFirestoreDb()
                const actionsRef = collection(db, 'transactions', txId, 'actions')
                
                console.log('[CTA] Creating MARK_DEPOSIT_SENT action', { txId })
                await addDoc(actionsRef, {
                  type: 'MARK_DEPOSIT_SENT',
                  createdAt: serverTimestamp(),
                  createdBy: user.uid,
                  status: 'PENDING',
                })
                console.log('[CTA] Action created successfully', { txId })
                // Server trigger will process this and append messages/update status
                // UI will update via Firestore listeners when messages appear
              } catch (error) {
                console.error('[DepositChat] Error creating action:', error)
                // Keep isProcessing false so user can retry
                setIsProcessing(false)
              }
              // Note: Don't set isProcessing(false) here - let it stay true until messages appear
              // The UI will show "Processing..." until server messages arrive
            }

            return (
              <ChatMessageBubble
                key={message.id}
                message={{
                  ...message,
                  buttons: isIntroMessage ? [{
                    label: "I've deposited",
                    onClick: handleCTAClick,
                    variant: 'primary' as const
                  }] : undefined
                }}
                avatarSrc="/assets/Brics-girl-blue.png"
                avatarSize={31}
                theme="ama"
              />
            )
          })}
          
          {/* Typing indicator */}
          {showTypingIndicator && !showError && (
            <div className={chatStyles.messageWrapper}>
              <div className={chatStyles.messageAvatar}>
                <Image
                  src="/assets/Brics-girl-blue.png"
                  alt="Ema"
                  width={31}
                  height={31}
                  className={chatStyles.messageAvatarImage}
                  sizes="31px"
                  quality={92}
                />
              </div>
              <div className={chatStyles.bubbleContainer}>
                <TypingBubble />
              </div>
            </div>
          )}
          
          {/* Error message */}
          {showError && (
            <div className={chatStyles.messageWrapper}>
              <div className={chatStyles.messageAvatar}>
                <Image
                  src="/assets/Brics-girl-blue.png"
                  alt="Ema"
                  width={31}
                  height={31}
                  className={chatStyles.messageAvatarImage}
                  sizes="31px"
                  quality={92}
                />
              </div>
              <div className={chatStyles.bubbleContainer}>
                <div className={chatStyles.messageBubble}>
                  Something went wrong. Try again.
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        <ChatInputBar
          value={inputText}
          onChange={setInputText}
          onSend={handleSend}
          placeholder="Add a message"
          disabled={isProcessing}
        />
      </div>
    </ActionSheet>
  )
}

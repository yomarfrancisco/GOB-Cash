/**
 * Firestore helpers for transaction threads
 * Handles real-time subscriptions to transactions and messages
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type Unsubscribe,
  type Timestamp,
} from 'firebase/firestore'
import { getFirestoreDb } from '@/lib/firebase'
import type { Transaction } from './types'
import type { Thread, ChatMessage } from '@/state/financialInbox'

/**
 * Format Firestore timestamp to display string
 */
function formatTimestamp(timestamp: Timestamp | null | undefined): string {
  if (!timestamp) return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  
  const date = timestamp.toDate()
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Convert Firestore Transaction document to Thread
 */
function transactionToThread(tx: Transaction, txId: string): Thread {
  // Determine title based on type and status
  const getTitle = () => {
    if (tx.type === 'BANK_DEPOSIT_TO_USDT_TRON') {
      return `Deposit Request — R${tx.amountZar?.toFixed(2) || '0.00'}`
    }
    return `Transaction ${txId.slice(0, 8)}`
  }

  // Determine subtitle from status
  const getSubtitle = () => {
    const statusMap: Record<string, string> = {
      AWAITING_DEPOSIT: 'Waiting for deposit...',
      DEPOSIT_SENT: 'Deposit sent, awaiting confirmation',
      DEPOSIT_RECEIVED: 'Deposit received',
      LOCKED: 'Funds locked for settlement',
      READY_FOR_WITHDRAWAL: 'Ready for withdrawal',
      WITHDRAWAL_REQUESTED: 'Withdrawal requested',
      WITHDRAWAL_CONFIRMED: 'Withdrawal confirmed',
      WITHDRAWAL_SENT: 'Withdrawal sent',
      COMPLETED: 'Transaction completed',
      DISPUTED: 'Transaction disputed',
      CANCELLED: 'Transaction cancelled',
    }
    return statusMap[tx.status] || tx.status
  }

  // Use system avatar for transactions (or could use receiver avatar)
  const avatarUrl = '/assets/Brics-girl-blue.png'

  return {
    id: txId,
    title: getTitle(),
    subtitle: getSubtitle(),
    avatarUrl,
    unreadCount: 0, // Will be computed from messages
    lastMessageAt: formatTimestamp(tx.statusUpdatedAt || tx.createdAt),
    kind: 'transaction',
    metadata: {
      txStatus: tx.status,
      txType: tx.type,
      userId: tx.userId,
      receiverId: tx.receiverId,
    },
  }
}

/**
 * Convert Firestore message document to ChatMessage
 */
function messageToChatMessage(docId: string, txId: string, data: any): ChatMessage {
  const senderType = data.senderType || 'SYSTEM'
  const from = senderType === 'USER' ? 'user' : 'ai'
  
  return {
    id: docId,
    threadId: txId,
    from,
    text: data.text || '',
    createdAt: formatTimestamp(data.createdAt),
    metadata: data.metadata || {},
    status: data.metadata?.status || undefined,
  }
}

/**
 * Subscribe to transaction threads for a user
 * Returns unsubscribe function
 */
export function subscribeTransactionThreads(
  uid: string,
  onUpdate: (threads: Thread[]) => void
): Unsubscribe {
  const db = getFirestoreDb()
  const transactionsRef = collection(db, 'transactions')
  
  const q = query(
    transactionsRef,
    where('participants', 'array-contains', uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  )

  return onSnapshot(
    q,
    (snapshot) => {
      const threads: Thread[] = []
      
      snapshot.forEach((doc) => {
        try {
          const txData = { id: doc.id, ...doc.data() } as Transaction
          const thread = transactionToThread(txData, doc.id)
          threads.push(thread)
        } catch (error) {
          console.error('[Transaction] Error converting transaction to thread:', error, doc.id)
        }
      })

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Transaction] Loaded transaction threads:', threads.length)
      }

      onUpdate(threads)
    },
    (error) => {
      console.error('[Transaction] Error subscribing to transaction threads:', error)
      onUpdate([]) // Return empty array on error
    }
  )
}

/**
 * Subscribe to messages for a specific transaction thread
 * Returns unsubscribe function
 */
export function subscribeTransactionMessages(
  txId: string,
  onUpdate: (messages: ChatMessage[]) => void
): Unsubscribe {
  const db = getFirestoreDb()
  const messagesRef = collection(db, 'transactions', txId, 'messages')
  
  const q = query(messagesRef, orderBy('createdAt', 'asc'))

  return onSnapshot(
    q,
    (snapshot) => {
      const messages: ChatMessage[] = []
      
      snapshot.forEach((doc) => {
        try {
          const message = messageToChatMessage(doc.id, txId, doc.data())
          messages.push(message)
        } catch (error) {
          console.error('[Transaction] Error converting message:', error, doc.id)
        }
      })

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Transaction] Loaded ${messages.length} messages for tx ${txId}`)
      }

      onUpdate(messages)
    },
    (error) => {
      console.error('[Transaction] Error subscribing to transaction messages:', error)
      onUpdate([]) // Return empty array on error
    }
  )
}


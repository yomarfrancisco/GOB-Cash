'use client'

import { useEffect } from 'react'
import ReactDOM from 'react-dom'
import Image from 'next/image'
import '@/styles/notifications.css'

type ConvertNotificationState = {
  type: 'request_sent' | 'request_accepted'
  amount: number
  handle: string
  agentHandle?: string
} | null

type ConvertNotificationBannerProps = {
  notification: ConvertNotificationState
  onDismiss: () => void
}

export default function ConvertNotificationBanner({ notification, onDismiss }: ConvertNotificationBannerProps) {
  useEffect(() => {
    if (notification) {
      // Auto-dismiss after 2 seconds
      const timer = setTimeout(() => {
        onDismiss()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [notification, onDismiss])

  if (!notification) return null

  const formatAmount = (amount: number) => {
    return `R${amount.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const title = notification.type === 'request_sent' 
    ? 'Cash conversion request sent'
    : 'Cash deposit request accepted'

  const body = notification.type === 'request_sent'
    ? `${notification.handle} has requested to convert ${formatAmount(notification.amount)} in cash to crypto.`
    : `${notification.agentHandle} has accepted your request and is coming to meet you to convert cash to crypto.`

  // Render via portal to ensure it's always on top
  if (typeof window === 'undefined') return null

  return ReactDOM.createPortal(
    <div className="notifications-container" style={{ zIndex: 10002 }} role="status" aria-live="polite">
      <div className="notification-item">
        <div className="notification-avatar">
          <Image
            src="/assets/Brics-girl-blue.png"
            alt="System"
            width={38}
            height={38}
            className="notification-avatar-img"
            unoptimized
          />
        </div>
        <div className="notification-content">
          <div className="notification-head">
            <div className="notification-title">{title}</div>
            <div className="notification-meta">
              <div className="notification-timestamp">Now</div>
            </div>
          </div>
          <div className="notif__detail">{body}</div>
        </div>
      </div>
    </div>,
    document.body
  )
}


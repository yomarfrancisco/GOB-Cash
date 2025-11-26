'use client'

import Image from 'next/image'
import Link from 'next/link'
import clsx from 'clsx'
import { useAiFabHighlightStore } from '@/state/aiFabHighlight'
import { useAuthStore } from '@/store/auth'
import { useFinancialInboxStore } from '@/state/financialInbox'
import '@/styles/bottom-glass.css'

interface BottomGlassBarProps {
  currentPath?: string
  onDollarClick?: () => void // NOTE: Dollar FAB now opens the amount sheet directly. The old "Cash agents around you" sheet is now accessible from Settings → Inbox.
  onRequestAgent?: () => void // Deprecated: no longer used, kept for backward compatibility
}

export default function BottomGlassBar({ currentPath = '/', onDollarClick }: BottomGlassBarProps) {
  const isHome = currentPath === '/'
  const isProfile = currentPath === '/profile' || currentPath === '/transactions' || currentPath === '/activity'
  const { isAuthed, requireAuth } = useAuthStore()
  const isHighlighted = useAiFabHighlightStore((state) => state.isHighlighted)
  const { openInbox, hasUnreadNotification } = useFinancialInboxStore()
  
  const handleCenterButtonClick = () => {
    // NOTE: Dollar FAB now opens the amount sheet directly (via onDollarClick callback)
    // The old "Cash agents around you" sheet is now accessible from Settings → Inbox
    if (onDollarClick) {
      onDollarClick()
    }
  }

  return (
    <div className="bottom-menu">
      <div className="bottom-menu-container">
        <div className="bottom-glass-wrapper">
          <Image
            src="/assets/core/glass-bottom-1.png"
            alt=""
            className="bottom-glass-texture"
            width={700}
            height={600}
            unoptimized
          />
        </div>
        <div className="nav-container">
          <div className="nav-item">
            <Link href="/" aria-label="Home">
              <Image 
                src="/assets/nav/home.svg" 
                alt="Home" 
                className={`nav-icon ${isHome ? 'nav-icon-active' : 'nav-icon-dim'}`} 
                width={28} 
                height={28} 
              />
            </Link>
          </div>
          <div className="dollar-sign-container">
            <button
              className={clsx('dollar-sign-contained', 'fab-dollar', {
                'is-manual': isAuthed,
                'is-autonomous': !isAuthed,
                'fab-highlighted': isHighlighted,
              })}
              aria-label="Open Agents"
              onClick={handleCenterButtonClick}
              onTouchStart={handleCenterButtonClick}
              type="button"
            >
              {/* Always show layered structure: dollar sign base + avatar overlay */}
              {/* Rest state is always $ icon; avatar only appears during highlights (slides up) */}
              <div className="fab-content-base">
                <Image 
                  src="/assets/core/dollar-sign.png" 
                  alt="Direct Payment" 
                  width={60} 
                  height={60} 
                  className="fab-dollar-icon"
                  unoptimized 
                />
              </div>
              <div className={clsx('fab-content-overlay', {
                'fab-content-overlay--visible': isHighlighted,
              })}>
                <div className="fab-avatar-container">
                  <Image 
                    src="/assets/Brics-girl-blue.png" 
                    alt="AI Manager" 
                    width={72} 
                    height={72} 
                    className="fab-avatar-image"
                    unoptimized 
                  />
                </div>
              </div>
            </button>
            <div className="nav-label">Pay / Request</div>
          </div>
          {/* Notification bell icon - opens inbox */}
          <div className="nav-item">
            <button
              onClick={() => {
                if (isAuthed) {
                  openInbox()
                } else {
                  requireAuth(() => {
                    openInbox()
                  })
                }
              }}
              aria-label="Notifications"
              type="button"
              style={{ position: 'relative', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
            >
              <svg
                className="nav-icon"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M13.73 21a2 2 0 0 1-3.46 0"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {/* Red notification dot */}
              {hasUnreadNotification && (
                <span className="nav-notification-dot" aria-label="Unread messages" />
              )}
            </button>
          </div>
          {/* NOTE: FinancialInboxSheet is now only rendered from Profile → Settings → Inbox */}
          <div className="nav-item">
            <Link 
              href="/profile" 
              aria-label="Profile"
              onClick={(e) => {
                if (!isAuthed) {
                  e.preventDefault()
                  requireAuth(() => {
                    // After auth, user can click again to navigate
                  })
                }
              }}
            >
              <Image 
                src="/assets/nav/user-outlined.svg" 
                alt="Profile" 
                className={`nav-icon ${isProfile ? 'nav-icon-active' : 'nav-icon-dim'}`} 
                width={28} 
                height={28} 
              />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}


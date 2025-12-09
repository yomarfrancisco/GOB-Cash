'use client'

import Image from 'next/image'
import Link from 'next/link'
import clsx from 'clsx'
import { useAiFabHighlightStore } from '@/state/aiFabHighlight'
import { useAuthStore } from '@/store/auth'
import { useFinancialInboxStore } from '@/state/financialInbox'
import { useSearchSheet } from '@/store/useSearchSheet'
import { useUserProfileStore } from '@/store/userProfile'
import { CHARACTERS } from '@/lib/demo/templates/characters'
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
  // Select values separately to prevent infinite re-renders from object creation in selector
  const isHighlighted = useAiFabHighlightStore((state) => state.isHighlighted)
  const lastAvatar = useAiFabHighlightStore((state) => state.lastAvatar)
  const { hasUnreadNotification } = useFinancialInboxStore()
  const { open: openSearch, isOpen: isSearchOpen } = useSearchSheet()
  const { profile } = useUserProfileStore()
  
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
            src="/assets/core/glass-bottom-2.png"
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
                src={isHome ? "/assets/nav/home.svg" : "/assets/nav/home_outlined.svg"}
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
                  src="/assets/core/dollar-sign2.png" 
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
                    src={lastAvatar || CHARACTERS.ama.avatar} 
                    alt="FAB avatar" 
                    width={72} 
                    height={72} 
                    className="fab-avatar-image"
                    unoptimized 
                  />
                </div>
              </div>
            </button>
            <div className="nav-label">Pay</div>
          </div>
          {/* NOTE: FinancialInboxSheet is now only rendered from Profile → Settings → Inbox */}
          <div className="nav-item" style={{ position: 'relative' }}>
            <Link 
              href="/profile" 
              aria-label="Profile"
              onClick={(e) => {
                if (!isAuthed) {
                  e.preventDefault()
                  requireAuth(() => {
                    // After auth, user can click again to navigate
                  })
                } else {
                  // Clear notification when profile/inbox is opened
                  const store = useFinancialInboxStore.getState()
                  if (hasUnreadNotification) {
                    store.setHasUnreadNotification(false)
                  }
                }
              }}
            >
              {/* Dynamic avatar: Google avatar or fallback with initial */}
              {isAuthed && profile.avatarUrl ? (
                <div className="nav-avatar-container">
                  <Image 
                    src={profile.avatarUrl}
                    alt="User avatar"
                    fill
                    className="nav-avatar-image"
                    sizes="36px"
                  />
                </div>
              ) : isAuthed && !profile.avatarUrl ? (
                <div className="nav-avatar-container nav-avatar-fallback">
                  <Image 
                    src="/assets/avatar-profile.png"
                    alt="Default avatar"
                    fill
                    className="nav-avatar-image nav-avatar-fallback-image"
                    sizes="36px"
                  />
                  {profile.fullName && (
                    <span className="nav-avatar-initial">
                      {profile.fullName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              ) : (
                <Image 
                  src={isProfile ? "/assets/nav/user_filled.svg" : "/assets/nav/user-outlined.svg"}
                  alt="Profile" 
                  className={`nav-icon ${isProfile ? 'nav-icon-active' : 'nav-icon-dim'}`} 
                  width={28} 
                  height={28} 
                />
              )}
              {/* Red notification dot */}
              {hasUnreadNotification && (
                <span className="nav-notification-dot" aria-label="Unread messages" />
              )}
            </Link>
          </div>
          {/* Search icon - far right (icon only, no label) */}
          <div className="nav-item">
            <button
              onClick={openSearch}
              aria-label="Search"
              type="button"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <Image 
                src="/assets/nav/search.svg" 
                alt="Search" 
                className={`nav-icon ${isSearchOpen ? 'nav-icon-search-active' : 'nav-icon-dim'}`} 
                width={28} 
                height={28} 
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


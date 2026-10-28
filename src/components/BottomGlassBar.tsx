'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { useAiFabHighlightStore } from '@/state/aiFabHighlight'
import { useAuthStore } from '@/store/auth'
import { useUserProfileStore } from '@/store/userProfile'
import { selectHasUnseenLiquidityActivity, useActivityUnreadStore } from '@/store/activityUnread'
import { CHARACTERS } from '@/lib/demo/templates/characters'
import { prefetchAuthImages } from '@/lib/prefetchAuthImages'
import { USER_PLACEHOLDER_AVATAR } from '@/lib/avatarAssets'
import { useNotificationsStore } from '@/state/notifications'
import '@/styles/bottom-glass.css'

interface BottomGlassBarProps {
  currentPath?: string
  onDollarClick?: () => void // NOTE: Dollar FAB now opens the amount sheet directly. The old "Cash agents around you" sheet is now accessible from Settings → Inbox.
  onRequestAgent?: () => void // Deprecated: no longer used, kept for backward compatibility
  conversionDestination?: 'ZAR' | 'MZN'
}

export default function BottomGlassBar({ currentPath = '/', onDollarClick }: BottomGlassBarProps) {
  const router = useRouter()
  const isHome = currentPath === '/'
  const { isAuthed, requireAuth } = useAuthStore()
  const isDeskOpen = useNotificationsStore((state) => state.isNotificationsOpen)
  const openNotifications = useNotificationsStore((state) => state.openNotifications)
  // Select values separately to prevent infinite re-renders from object creation in selector
  const isHighlighted = useAiFabHighlightStore((state) => state.isHighlighted)
  const lastAvatar = useAiFabHighlightStore((state) => state.lastAvatar)
  const hasUnseenActivity = useActivityUnreadStore(selectHasUnseenLiquidityActivity)
  const { profile } = useUserProfileStore()
  
  const handleCenterButtonClick = () => {
    // NOTE: Dollar FAB now opens the amount sheet directly (via onDollarClick callback)
    // The old "Cash agents around you" sheet is now accessible from Settings → Inbox
    if (onDollarClick) {
      onDollarClick()
    }
  }

  const handleDeskClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    if (!isAuthed) {
      requireAuth(openNotifications)
      return
    }

    if (!isHome) {
      router.replace('/')
    }
    openNotifications()
  }

  // Render nav items once (shared between mobile and desktop)
  const navItems = (
    <>
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
          aria-label="Sell"
          onClick={handleCenterButtonClick}
          onMouseEnter={() => {
            // Prefetch auth images on hover (if not authed, button may trigger auth)
            if (!isAuthed) {
              prefetchAuthImages()
            }
          }}
          onTouchStart={() => {
            // Prefetch auth images on touch (mobile)
            if (!isAuthed) {
              prefetchAuthImages()
            }
          }}
          type="button"
        >
          <div className="fab-content-base">
            <Image 
              src="/assets/core/dollar-sign2.png" 
              alt="Direct Payment" 
              width={60} 
              height={60} 
              className="fab-dollar-icon"
              sizes="60px"
              quality={92}
              priority
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
        <div className="nav-label" aria-hidden="true" />
      </div>
      <div className="nav-item" style={{ position: 'relative' }}>
        <Link
          href="/"
          aria-label="Open FX desk"
          onMouseEnter={() => {
            // Prefetch auth images on hover (if not authed, link will trigger auth)
            if (!isAuthed) {
              prefetchAuthImages()
            }
          }}
          onTouchStart={() => {
            // Prefetch auth images on touch (mobile)
            if (!isAuthed) {
              prefetchAuthImages()
            }
          }}
          onClick={handleDeskClick}
        >
          {isAuthed && profile.avatarUrl ? (
            <div className="nav-avatar-container nav-avatar--real">
              <div className="nav-avatar-image-wrapper">
                <Image 
                  src={profile.avatarUrl}
                  alt="User avatar"
                  fill
                  className="nav-avatar-image"
                  sizes="28px"
                />
              </div>
              {hasUnseenActivity && (
                <span className="nav-notification-dot" aria-label="New liquidity manager activity" />
              )}
            </div>
          ) : isAuthed && !profile.avatarUrl ? (
            <div className="nav-avatar-container nav-avatar-fallback">
              <div className="nav-avatar-image-wrapper">
                <Image 
                  src={USER_PLACEHOLDER_AVATAR}
                  alt="Default avatar"
                  fill
                  className="nav-avatar-image nav-avatar-fallback-image"
                  sizes="28px"
                />
                <span className="nav-avatar-initial">
                  {(() => {
                    if (profile.fullName) {
                      return profile.fullName.charAt(0).toUpperCase()
                    }
                    if (profile.userHandle && profile.userHandle.startsWith('@')) {
                      const handleClean = profile.userHandle.substring(1)
                      if (handleClean.toLowerCase().startsWith('goblin')) {
                        return 'G'
                      } else if (handleClean.length > 0) {
                        return handleClean.charAt(0).toUpperCase()
                      }
                    }
                    return '?'
                  })()}
                </span>
              </div>
              {hasUnseenActivity && (
                <span className="nav-notification-dot" aria-label="New liquidity manager activity" />
              )}
            </div>
          ) : (
            <>
              <Image
                src={isDeskOpen ? "/assets/nav/user_filled.svg" : "/assets/nav/user-outlined.svg"}
                alt="FX desk"
                className={`nav-icon ${isDeskOpen ? 'nav-icon-active' : 'nav-icon-dim'}`}
                width={28}
                height={28}
              />
            </>
          )}
        </Link>
      </div>
    </>
  )

  return (
    <div className="bottom-menu">
      {/* Mobile: unified wrapper for consistent positioning */}
      <div className="bottomBarFrame">
        <div className="bottom-glass-wrapper bottom-glass-wrapper-mobile">
          <div className="bottom-glass-offset">
            <Image
              src="/assets/core/glass-bottom-2.png"
              alt=""
              className="bottom-glass-texture"
              width={700}
              height={600}
              unoptimized
            />
          </div>
        </div>
        <div className="nav-container nav-container-mobile">
          {navItems}
        </div>
      </div>
      {/* Desktop: keep existing structure unchanged */}
      <div className="bottom-menu-container bottom-menu-container-desktop">
        <div className="bottom-glass-wrapper bottom-glass-wrapper-desktop">
          <Image
            src="/assets/core/glass-bottom-2.png"
            alt=""
            className="bottom-glass-texture"
            width={700}
            height={600}
            unoptimized
          />
        </div>
        <div className="nav-container nav-container-desktop">
          {navItems}
        </div>
      </div>
    </div>
  )
}

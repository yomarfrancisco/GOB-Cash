'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import clsx from 'clsx'
import { useAiFabHighlightStore } from '@/state/aiFabHighlight'
import { useAuthStore } from '@/store/auth'
import { selectHasUnseenLiquidityActivity, useActivityUnreadStore } from '@/store/activityUnread'
import { CHARACTERS } from '@/lib/demo/templates/characters'
import { prefetchAuthImages } from '@/lib/prefetchAuthImages'
import { useNotificationsStore } from '@/state/notifications'
import { useUserProfileStore } from '@/store/userProfile'
import { USER_PLACEHOLDER_AVATAR } from '@/lib/avatarAssets'
import { logout } from '@/lib/logout'
import '@/styles/bottom-glass.css'

const DESK_DOUBLE_TAP_MS = 350

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
  const openNotifications = useNotificationsStore((state) => state.openNotifications)
  const closeNotifications = useNotificationsStore((state) => state.closeNotifications)
  // Select values separately to prevent infinite re-renders from object creation in selector
  const isHighlighted = useAiFabHighlightStore((state) => state.isHighlighted)
  const lastAvatar = useAiFabHighlightStore((state) => state.lastAvatar)
  const hasUnseenActivity = useActivityUnreadStore(selectHasUnseenLiquidityActivity)
  const profileAvatarUrl = useUserProfileStore((s) => s.profile.avatarUrl)
  const deskUserAvatar = profileAvatarUrl || USER_PLACEHOLDER_AVATAR
  const lastDeskTapAtRef = useRef(0)
  const deskOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
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

    const now = Date.now()
    const gap = now - lastDeskTapAtRef.current
    lastDeskTapAtRef.current = now

    // Double-tap routing desk → sign out (hidden logout affordance).
    if (gap > 0 && gap <= DESK_DOUBLE_TAP_MS) {
      if (deskOpenTimerRef.current) {
        clearTimeout(deskOpenTimerRef.current)
        deskOpenTimerRef.current = null
      }
      lastDeskTapAtRef.current = 0
      closeNotifications()
      void logout()
      return
    }

    // Defer single-tap open so a second tap can cancel into logout.
    if (deskOpenTimerRef.current) clearTimeout(deskOpenTimerRef.current)
    deskOpenTimerRef.current = setTimeout(() => {
      deskOpenTimerRef.current = null
      if (!isHome) {
        router.replace('/')
      }
      openNotifications()
    }, DESK_DOUBLE_TAP_MS)
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
          <div className="nav-avatar-container nav-avatar--real nav-avatar--desk">
            <div className="nav-avatar-image-wrapper">
              <Image
                src="/assets/benjamin_grey_square.png"
                alt="FX desk"
                fill
                className="nav-avatar-image"
                sizes="28px"
              />
            </div>
            {/* User face over the desk mark — you at the desk. */}
            {isAuthed ? (
              <span className="nav-desk-user-badge" aria-hidden>
                <Image
                  src={deskUserAvatar}
                  alt=""
                  width={16}
                  height={16}
                  className="nav-desk-user-badge__img"
                  sizes="16px"
                  unoptimized={deskUserAvatar.startsWith('data:') || deskUserAvatar.includes('firebasestorage')}
                />
              </span>
            ) : null}
          </div>
          {hasUnseenActivity && (
            <span className="nav-notification-dot" aria-label="New liquidity manager activity" />
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

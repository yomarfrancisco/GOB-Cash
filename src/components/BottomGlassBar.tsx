'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import clsx from 'clsx'
import { useAiFabHighlightStore } from '@/state/aiFabHighlight'
import { useAuthStore } from '@/store/auth'
import { selectHasUnseenLiquidityActivity, useActivityUnreadStore } from '@/store/activityUnread'
import { CHARACTERS } from '@/lib/demo/templates/characters'
import { prefetchAuthImages } from '@/lib/prefetchAuthImages'
import { useNotificationsStore } from '@/state/notifications'
import { logout } from '@/lib/logout'
import '@/styles/bottom-glass.css'

const DESK_DOUBLE_TAP_MS = 350

interface BottomGlassBarProps {
  currentPath?: string
  /** Optional override. Default: open the routing desk. */
  onDollarClick?: () => void
  onRequestAgent?: () => void // Deprecated: no longer used, kept for backward compatibility
  conversionDestination?: 'ZAR' | 'MZN'
}

export default function BottomGlassBar({ currentPath = '/', onDollarClick }: BottomGlassBarProps) {
  const router = useRouter()
  const isHome = currentPath === '/'
  const { isAuthed, requireAuth } = useAuthStore()
  const openNotifications = useNotificationsStore((state) => state.openNotifications)
  const closeNotifications = useNotificationsStore((state) => state.closeNotifications)
  const isHighlighted = useAiFabHighlightStore((state) => state.isHighlighted)
  const lastAvatar = useAiFabHighlightStore((state) => state.lastAvatar)
  const hasUnseenActivity = useActivityUnreadStore(selectHasUnseenLiquidityActivity)
  const lastDeskTapAtRef = useRef(0)
  const deskOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openRoutingDesk = () => {
    if (!isHome) {
      router.replace('/')
    }
    openNotifications()
  }

  const handleCenterButtonClick = () => {
    if (onDollarClick) {
      onDollarClick()
      return
    }

    // Auth only — never auto-open the desk after signup/sign-in.
    // Desk opens only from an intentional $ tap while already signed in.
    if (!isAuthed) {
      requireAuth(() => {})
      return
    }

    const now = Date.now()
    const gap = now - lastDeskTapAtRef.current
    lastDeskTapAtRef.current = now

    // Double-tap $ → sign out (same hidden affordance as the old desk icon).
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

    if (deskOpenTimerRef.current) clearTimeout(deskOpenTimerRef.current)
    deskOpenTimerRef.current = setTimeout(() => {
      deskOpenTimerRef.current = null
      openRoutingDesk()
    }, DESK_DOUBLE_TAP_MS)
  }

  const fab = (
    <div className="dollar-sign-container" style={{ position: 'relative' }}>
      <button
        className={clsx('dollar-sign-contained', 'fab-dollar', {
          'is-manual': isAuthed,
          'is-autonomous': !isAuthed,
          'fab-highlighted': isHighlighted,
        })}
        aria-label="Open FX desk"
        onClick={handleCenterButtonClick}
        onMouseEnter={() => {
          if (!isAuthed) prefetchAuthImages()
        }}
        onTouchStart={() => {
          if (!isAuthed) prefetchAuthImages()
        }}
        type="button"
      >
        <div className="fab-content-base">
          <Image
            src="/assets/core/dollar-sign2.png"
            alt="FX desk"
            width={60}
            height={60}
            className="fab-dollar-icon"
            sizes="60px"
            quality={92}
            priority
          />
        </div>
        <div
          className={clsx('fab-content-overlay', {
            'fab-content-overlay--visible': isHighlighted,
          })}
        >
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
      {hasUnseenActivity ? (
        <span className="nav-notification-dot fab-notification-dot" aria-label="New liquidity manager activity" />
      ) : null}
      <div className="nav-label" aria-hidden="true" />
    </div>
  )

  return (
    <div className="bottom-menu">
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
        <div className="nav-container nav-container-mobile">{fab}</div>
      </div>
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
        <div className="nav-container nav-container-desktop">{fab}</div>
      </div>
    </div>
  )
}

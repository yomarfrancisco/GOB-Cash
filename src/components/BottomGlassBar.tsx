'use client'

import Image from 'next/image'
import Link from 'next/link'
import clsx from 'clsx'
import { useWalletMode } from '@/state/walletMode'
import { useTransactSheet } from '@/store/useTransactSheet'
import { useAiFabHighlightStore } from '@/state/aiFabHighlight'
import { useFinancialInboxStore } from '@/state/financialInbox'
import FinancialInboxSheet from './Inbox/FinancialInboxSheet'
import '@/styles/bottom-glass.css'

interface BottomGlassBarProps {
  currentPath?: string
  onDollarClick?: () => void // Keep for backward compatibility, but will use store if not provided
}

export default function BottomGlassBar({ currentPath = '/', onDollarClick }: BottomGlassBarProps) {
  const { open } = useTransactSheet()
  const isHome = currentPath === '/'
  const isProfile = currentPath === '/profile' || currentPath === '/transactions' || currentPath === '/activity'
  const { mode } = useWalletMode()
  const isAutonomousMode = mode === 'autonomous'
  const isHighlighted = useAiFabHighlightStore((state) => state.isHighlighted)
  const { isInboxOpen, openInbox, closeInbox } = useFinancialInboxStore()
  
  const handleCenterButtonClick = () => {
    if (isAutonomousMode) {
      if (isInboxOpen) {
        closeInbox()
      } else {
        // Open Financial Inbox sheet
        openInbox()
      }
    } else {
      const handler = onDollarClick ?? (() => open())
      handler()
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
                'is-manual': mode === 'manual',
                'is-autonomous': mode === 'autonomous',
                'fab-highlighted': isHighlighted,
              })}
              aria-label={isAutonomousMode ? 'Open BRICS chat' : `Transact (${mode} mode)`}
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
            <div className="nav-label">{isAutonomousMode ? 'Financial Inbox' : 'Direct payment'}</div>
          </div>
          <FinancialInboxSheet />
          <div className="nav-item">
            <Link href="/profile" aria-label="Profile">
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


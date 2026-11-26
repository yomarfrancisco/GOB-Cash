'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { logout } from '@/lib/logout'
import { useAuthStore } from '@/store/auth'

type TopGlassBarProps = {
  hideLogo?: boolean // Hide logo for third-party profiles
  glassShardSrc?: string // Custom glass shard image path
  hideIcons?: boolean // Kept for third-party profiles that used to overlay their own icons
}

export default function TopGlassBar({
  hideLogo = false,
  glassShardSrc,
}: TopGlassBarProps = {}) {
  const pathname = usePathname()
  const isActivityPage = pathname === '/activity'
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const defaultGlassShard = '/assets/core/glass-top-4.png'
  const glassShard = glassShardSrc || defaultGlassShard

  const handleLogoActivate = () => {
    if (!isAuthed || isActivityPage) return
    setConfirmLogout(true)
  }

  const handleConfirmLogout = () => {
    setConfirmLogout(false)
    void logout()
  }

  return (
    <div className="page-title-gobankless">
      <Image
        src={glassShard}
        alt=""
        className="glass-shard-small"
        width={729}
        height={713}
        priority
        sizes="729px"
        quality={92}
      />
      <Image
        src="/assets/core/spraypaint-2.png"
        alt=""
        className="spraypaint-effect"
        width={300}
        height={120}
        priority
        sizes="300px"
        quality={92}
      />
      {!hideLogo &&
        (isActivityPage ? (
          <Image
            src="/assets/Activity.png"
            alt="Activity"
            className="gobankless-logo activity-logo"
            width={220}
            height={65}
            priority
            sizes="220px"
            quality={92}
            style={{ transform: 'scale(0.7)', transformOrigin: 'left center' }}
          />
        ) : (
          <button
            type="button"
            className="gobankless-logo"
            aria-label={isAuthed ? 'Log out' : 'GoBankless'}
            onClick={handleLogoActivate}
            disabled={!isAuthed}
            style={{
              padding: 0,
              border: 0,
              background: 'transparent',
              cursor: isAuthed ? 'pointer' : 'default',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Image
              src="/assets/core/Distressed_Charcoal_G_Logo.png"
              alt=""
              width={64}
              height={64}
              priority
              sizes="64px"
              quality={92}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </button>
        ))}

      {confirmLogout ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Log out?"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(24, 24, 27, 0.36)',
            padding: 24,
          }}
          onClick={() => setConfirmLogout(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 320,
              borderRadius: 20,
              background: '#fff',
              padding: '22px 20px 16px',
              boxShadow: '0 16px 40px rgba(24, 24, 27, 0.22)',
              fontFamily:
                "var(--font-dm-sans), 'DM Sans', system-ui, -apple-system, sans-serif",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              style={{
                margin: '0 0 16px',
                fontSize: 18,
                fontWeight: 650,
                color: '#18181b',
                textAlign: 'center',
              }}
            >
              Log out?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  border: '1px solid #d4d0c6',
                  background: '#fff',
                  color: '#18181b',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  border: 0,
                  background: '#111',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

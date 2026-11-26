'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
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

  const defaultGlassShard = '/assets/core/glass-top-4.png'
  const glassShard = glassShardSrc || defaultGlassShard

  const handleLogoActivate = () => {
    if (!isAuthed || isActivityPage) return
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
    </div>
  )
}

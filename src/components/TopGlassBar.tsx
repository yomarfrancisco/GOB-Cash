'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useShareProfileSheet } from '@/store/useShareProfileSheet'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useUserProfileStore } from '@/store/userProfile'

type TopGlassBarProps = {
  onScanClick?: () => void
  hideLogo?: boolean // Hide logo for third-party profiles
  glassShardSrc?: string // Custom glass shard image path
  hideIcons?: boolean // Hide icons for third-party profiles (to use separate white icons)
}

export default function TopGlassBar({ onScanClick, hideLogo = false, glassShardSrc, hideIcons = false }: TopGlassBarProps = {}) {
  const pathname = usePathname()
  const isActivityPage = pathname === '/activity'
  const { open } = useShareProfileSheet()
  const { guardAuthed } = useRequireAuth()
  const { profile } = useUserProfileStore()

  const defaultGlassShard = '/assets/core/glass-top-4.png'
  const glassShard = glassShardSrc || defaultGlassShard

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
      {!hideLogo && (
        isActivityPage ? (
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
          <Image
            src="/assets/core/Go_B logo.png"
            alt="GoBankless"
            className="gobankless-logo"
            width={124}
            height={38}
            priority
            sizes="124px"
            quality={92}
          />
        )
      )}
      {!hideIcons && (
        <div className="icons">
          <div className="icon-group">
            <button
              onClick={onScanClick}
              className="icon-button"
              aria-label="Scan QR code"
              type="button"
              style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
            >
              <Image src="/assets/core/scan.svg" alt="Scan" className="icon" width={24} height={24} />
            </button>
            <button
              onClick={() => {
                guardAuthed(() => {
                  open({
                    subject: {
                      handle: profile.userHandle || '@samakoyo',
                      avatarUrl: profile.avatarUrl,
                      fullName: profile.fullName,
                    },
                    mode: 'self',
                  })
                })
              }}
              className="icon-button"
              aria-label="Share profile"
              type="button"
              style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
            >
              <Image src="/assets/core/export.svg" alt="Share" className="icon" width={24} height={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


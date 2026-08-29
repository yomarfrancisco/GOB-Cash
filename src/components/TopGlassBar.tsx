'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'

type TopGlassBarProps = {
  hideLogo?: boolean // Hide logo for third-party profiles
  glassShardSrc?: string // Custom glass shard image path
  hideIcons?: boolean // Kept for third-party profiles that used to overlay their own icons
}

export default function TopGlassBar({ hideLogo = false, glassShardSrc }: TopGlassBarProps = {}) {
  const pathname = usePathname()
  const isActivityPage = pathname === '/activity'

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
            src="/assets/MoZ-logo.png"
            alt="MoZ"
            className="gobankless-logo"
            width={149}
            height={46}
            priority
            sizes="149px"
            quality={92}
          />
        )
      )}
    </div>
  )
}

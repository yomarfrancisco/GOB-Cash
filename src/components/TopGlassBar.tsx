'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useShareProfileSheet } from '@/store/useShareProfileSheet'

type TopGlassBarProps = {
  onScanClick?: () => void
}

export default function TopGlassBar({ onScanClick }: TopGlassBarProps = {}) {
  const pathname = usePathname()
  const isActivityPage = pathname === '/activity'
  const { open } = useShareProfileSheet()

  return (
    <div className="page-title-gobankless">
      <Image
        src="/assets/core/glass-top-1.png"
        alt=""
        className="glass-shard-small"
        width={729}
        height={713}
        priority
        unoptimized
      />
      <Image
        src="/assets/core/spraypaint-2.png"
        alt=""
        className="spraypaint-effect"
        width={300}
        height={120}
        priority
        unoptimized
      />
      {isActivityPage ? (
        <Image
          src="/assets/Activity.png"
          alt="Activity"
          className="gobankless-logo activity-logo"
          width={220}
          height={65}
          priority
          unoptimized
          style={{ transform: 'scale(0.7)', transformOrigin: 'left center' }}
        />
      ) : (
        <Image
          src="/assets/core/gobankless-logo.png"
          alt="GoBankless"
          className="gobankless-logo"
          width={220}
          height={65}
          priority
          unoptimized
        />
      )}
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
            onClick={open}
            className="icon-button"
            aria-label="Share profile"
            type="button"
            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
          >
            <Image src="/assets/core/export.svg" alt="Share" className="icon" width={24} height={24} />
          </button>
        </div>
      </div>
    </div>
  )
}


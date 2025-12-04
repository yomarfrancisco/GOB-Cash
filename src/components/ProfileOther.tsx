'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Bookmark } from 'lucide-react'
import Avatar from '@/components/Avatar'
import styles from './ProfileOther.module.css'

export interface OtherProfileData {
  userHandle: string
  fullName: string
  avatarUrl?: string | null
  email?: string
  instagramUrl?: string
  linkedinUrl?: string
  location?: string
  joinDate?: string
  rating?: number
  ratingCount?: string
  sponsors?: number
  sponsoring?: number
  socialCredit?: number // 0-100 percentage
}

type ProfileOtherProps = {
  profile: OtherProfileData
}

export default function ProfileOther({ profile }: ProfileOtherProps) {
  const router = useRouter()
  const [isBookmarked, setIsBookmarked] = useState(false)

  const handleBack = () => {
    router.back()
  }

  const handleShare = () => {
    // TODO: Implement share functionality
    console.log('Share profile:', profile.userHandle)
    if (typeof window !== 'undefined' && navigator.share) {
      const profileUrl = `https://gobankless.app/profile/${profile.userHandle.replace('@', '')}`
      navigator.share({
        title: `${profile.fullName} on GoBankless`,
        text: `Check out ${profile.userHandle} on GoBankless`,
        url: profileUrl,
      }).catch(() => {
        // User cancelled or error occurred
      })
    }
  }

  const handleSponsor = () => {
    // TODO: Implement sponsor functionality
    console.log('Sponsor:', profile.userHandle)
  }

  const handleMessage = () => {
    // TODO: Open chat with this user/agent
    console.log('Message:', profile.userHandle)
  }

  const handlePayRequest = () => {
    // TODO: Open pay/request sheet targeting this user
    console.log('Pay/Request:', profile.userHandle)
  }

  const handleBookmark = () => {
    setIsBookmarked(!isBookmarked)
    // TODO: Persist bookmark state
    console.log('Bookmark toggled:', !isBookmarked)
  }

  return (
    <div className={styles.profileOther}>
      {/* Backdrop image */}
      <div className={styles.backdropContainer}>
        <img
          src="/assets/benjamin_grey.png"
          alt=""
          className={styles.backdropImage}
        />
        {/* Darker screen gradients */}
        <div className={styles.darkerScreen} />
        <div className={styles.darkerScreen2} />
      </div>

      {/* Glass shard overlay */}
      <div className={styles.glassShardContainer}>
        <Image
          src="/assets/glass shard.png"
          alt=""
          className={styles.glassShard}
          width={729}
          height={713}
          priority
          unoptimized
        />
      </div>

      {/* Top navigation */}
      <div className={styles.topNav}>
        <button
          onClick={handleBack}
          className={styles.navButton}
          aria-label="Back"
          type="button"
        >
          <Image src="/assets/back_ui.svg" alt="Back" width={24} height={24} />
        </button>
        <button
          onClick={handleShare}
          className={styles.navButton}
          aria-label="Share"
          type="button"
        >
          <Image src="/assets/core/export.svg" alt="Share" width={24} height={24} />
        </button>
      </div>

      {/* Profile content */}
      <div className={styles.profileContent}>
        {/* Profile header */}
        <div className={styles.profileHeader}>
          <Avatar
            name={profile.fullName}
            email={profile.email}
            avatarUrl={profile.avatarUrl}
            size={96}
            rounded={24}
            className={styles.avatar}
          />
          <h1 className={styles.handle}>{profile.userHandle}</h1>
          <div className={styles.fullName}>{profile.fullName}</div>

          {/* Meta row */}
          <div className={styles.metaRow}>
            {profile.location && (
              <>
                <div className={styles.metaItem}>
                  <Image src="/assets/profile/location-pin.svg" alt="" width={12} height={12} />
                  <span>{profile.location}</span>
                </div>
                {profile.joinDate && <div className={styles.metaDot} />}
              </>
            )}
            {profile.joinDate && (
              <div className={styles.metaItem}>
                <Image src="/assets/profile/calendar_month.svg" alt="" width={12} height={12} />
                <span>{profile.joinDate}</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats card */}
        <div className={styles.statsCard}>
          <div className={styles.statsRow}>
            {profile.rating !== undefined && (
              <>
                <div className={styles.stat}>
                  <div className={styles.statTop}>
                    <span className={styles.statValue}>{profile.rating.toFixed(1)}</span>
                    <Image src="/assets/profile/star.svg" alt="" width={12} height={12} />
                  </div>
                  {profile.ratingCount && (
                    <div className={styles.statSub}>({profile.ratingCount})</div>
                  )}
                </div>
                <div className={styles.statDivider} />
              </>
            )}
            <div className={styles.stat}>
              <div className={styles.statValue}>
                {profile.sponsors?.toLocaleString() || '0'}
              </div>
              <div className={styles.statSub}>Sponsors</div>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <div className={styles.statValue}>
                {profile.sponsoring?.toLocaleString() || '0'}
              </div>
              <div className={styles.statSub}>Sponsoring</div>
            </div>
          </div>
          <div className={styles.networkPill}>
            <div className={styles.networkTrack}>
              <div
                className={styles.networkFill}
                style={{ width: `${profile.socialCredit || 0}%` }}
              />
            </div>
            <div className={styles.networkLabel}>Agent credit</div>
          </div>
        </div>

        {/* Social icons row */}
        <div className={styles.socialRow}>
          {profile.email ? (
            <a
              href={`mailto:${profile.email}`}
              style={{ display: 'inline-flex', alignItems: 'center' }}
              aria-label="Email"
            >
              <Image src="/assets/profile/email_outlined.svg" alt="Email" width={20} height={20} />
            </a>
          ) : (
            <Image
              src="/assets/profile/email_outlined.svg"
              alt="Email"
              width={20}
              height={20}
              style={{ opacity: 0.3, pointerEvents: 'none' }}
            />
          )}
          <Image src="/assets/profile/dot.svg" alt="" width={3} height={3} />
          {profile.instagramUrl ? (
            <a
              href={profile.instagramUrl.startsWith('http') ? profile.instagramUrl : `https://instagram.com/${profile.instagramUrl.replace(/^@/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center' }}
              aria-label="Instagram"
            >
              <Image src="/assets/profile/instagram.svg" alt="Instagram" width={20} height={20} />
            </a>
          ) : (
            <Image
              src="/assets/profile/instagram.svg"
              alt="Instagram"
              width={20}
              height={20}
              style={{ opacity: 0.3, pointerEvents: 'none' }}
            />
          )}
          <Image src="/assets/profile/dot.svg" alt="" width={3} height={3} />
          {profile.linkedinUrl ? (
            <a
              href={profile.linkedinUrl.startsWith('http') ? profile.linkedinUrl : `https://linkedin.com/in/${profile.linkedinUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center' }}
              aria-label="LinkedIn"
            >
              <Image src="/assets/profile/linkedin.svg" alt="LinkedIn" width={20} height={20} />
            </a>
          ) : (
            <Image
              src="/assets/profile/linkedin.svg"
              alt="LinkedIn"
              width={20}
              height={20}
              style={{ opacity: 0.3, pointerEvents: 'none' }}
            />
          )}
        </div>

        {/* Action buttons */}
        <div className={styles.actionButtons}>
          {/* Sponsor button */}
          <button
            onClick={handleSponsor}
            className={styles.sponsorButton}
            type="button"
          >
            Sponsor
          </button>

          {/* Secondary buttons row */}
          <div className={styles.secondaryButtonsRow}>
            <button
              onClick={handleMessage}
              className={styles.secondaryButton}
              type="button"
            >
              Message
            </button>
            <button
              onClick={handlePayRequest}
              className={styles.secondaryButton}
              type="button"
            >
              Pay / Request
            </button>
            <button
              onClick={handleBookmark}
              className={styles.bookmarkButton}
              type="button"
              aria-label="Bookmark"
            >
              <Bookmark
                size={22}
                strokeWidth={2}
                style={{ color: '#000' }}
                fill={isBookmarked ? '#000' : 'none'}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


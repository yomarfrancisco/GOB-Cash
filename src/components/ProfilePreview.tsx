'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Bookmark, Lock } from 'lucide-react'
import TopGlassBar from './TopGlassBar'
import Avatar from './Avatar'
import styles from './ProfilePreview.module.css'

interface ProfilePreviewProps {
  userHandle: string
  fullName?: string
  email?: string
  avatarUrl?: string | null
  backdropUrl?: string | null
  instagramUrl?: string
  linkedinUrl?: string
  rating?: number
  ratingCount?: string
  sponsors?: number
  sponsoring?: number
  socialCredit?: number
  verified?: boolean
}

export default function ProfilePreview({
  userHandle,
  fullName,
  email,
  avatarUrl,
  backdropUrl,
  instagramUrl,
  linkedinUrl,
  rating,
  ratingCount,
  sponsors = 0,
  sponsoring = 0,
  socialCredit = 0,
  verified = false,
}: ProfilePreviewProps) {
  return (
    <div className={styles.previewContainer}>
      {/* Backdrop - stays in place */}
      <div className={styles.backdropContainer}>
        <img
          src={backdropUrl || '/assets/benjamin_grey.png'}
          alt=""
          className={styles.backdropImage}
        />
        <div className={styles.backdropFade} />
      </div>

      {/* Content wrapper - shifts down by 60px */}
      <div className={styles.previewContent}>
        {/* Glass overlay with TopGlassBar */}
        <div className={styles.glassOverlay}>
          <div className={styles.glassOverlayInner}>
            <TopGlassBar hideLogo={true} glassShardSrc="/assets/masked glass shard.png" hideIcons={true} />
            
            {/* Avatar + handle in top glass */}
            <div className={styles.avatarContainer}>
              <Avatar
                name={fullName}
                email={email}
                avatarUrl={avatarUrl}
                size={72}
                rounded={24}
                className={styles.avatar}
              />
              <h1 className={styles.handle}>
                {userHandle}
                {verified && (
                  <span className={styles.verifiedIcon}>
                    <Image
                      src="/assets/verified.svg"
                      alt="Verified"
                      width={13}
                      height={13}
                      unoptimized
                    />
                  </span>
                )}
              </h1>
            </div>
          </div>
        </div>

        {/* GOB logo and icons */}
        <div className={styles.iconsContainer}>
          <div className={styles.logoContainer}>
            <Link href="https://gobankless.app" target="_blank" rel="noopener noreferrer">
              <Image
                src="/assets/GOBlogo-white.png"
                alt="GoBankless"
                width={51.3}
                height={32}
                priority
                unoptimized
              />
            </Link>
          </div>
          <div className={styles.iconGroup}>
            <button className={styles.iconButton} type="button" disabled aria-label="Share profile">
              <Image src="/assets/core/export.svg" alt="Share" className={styles.icon} width={24} height={24} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className={styles.scrollContent}>
        <div className={styles.content}>
          {/* Stats + network pill */}
          <div className={styles.statsCard}>
            <div className={styles.statsRow}>
              {rating !== undefined && (
                <>
                  <div className={styles.stat}>
                    <div className={styles.statTop}>
                      <span className={styles.statValue}>{rating.toFixed(1)}</span>
                      <Image src="/assets/profile/star.svg" alt="" width={12} height={12} />
                    </div>
                    {ratingCount && (
                      <div className={styles.statSub}>({ratingCount})</div>
                    )}
                  </div>
                  <div className={styles.statDivider} />
                </>
              )}
              <div className={styles.stat}>
                <div className={styles.statValue}>{sponsors.toLocaleString()}</div>
                <div className={styles.statSub}>Investors</div>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <div className={styles.statValue}>{sponsoring.toLocaleString()}</div>
                <div className={styles.statSub}>Investing</div>
              </div>
            </div>
            <div className={styles.networkPill}>
              <div className={styles.networkTrack}>
                <div
                  className={styles.networkFill}
                  style={{ width: `${socialCredit || 0}%` }}
                />
              </div>
              <div className={styles.networkLabel}>Agent credit</div>
            </div>
          </div>

          {/* Social row */}
          <div className={styles.socialRow}>
            {email ? (
              <a
                href={`mailto:${email}`}
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
            {instagramUrl ? (
              <a
                href={instagramUrl.startsWith('http') ? instagramUrl : `https://instagram.com/${instagramUrl.replace(/^@/, '')}`}
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
            {linkedinUrl ? (
              <a
                href={linkedinUrl.startsWith('http') ? linkedinUrl : `https://linkedin.com/in/${linkedinUrl}`}
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

          {/* Sponsor section */}
          <section className={styles.sponsorSection}>
            <div className={styles.sponsorContainer}>
              {/* Primary sponsor pill */}
              <div className={styles.sponsorButtonWrapper}>
                <button className={styles.sponsorButton} type="button" disabled>
                  <div className={styles.sponsorButtonInner}>
                    <span className={styles.sponsorButtonText}>
                      <span className={styles.sponsorButtonBold}>Invest</span>
                    </span>
                  </div>
                </button>
              </div>

              {/* Secondary row: Message / Pay / Bookmark */}
              <div className={styles.secondaryButtonsRow}>
                {/* Message pill */}
                <div className={styles.messageButtonWrapper}>
                  <button className={styles.messageButton} type="button" disabled>
                    <div className={styles.messageButtonInner}>
                      <span className={styles.messageButtonText}>
                        <span className={styles.messageButtonBold}>Message</span>
                      </span>
                    </div>
                  </button>
                  {/* Lock superscript icon */}
                  <div className={styles.messageLockSuperscript}>
                    <Lock size={16} strokeWidth={2} />
                  </div>
                </div>

                {/* Pay / Request pill */}
                <button className={styles.payRequestButton} type="button" disabled>
                  <div className={styles.payRequestButtonInner}>
                    <span className={styles.payRequestButtonText}>
                      <span className={styles.payRequestButtonBold}>Pay/Request</span>
                    </span>
                  </div>
                </button>

                {/* Bookmark circle */}
                <button className={styles.bookmarkButton} type="button" disabled aria-label="Bookmark">
                  <div className={styles.bookmarkButtonInner}>
                    <Bookmark size={24} strokeWidth={2} style={{ color: '#000' }} />
                  </div>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
      </div>
    </div>
  )
}

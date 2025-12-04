'use client'

import Image from 'next/image'
import { Bookmark } from 'lucide-react'
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
      {/* Backdrop */}
      <div className={styles.backdropContainer}>
        <Image
          src={backdropUrl || '/assets/benjamin_grey.png'}
          alt=""
          fill
          style={{ objectFit: 'cover' }}
          className={styles.backdropImage}
        />
        <div className={styles.backdropFade} />
      </div>

      {/* Glass overlay with avatar and handle */}
      <div className={styles.glassOverlay}>
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

      {/* Scrollable content */}
      <div className={styles.scrollContent}>
        {/* Stats card */}
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
              <div className={styles.statSub}>Sponsors</div>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <div className={styles.statValue}>{sponsoring.toLocaleString()}</div>
              <div className={styles.statSub}>Sponsoring</div>
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

        {/* Social links */}
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
            {/* Primary sponsor button */}
            <div className={styles.sponsorButtonWrapper}>
              <button className={styles.sponsorButton} type="button" disabled>
                <span className={styles.sponsorButtonText}>
                  <span className={styles.sponsorButtonBold}>Sponsor</span>
                </span>
              </button>
            </div>

            {/* Secondary row: Message / Pay / Bookmark */}
            <div className={styles.secondaryButtonsRow}>
              {/* Message pill */}
              <div className={styles.messageButtonWrapper}>
                <button className={styles.messageButton} type="button" disabled>
                  <span className={styles.messageButtonText}>
                    <span className={styles.messageButtonBold}>Message</span>
                  </span>
                </button>
              </div>

              {/* Pay / Request pill */}
              <button className={styles.payRequestButton} type="button" disabled>
                <span className={styles.payRequestButtonText}>
                  <span className={styles.payRequestButtonBold}>Pay/Request</span>
                </span>
              </button>

              {/* Bookmark circle */}
              <button className={styles.bookmarkButton} type="button" disabled aria-label="Bookmark">
                <Bookmark size={24} strokeWidth={2} style={{ color: '#000' }} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}


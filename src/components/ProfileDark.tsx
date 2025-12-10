'use client'

import Image from 'next/image'
import styles from './ProfileDark.module.css'

export default function ProfileDark() {
  return (
    <div className={styles.profileDark}>
      {/* Header: avatar, name, handle */}
      <div className={styles.profileHeader}>
        <div className={styles.profileDarkAvatarProfile}>
          {/* Replace with real avatar when available */}
          {/* <Image src="/assets/avatar-samuel.png" alt="" fill /> */}
        </div>
        <div className={styles.frameContainer}>
          <div className={styles.usernameProfileParent}>
            <div className={styles.usernameProfile}>
              <div className={styles.text9}>Samuel Akoyo</div>
              {/* verified dot/icon */}
              <span className={styles.verifiedDot} />
            </div>
            <div className={styles.prgmailcom}>$samakoyo</div>
          </div>
          <div className={styles.prgmailcomParent}>
            <div className={styles.profileDarkPrgmailcom}>
              A skilled entrepreneur experienced in manufacturing and construction across Africa. Let&rsquo;s do business, DMs are open.
            </div>
            <div className={styles.profileDarkFrameParent}>
              <div className={styles.ico24MapPlacesPoiParent}>
                <Image src="/assets/profile/location.svg" alt="" width={12} height={12} />
                <div className={styles.prgmailcom2}>South Africa</div>
              </div>
              <div className={styles.frameInner}>•</div>
              <div className={styles.ico24MapPlacesPoiParent}>
                <Image src="/assets/profile/calendar.svg" alt="" width={12} height={12} />
                <div className={styles.prgmailcom2}>Joined Feb 2024</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats block */}
      <div className={styles.statsAndLicense}>
        <div className={styles.profileDarkStatsAndLicense}>
          <div className={styles.statsBlock}>
            <div className={styles.statUnit}>
              <div className={styles.ratingNumber}>
                <div className={styles.text}>4.8</div>
                <Image src="/assets/profile/star.svg" alt="" width={12} height={12} />
              </div>
              <div className={styles.k}>(11.5K)</div>
            </div>
            <div className={styles.divider} />
            <div className={styles.statUnit}>
              <div className={styles.text}>8,122</div>
              <div className={styles.k}>Joined</div>
            </div>
            <div className={styles.divider} />
            <div className={styles.statUnit}>
              <div className={styles.text}>556</div>
              <div className={styles.k}>Launched</div>
            </div>
          </div>
          <div className={styles.license}>
            <div className={styles.progressBar}>
              <div className={styles.track}>
                <div className={styles.filled} />
              </div>
            </div>
            <div className={styles.myDealerNetwork}>Groups</div>
          </div>
        </div>
      </div>

      {/* Social row */}
      <div className={styles.socialMedia}>
        <Image src="/assets/profile/mail.svg" alt="Email" width={20} height={20} />
        <span className={styles.ico24OtherCircle} />
        <Image src="/assets/profile/instagram.svg" alt="Instagram" width={20} height={20} />
        <span className={styles.ico24OtherCircle} />
        <Image src="/assets/profile/linkedin.svg" alt="LinkedIn" width={20} height={20} />
      </div>

      {/* Buttons */}
      <div className={styles.buttonsOwnProfile}>
        <div className={styles.profileDarkButtonsOwnProfile}>
          <button className={styles.lButton}>
            <div className={styles.lBold}>Edit profile</div>
          </button>
          <button className={styles.lButton2}>
            <div className={styles.lBold}>Inbox</div>
          </button>
        </div>
      </div>

      {/* Bottom spacer to avoid overlapping the sticky glass */}
      <div style={{ height: 140 }} />
    </div>
  )
}


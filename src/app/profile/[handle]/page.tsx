'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { Bookmark } from 'lucide-react'
import { useUserProfileStore } from '@/store/userProfile'
import TopGlassBar from '@/components/TopGlassBar'
import Avatar from '@/components/Avatar'
import { useFinancialInboxStore } from '@/state/financialInbox'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { usePaymentDetailsSheet } from '@/store/usePaymentDetailsSheet'
import PaymentDetailsSheet from '@/components/PaymentDetailsSheet'

// Stub data for demo profiles
interface StubProfile {
  userHandle: string
  fullName: string
  avatarUrl: string | null
  email?: string
  instagramUrl?: string
  linkedinUrl?: string
  location?: string
  joinDate?: string
  rating?: number
  ratingCount?: string
  sponsors?: number
  sponsoring?: number
  socialCredit?: number
}

const STUB_PROFILES: Record<string, StubProfile> = {
  ama: {
    userHandle: '@ama',
    fullName: 'Ama',
    avatarUrl: '/assets/Brics-girl-blue.png',
    location: 'South Africa',
    joinDate: 'Joined Feb 2024',
    rating: 4.8,
    ratingCount: '11.5K',
    sponsors: 8122,
    sponsoring: 556,
    socialCredit: 22.4,
  },
  samakoyo: {
    userHandle: '@samakoyo',
    fullName: 'Samuel Akoyo',
    avatarUrl: null,
    email: 'samakoyo@example.com',
    location: 'South Africa',
    joinDate: 'Joined Feb 2024',
    rating: 4.8,
    ratingCount: '11.5K',
    sponsors: 8122,
    sponsoring: 556,
    socialCredit: 22.4,
  },
}

export default function ProfileHandlePage() {
  const router = useRouter()
  const params = useParams()
  const { profile: currentUserProfile } = useUserProfileStore()
  const { openInbox } = useFinancialInboxStore()
  const { guardAuthed } = useRequireAuth()
  const { open: openPaymentDetails } = usePaymentDetailsSheet()
  const [isBookmarked, setIsBookmarked] = useState(false)

  // Extract handle from params (remove @ if present, handle both /profile/ama and /profile/@ama)
  const handleParam = params?.handle as string | undefined
  const normalizedHandle = useMemo(() => {
    if (!handleParam) return null
    // Remove leading @ if present, then add it back for consistency
    const cleanHandle = handleParam.replace(/^@/, '')
    return `@${cleanHandle}`
  }, [handleParam])

  // Check if viewing own profile and redirect
  useEffect(() => {
    if (normalizedHandle && currentUserProfile.userHandle === normalizedHandle) {
      router.replace('/profile')
    }
  }, [normalizedHandle, currentUserProfile.userHandle, router])

  // Get profile data (stub for now, later will fetch from API)
  const profile = useMemo<StubProfile | null>(() => {
    if (!normalizedHandle) return null

    // Check if it's a known stub profile
    const cleanHandle = normalizedHandle.replace(/^@/, '')
    if (STUB_PROFILES[cleanHandle]) {
      return STUB_PROFILES[cleanHandle]
    }

    // TODO: Fetch from API using normalizedHandle
    // For now, return a default profile structure
    return {
      userHandle: normalizedHandle,
      fullName: normalizedHandle.replace('@', '').charAt(0).toUpperCase() + normalizedHandle.replace('@', '').slice(1),
      avatarUrl: null,
      location: 'South Africa',
      joinDate: 'Joined Feb 2024',
      rating: 4.5,
      ratingCount: '1.2K',
      sponsors: 0,
      sponsoring: 0,
      socialCredit: 0,
    }
  }, [normalizedHandle])

  if (!normalizedHandle || !profile) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        color: '#000',
        fontFamily: 'Inter, sans-serif',
      }}>
        Loading...
      </div>
    )
  }

  return (
    <div className="app-shell profile-page">
      <div className="mobile-frame">
        <div className="dashboard-container" style={{ position: 'relative' }}>
          {/* Overlay: Top glass bar only (NO bottom nav, NO logo) */}
          <div className="overlay-glass">
            <div className="overlay-glass-inner">
              <TopGlassBar hideLogo={true} />
              {/* NO BottomGlassBar for public profiles */}
            </div>
          </div>

          {/* Profile backdrop: Benjamin image with white fade */}
          <div className="profile-backdrop">
            <img
              src="/assets/benjamin_grey.png"
              alt=""
              className="profile-backdrop-image"
            />
            <div className="profile-backdrop-fade" />
          </div>

          {/* Scrollable content - shifted down 30px to show more backdrop */}
          <div className="scroll-content profile-scroll">
            <div className="content profile-content" style={{ marginTop: '30px' }}>
              {/* Avatar + name + handle */}
              <div className="profile-header">
                <Avatar
                  name={profile.fullName}
                  email={profile.email}
                  avatarUrl={profile.avatarUrl}
                  size={96}
                  rounded={24}
                  className="profile-avatar"
                />
                <h1 className="profile-name">{profile.userHandle}</h1>
                <div className="profile-handle">{profile.fullName}</div>

                {/* Meta row */}
                <div className="profile-meta">
                  {profile.location && (
                    <>
                      <div className="meta-item">
                        <Image src="/assets/profile/location-pin.svg" alt="" width={12} height={12} />
                        <span>{profile.location}</span>
                      </div>
                      {profile.joinDate && <div className="meta-dot" />}
                    </>
                  )}
                  {profile.joinDate && (
                    <div className="meta-item">
                      <Image src="/assets/profile/calendar_month.svg" alt="" width={12} height={12} />
                      <span>{profile.joinDate}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats + network pill */}
              <div className="profile-stats-card">
                <div className="stats-row">
                  {profile.rating !== undefined && (
                    <>
                      <div className="stat">
                        <div className="stat-top">
                          <span className="stat-value">{profile.rating.toFixed(1)}</span>
                          <Image src="/assets/profile/star.svg" alt="" width={12} height={12} />
                        </div>
                        {profile.ratingCount && (
                          <div className="stat-sub">({profile.ratingCount})</div>
                        )}
                      </div>
                      <div className="stat-divider" />
                    </>
                  )}
                  <div className="stat">
                    <div className="stat-value">{profile.sponsors?.toLocaleString() || '0'}</div>
                    <div className="stat-sub">Sponsors</div>
                  </div>
                  <div className="stat-divider" />
                  <div className="stat">
                    <div className="stat-value">{profile.sponsoring?.toLocaleString() || '0'}</div>
                    <div className="stat-sub">Sponosring</div>
                  </div>
                </div>
                <div className="network-pill">
                  <div className="network-track">
                    <div 
                      className="network-fill" 
                      style={{ width: `${profile.socialCredit || 0}%` }}
                    />
                  </div>
                  <div className="network-label">Social credit</div>
                </div>
              </div>

              {/* Social row */}
              <div className="profile-social">
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

              {/* Sponsor section - Figma-accurate structure */}
              <section className="sponsor">
                <div className="sponsor2">
                  {/* Primary sponsor pill */}
                  <div className="lButtonWrapper">
                    <button
                      className="lButton"
                      onClick={() => {
                        // TODO: Implement sponsor functionality
                        console.log('Sponsor:', profile.userHandle)
                      }}
                      type="button"
                    >
                      <div className="lButton2">
                        <span className="text">
                          <span className="lBold">Sponsor</span>
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Secondary row: Message / Pay / Bookmark */}
                  <div className="messageButtonLockedParent">
                    {/* Message pill */}
                    <div className="messageButtonLocked">
                      <button
                        className="button"
                        onClick={() => {
                          guardAuthed(() => {
                            // Open AMA chat / inbox for this user
                            // For Ama, open the existing inbox chat
                            if (normalizedHandle === '@ama') {
                              openInbox()
                            } else {
                              // TODO: Open chat with this user
                              console.log('Message:', profile.userHandle)
                            }
                          })
                        }}
                        type="button"
                      >
                        <div className="lButton3">
                          <span className="text">
                            <span className="lBold">Message</span>
                          </span>
                        </div>
                      </button>
                    </div>

                    {/* Pay / Request pill */}
                    <button
                      className="lButton4"
                      onClick={() => {
                        guardAuthed(() => {
                          // Open Pay/Request sheet for this user
                          // For now, open with 0 amount (user will enter it in the sheet)
                          openPaymentDetails('pay', 0)
                        })
                      }}
                      type="button"
                    >
                      <div className="lButton5">
                        <span className="text">
                          <span className="lBold">Pay / Request</span>
                        </span>
                      </div>
                    </button>

                    {/* Bookmark circle */}
                    <button
                      className="lButton6"
                      onClick={() => {
                        setIsBookmarked(!isBookmarked)
                        // TODO: Persist bookmark state
                        console.log('Bookmark toggled:', !isBookmarked)
                      }}
                      type="button"
                      aria-label="Bookmark"
                    >
                      <div className="lButton7">
                        <Bookmark
                          size={24}
                          strokeWidth={2}
                          style={{ color: '#fff' }}
                          fill={isBookmarked ? '#fff' : 'none'}
                        />
                      </div>
                    </button>
                  </div>
                </div>
              </section>

              {/* NO Invite friends section for public profiles */}
              {/* NO Settings section for public profiles */}
            </div>
          </div>

          {/* Top fade overlay - fades content behind top glass/logo */}
          <div className="content-fade-top" />

          {/* NO Bottom fade overlay for public profiles (no bottom nav) */}
        </div>
      </div>

      {/* PaymentDetailsSheet is rendered globally in layout.tsx */}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { useUserProfileStore } from '@/store/userProfile'
import TopGlassBar from '@/components/TopGlassBar'
import Avatar from '@/components/Avatar'
import { useFinancialInboxStore } from '@/state/financialInbox'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import CashInOutSheet from '@/components/CashInOutSheet'

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
  const [openCashInOut, setOpenCashInOut] = useState(false)

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
          {/* Overlay: Top glass bar only (NO bottom nav) */}
          <div className="overlay-glass">
            <div className="overlay-glass-inner">
              <TopGlassBar />
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

          {/* Scrollable content */}
          <div className="scroll-content profile-scroll">
            <div className="content profile-content">
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

              {/* Buttons */}
              <div className="profile-actions">
                <button 
                  className="btn profile-edit" 
                  onClick={() => {
                    guardAuthed(() => {
                      setOpenCashInOut(true)
                    })
                  }}
                >
                  Cash-in / out
                </button>
                <button
                  className="btn profile-inbox"
                  onClick={() => {
                    guardAuthed(() => {
                      openInbox()
                    })
                  }}
                >
                  Inbox
                </button>
              </div>

              {/* NO Invite friends section for public profiles */}
              {/* NO Settings section for public profiles */}
            </div>
          </div>

          {/* Top fade overlay - fades content behind top glass/logo */}
          <div className="content-fade-top" />

          {/* NO Bottom fade overlay for public profiles (no bottom nav) */}
        </div>
      </div>

      {/* Sheets */}
      <CashInOutSheet
        open={openCashInOut}
        onClose={() => setOpenCashInOut(false)}
        onSelect={(mode) => {
          setOpenCashInOut(false)
          // TODO: Handle deposit/withdraw for public profiles
          console.log('Selected mode:', mode)
        }}
      />
    </div>
  )
}

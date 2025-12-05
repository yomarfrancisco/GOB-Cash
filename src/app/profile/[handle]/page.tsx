'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Bookmark, Lock } from 'lucide-react'
import { useUserProfileStore } from '@/store/userProfile'
import { useAuthStore } from '@/store/auth'
import TopGlassBar from '@/components/TopGlassBar'
import Avatar from '@/components/Avatar'
import { useFinancialInboxStore } from '@/state/financialInbox'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { usePaymentDetailsSheet } from '@/store/usePaymentDetailsSheet'
import PaymentDetailsSheet from '@/components/PaymentDetailsSheet'
import { useShareProfileSheet } from '@/store/useShareProfileSheet'
import AmountSheet from '@/components/AmountSheet'
import { openAmaChatWithPaymentScenario, openAmaChatWithSponsorshipScenario } from '@/lib/cashDeposit/chatOrchestration'
import FinancialInboxSheet from '@/components/Inbox/FinancialInboxSheet'

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
  verified?: boolean
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
    verified: true,
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
    verified: false,
  },
}

export default function ProfileHandlePage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const { profile: currentUserProfile } = useUserProfileStore()
  const { openInbox } = useFinancialInboxStore()
  const { guardAuthed } = useRequireAuth()
  const { open: openPaymentDetails } = usePaymentDetailsSheet()
  const { isAuthed } = useAuthStore()
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [openAmount, setOpenAmount] = useState(false)
  const [amountMode, setAmountMode] = useState<'deposit' | 'withdraw' | 'send' | 'depositCard' | 'convert'>('convert')
  const [openSponsorAmount, setOpenSponsorAmount] = useState(false)

  // Detect if user came from search
  const fromSearch = searchParams?.get('fromSearch') === '1'

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
      verified: false,
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
          {/* Overlay: Top glass bar only (NO bottom nav, NO logo) - shifted down 92px */}
          <div className="overlay-glass" style={{ top: '92px' }}>
            <div className="overlay-glass-inner">
              <TopGlassBar hideLogo={true} glassShardSrc="/assets/masked glass shard.png" hideIcons={true} />
              {/* NO BottomGlassBar for public profiles */}
              
              {/* Avatar + handle in top glass - positioned near bottom of glass */}
              <div className="profile-other-avatar-container">
                <Avatar
                  name={profile.fullName}
                  email={profile.email}
                  avatarUrl={profile.avatarUrl}
                  size={72}
                  rounded={24}
                  className="profile-other-avatar"
                />
                <h1 className="profile-other-handle">
                  {profile.userHandle}
                  {profile.verified && (
                    <span className="profile-verified-icon">
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

          {/* GOB logo and icons positioned at original location with white color for third-party profiles */}
          <div className="profile-other-icons">
            {/* GOB logo on the left - link to home page */}
            <div className="profile-other-logo">
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
            {/* Icons on the right */}
            <div className="profile-other-icon-group">
              <button
                onClick={() => {
                  // Open ShareProfileSheet for third-party profile
                  useShareProfileSheet.getState().open({
                    subject: {
                      handle: profile.userHandle,
                      avatarUrl: profile.avatarUrl,
                      fullName: profile.fullName,
                    },
                    mode: 'other',
                  })
                }}
                className="profile-other-icon-button"
                aria-label="Share profile"
                type="button"
              >
                <Image src="/assets/core/export.svg" alt="Share" className="profile-other-icon" width={24} height={24} />
              </button>
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
          <div className="scroll-content profile-scroll profile-other-scroll">
            <div className="content profile-content">
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
                    <div className="stat-sub">Investors</div>
                  </div>
                  <div className="stat-divider" />
                  <div className="stat">
                    <div className="stat-value">{profile.sponsoring?.toLocaleString() || '0'}</div>
                    <div className="stat-sub">Investing</div>
                  </div>
                </div>
                <div className="network-pill">
                  <div className="network-track">
                    <div 
                      className="network-fill" 
                      style={{ width: `${profile.socialCredit || 0}%` }}
                    />
                  </div>
                  <div className="network-label">Agent credit</div>
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
                  {/* Primary Pay/Request pill (swapped from Sponsor) */}
                  <div className="lButtonWrapper">
                    <button
                      className="lButton"
                      onClick={() => {
                        // Profile-specific shortcut: open AmountSheet directly with locked recipient
                        // This bypasses PaymentDetailsSheet since recipient is already known
                        // Guest-friendly: no auth gate - allows unauthenticated users to use this flow
                        setAmountMode('convert')
                        setOpenAmount(true)
                      }}
                      type="button"
                    >
                      <div className="lButton2">
                        <span className="text">
                          <span className="lBold">Pay / Request</span>
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Secondary row: Message / Sponsor / Bookmark */}
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
                      {/* Lock superscript icon */}
                      <div className="messageLockSuperscript">
                        <Lock size={16} strokeWidth={2} />
                      </div>
                    </div>

                    {/* Sponsor pill (swapped from Pay/Request) */}
                    <button
                      className="lButton4"
                      onClick={() => {
                        // Profile-specific sponsor flow: open AmountSheet with sponsorship entry point
                        // Guest-friendly: no auth gate - allows unauthenticated users to use this flow
                        setAmountMode('convert')
                        setOpenSponsorAmount(true)
                      }}
                      type="button"
                    >
                      <div className="lButton5">
                        <span className="text">
                          <span className="lBold">Invest</span>
                        </span>
                      </div>
                    </button>

                    {/* Bookmark circle */}
                    <button
                      className="lButton6"
                      onClick={() => {
                        guardAuthed(() => {
                          setIsBookmarked(!isBookmarked)
                          // TODO: Persist bookmark state
                          console.log('Bookmark toggled:', !isBookmarked)
                        })
                      }}
                      type="button"
                      aria-label="Bookmark"
                    >
                      <div className="lButton7">
                        <Bookmark
                          size={24}
                          strokeWidth={2}
                          style={{ color: '#000' }}
                          fill={isBookmarked ? '#000' : 'none'}
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

      {/* AmountSheet for profile Pay/Request flow - bypasses PaymentDetailsSheet since recipient is known */}
      <AmountSheet
        open={openAmount}
        onClose={() => {
          setOpenAmount(false)
        }}
        mode={amountMode}
        flowType="payment"
        balanceZAR={200}
        fxRateZARperUSDT={18.1}
        entryPoint="cashButton"
        onCashSubmit={({ amountZAR }) => {
          // Profile flow: skip PaymentDetailsSheet, go straight to Ama chat with locked recipient
          if (!normalizedHandle) return
          setOpenAmount(false)
          setTimeout(() => {
            openAmaChatWithPaymentScenario('request', amountZAR, normalizedHandle)
          }, 220)
        }}
        onCardSubmit={({ amountZAR }) => {
          // Profile flow: skip PaymentDetailsSheet, go straight to Ama chat with locked recipient
          if (!normalizedHandle) return
          setOpenAmount(false)
          setTimeout(() => {
            openAmaChatWithPaymentScenario('pay', amountZAR, normalizedHandle)
          }, 220)
        }}
      />
      {/* AmountSheet for profile Sponsor flow - same keypad but with Weekly/Monthly buttons */}
      <AmountSheet
        open={openSponsorAmount}
        onClose={() => {
          setOpenSponsorAmount(false)
        }}
        mode={amountMode}
        flowType="payment"
        balanceZAR={200}
        fxRateZARperUSDT={18.1}
        entryPoint="sponsorButton"
        sponsorHandle={normalizedHandle || undefined}
        onWeeklySubmit={({ amountZAR }) => {
          // Profile sponsor flow: go straight to Ama chat with weekly sponsorship
          if (!normalizedHandle) return
          setOpenSponsorAmount(false)
          setTimeout(() => {
            openAmaChatWithSponsorshipScenario('weekly', amountZAR, normalizedHandle)
          }, 220)
        }}
        onMonthlySubmit={({ amountZAR }) => {
          // Profile sponsor flow: go straight to Ama chat with monthly sponsorship
          if (!normalizedHandle) return
          setOpenSponsorAmount(false)
          setTimeout(() => {
            openAmaChatWithSponsorshipScenario('monthly', amountZAR, normalizedHandle)
          }, 220)
        }}
      />
      {/* FinancialInboxSheet: enables Ama chat to render on this route for unauthenticated Pay/Request flow */}
      <FinancialInboxSheet />
      {/* PaymentDetailsSheet is rendered globally in layout.tsx */}
      {/* ShareProfileSheet is rendered globally in layout.tsx */}
    </div>
  )
}

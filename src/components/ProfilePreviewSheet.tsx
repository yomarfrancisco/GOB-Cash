'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Bookmark, Lock, ChevronLeft, Share2 } from 'lucide-react'
import ActionSheet from './ActionSheet'
import Avatar from './Avatar'
import TopGlassBar from './TopGlassBar'
import { useProfilePreviewSheet } from '@/store/useProfilePreviewSheet'
import { getProfileByHandle, type StubProfile } from '@/lib/demo/profileData'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useFinancialInboxStore } from '@/state/financialInbox'
import { usePaymentDetailsSheet } from '@/store/usePaymentDetailsSheet'
import AmountSheet from './AmountSheet'
import { openAmaChatWithPaymentScenario, openAmaChatWithSponsorshipScenario } from '@/lib/cashDeposit/chatOrchestration'
import FinancialInboxSheet from './Inbox/FinancialInboxSheet'
import { useShareProfileSheet } from '@/store/useShareProfileSheet'
import listStyles from './Inbox/FinancialInboxListSheet.module.css'

type ProfilePreviewSheetProps = {
  open: boolean
  handle: string | null
  onClose: () => void
}

export default function ProfilePreviewSheet({ open, handle, onClose }: ProfilePreviewSheetProps) {
  const { guardAuthed } = useRequireAuth()
  const { openInbox } = useFinancialInboxStore()
  const { open: openPaymentDetails } = usePaymentDetailsSheet()
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [openAmount, setOpenAmount] = useState(false)
  const [amountMode, setAmountMode] = useState<'deposit' | 'withdraw' | 'send' | 'depositCard' | 'convert'>('convert')
  const [openSponsorAmount, setOpenSponsorAmount] = useState(false)

  // Get profile data
  const profile = useMemo<StubProfile | null>(() => {
    if (!handle) return null
    return getProfileByHandle(handle)
  }, [handle])

  const normalizedHandle = useMemo(() => {
    if (!handle) return null
    return `@${handle.replace(/^@/, '').replace(/^\$/, '')}`
  }, [handle])

  if (!profile || !normalizedHandle) {
    return null
  }

  return (
    <>
      <ActionSheet
        open={open}
        onClose={onClose}
        title=""
        size="tall"
        className={`${listStyles.financialInboxSheet} inboxTallSheet`}
      >
        <div className="profile-preview-sheet-container" style={{ 
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: '#ffffff', // White base ensures no black shows below image
        }}>
          {/* Profile backdrop - matches globals.css structure */}
          <div className="profile-backdrop">
            <img
              src="/assets/benjamin_grey.png"
              alt=""
              className="profile-backdrop-image"
            />
          </div>
          
          {/* Gradient overlay - white base extends high to hide image edge */}
          <div className="profile-preview-gradient" />

          {/* Glass overlay with avatar and handle - matches profile page structure */}
          <div className="overlay-glass" style={{ top: '92px' }}>
            <div className="overlay-glass-inner">
              <TopGlassBar hideLogo={true} glassShardSrc="/assets/masked glass shard.png" hideIcons={true} />
              
              {/* Avatar + handle in top glass */}
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

          {/* Back chevron and share icons - left-aligned group */}
          <div className="profile-preview-icons-left">
            <div className="profile-preview-icons-group">
              <button
                type="button"
                onClick={onClose}
                className="profile-back-button"
                aria-label="Back"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronLeft size={24} strokeWidth={2} color="white" />
              </button>
              <button
                onClick={() => {
                  useShareProfileSheet.getState().open({
                    subject: {
                      handle: profile.userHandle,
                      avatarUrl: profile.avatarUrl,
                      fullName: profile.fullName,
                    },
                    mode: 'other',
                  })
                }}
                className="profile-preview-icon-btn"
                aria-label="Share profile"
                type="button"
              >
                <Share2 size={24} strokeWidth={2} color="#FFFFFF" />
              </button>
            </div>
          </div>

          {/* Content - non-scrollable for v1 */}
          <div 
            className="scroll-content profile-scroll profile-other-scroll profile-preview-no-scroll"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              overflowY: 'hidden', // No scrolling
            }}
          >
            {/* Content wrapper - above fade */}
            <div className="profile-preview-content content profile-content">
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

              {/* Action buttons section */}
              <section className="sponsor">
                <div className="sponsor2">
                  {/* Primary Pay/Request pill */}
                  <div className="lButtonWrapper">
                    <button
                      className="lButton"
                      onClick={() => {
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

                  {/* Secondary row: Message / Invest / Bookmark */}
                  <div className="messageButtonLockedParent">
                    {/* Message pill */}
                    <div className="messageButtonLocked">
                      <button
                        className="button"
                        onClick={() => {
                          guardAuthed(() => {
                            if (normalizedHandle === '@ama') {
                              openInbox()
                            } else {
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
                      <div className="messageLockSuperscript">
                        <Lock size={16} strokeWidth={2} />
                      </div>
                    </div>

                    {/* Invest pill */}
                    <button
                      className="lButton4"
                      onClick={() => {
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
            </div>
          </div>
        </div>
      </ActionSheet>

      {/* AmountSheet for Pay/Request flow */}
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
          if (!normalizedHandle) return
          setOpenAmount(false)
          setTimeout(() => {
            openAmaChatWithPaymentScenario('request', amountZAR, normalizedHandle)
          }, 220)
        }}
        onCardSubmit={({ amountZAR }) => {
          if (!normalizedHandle) return
          setOpenAmount(false)
          setTimeout(() => {
            openAmaChatWithPaymentScenario('pay', amountZAR, normalizedHandle)
          }, 220)
        }}
      />

      {/* AmountSheet for Invest flow */}
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
          if (!normalizedHandle) return
          setOpenSponsorAmount(false)
          setTimeout(() => {
            openAmaChatWithSponsorshipScenario('weekly', amountZAR, normalizedHandle)
          }, 220)
        }}
        onMonthlySubmit={({ amountZAR }) => {
          if (!normalizedHandle) return
          setOpenSponsorAmount(false)
          setTimeout(() => {
            openAmaChatWithSponsorshipScenario('monthly', amountZAR, normalizedHandle)
          }, 220)
        }}
      />

      {/* FinancialInboxSheet for Ama chat */}
      <FinancialInboxSheet />
    </>
  )
}


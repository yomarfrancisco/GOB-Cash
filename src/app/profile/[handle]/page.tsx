'use client'

import { useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useUserProfileStore } from '@/store/userProfile'
import ProfileOther, { type OtherProfileData } from '@/components/ProfileOther'

// Stub data for demo profiles
const STUB_PROFILES: Record<string, OtherProfileData> = {
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
  const profileData = useMemo<OtherProfileData | null>(() => {
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

  if (!normalizedHandle || !profileData) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        color: '#fff',
        fontFamily: 'Inter, sans-serif',
      }}>
        Loading...
      </div>
    )
  }

  return <ProfileOther profile={profileData} />
}


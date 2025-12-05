/**
 * Shared profile data for demo/stub profiles
 * Used by both /profile/[handle] route and ProfilePreviewSheet
 */

export interface StubProfile {
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

export const STUB_PROFILES: Record<string, StubProfile> = {
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
  ariel: {
    userHandle: '@ariel',
    fullName: 'Ariel',
    avatarUrl: '/assets/avatar - profile (3).png',
    location: 'South Africa',
    joinDate: 'Joined Feb 2024',
    rating: 4.8,
    ratingCount: '11.5K',
    sponsors: 8122,
    sponsoring: 556,
    socialCredit: 22.4,
    verified: false,
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

/**
 * Get profile data by handle (without @ prefix)
 */
export function getProfileByHandle(handle: string | null): StubProfile | null {
  if (!handle) return null
  
  const cleanHandle = handle.replace(/^@/, '').replace(/^\$/, '')
  
  if (STUB_PROFILES[cleanHandle]) {
    return STUB_PROFILES[cleanHandle]
  }
  
  // Return default profile structure for unknown handles
  return {
    userHandle: `@${cleanHandle}`,
    fullName: cleanHandle.charAt(0).toUpperCase() + cleanHandle.slice(1),
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
}


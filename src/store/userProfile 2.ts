'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UserProfile {
  fullName: string
  userHandle: string // Always starts with @
  avatarUrl: string | null
  email?: string
  instagramUrl?: string
  linkedinUrl?: string
  description?: string
}

interface UserProfileState {
  profile: UserProfile
  setProfile: (updates: Partial<UserProfile>) => void
  reset: () => void
}

const defaultProfile: UserProfile = {
  fullName: 'Samuel Akoyo',
  userHandle: '@samakoyo',
  avatarUrl: null,
  email: 'samakoyo@example.com',
  instagramUrl: undefined,
  linkedinUrl: undefined,
  description: undefined,
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      profile: defaultProfile,
      setProfile: (updates) =>
        set((state) => ({
          profile: {
            ...state.profile,
            ...updates,
            // Ensure handle always starts with @
            userHandle: updates.userHandle
              ? updates.userHandle.startsWith('@')
                ? updates.userHandle
                : `@${updates.userHandle}`
              : state.profile.userHandle,
          },
        })),
      reset: () => set({ profile: defaultProfile }),
    }),
    { name: 'user-profile-store-v1' }
  )
)


'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CardBrand = 'visa' | 'mastercard' | 'amex'

export type LinkedCard = {
  id: string
  brand: CardBrand
  last4: string
  maskedDisplay: string // e.g. "*******0444"
  isDefault: boolean
  // Full card details for editing
  cardNumber?: string
  cardExpDate?: string
  cardCvv?: string
  cardCountry?: string
}

export interface UserProfile {
  fullName: string
  userHandle: string // Always starts with @
  avatarUrl: string | null
  backdropUrl: string | null
  email?: string
  instagramUrl?: string
  linkedinUrl?: string
  whatsappUrl?: string
  description?: string
  // TODO: wire real addresses
  usdtSaAddress?: string // USDT SA (ZAR wallet) address
  usdtMznAddress?: string // USDT MZN (Moz wallet) address
  pepeAddress?: string // PEPE address
  ethAddress?: string // ETH address
  btcAddress?: string // BTC address
  // Linked cards
  linkedCards: LinkedCard[]
}

interface UserProfileState {
  profile: UserProfile
  setProfile: (updates: Partial<UserProfile>) => void
  reset: () => void
  addOrUpdateCard: (card: Omit<LinkedCard, 'id' | 'isDefault'> & { id?: string }) => void
  setDefaultCard: (id: string) => void
  removeCard: (id: string) => void
}

const defaultProfile: UserProfile = {
  fullName: 'Samuel Akoyo',
  userHandle: '@samakoyo',
  avatarUrl: null,
  backdropUrl: null,
  email: 'samakoyo@example.com',
  instagramUrl: undefined,
  linkedinUrl: undefined,
  description: undefined,
  linkedCards: [],
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set, get) => ({
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
      addOrUpdateCard: (card) => {
        set((state) => {
          const { linkedCards } = state.profile
          let updatedCards: LinkedCard[]

          if (card.id) {
            // Update existing card
            updatedCards = linkedCards.map((c) =>
              c.id === card.id
                ? {
                    ...c,
                    ...card,
                    id: c.id,
                    isDefault: card.isDefault ?? c.isDefault,
                  }
                : c,
            )
          } else {
            // Add new card
            const newCard: LinkedCard = {
              ...card,
              id: crypto.randomUUID(),
              isDefault: true,
            }
            // Set all other cards to non-default
            updatedCards = linkedCards.map((c) => ({ ...c, isDefault: false }))
            updatedCards.push(newCard)
          }

          // Ensure exactly one card has isDefault: true
          const defaultCount = updatedCards.filter((c) => c.isDefault).length
          if (defaultCount === 0 && updatedCards.length > 0) {
            updatedCards[0].isDefault = true
          } else if (defaultCount > 1) {
            // If multiple defaults, keep only the last one
            let foundFirst = false
            updatedCards = updatedCards.map((c) => {
              if (c.isDefault && foundFirst) {
                return { ...c, isDefault: false }
              }
              if (c.isDefault) {
                foundFirst = true
              }
              return c
            })
          }

          return {
            profile: {
              ...state.profile,
              linkedCards: updatedCards,
            },
          }
        })
      },
      setDefaultCard: (id: string) => {
        set((state) => ({
          profile: {
            ...state.profile,
            linkedCards: state.profile.linkedCards.map((c) => ({
              ...c,
              isDefault: c.id === id,
            })),
          },
        }))
      },
      removeCard: (id: string) => {
        set((state) => {
          const updatedCards = state.profile.linkedCards.filter((c) => c.id !== id)
          // If we removed the default card and there are other cards, make the first one default
          if (updatedCards.length > 0) {
            const hadDefault = state.profile.linkedCards.find((c) => c.id === id)?.isDefault
            if (hadDefault) {
              updatedCards[0].isDefault = true
            }
          }
          return {
            profile: {
              ...state.profile,
              linkedCards: updatedCards,
            },
          }
        })
      },
    }),
    { name: 'user-profile-store-v1' }
  )
)


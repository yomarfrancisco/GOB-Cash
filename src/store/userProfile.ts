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

export interface LinkedBank {
  id: string
  bankName: string // "Standard Bank"
  country: string // "South Africa"
  swiftBic: string
  accountNumber: string // IBAN / account number
  accountHolderName: string // Full name of the account holder
  isDefault: boolean
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
  // Linked banks
  linkedBanks: LinkedBank[]
}

interface UserProfileState {
  profile: UserProfile
  setProfile: (updates: Partial<UserProfile>) => void
  reset: () => void
  addOrUpdateCard: (card: Omit<LinkedCard, 'id' | 'isDefault'> & { id?: string }) => void
  setDefaultCard: (id: string) => void
  removeCard: (id: string) => void
  addOrUpdateLinkedBank: (bank: Omit<LinkedBank, 'id' | 'isDefault'> & { id?: string }) => void
  setDefaultBank: (id: string) => void
  removeLinkedBank: (id: string) => void
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
  linkedBanks: [],
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
      addOrUpdateCard: (
        card: Omit<LinkedCard, 'id' | 'isDefault'> & { id?: string }
      ) =>
        set((state) => {
          const { linkedCards } = state.profile
          const editingId = card.id

          // EDIT EXISTING CARD
          if (editingId) {
            return {
              profile: {
                ...state.profile,
                linkedCards: linkedCards.map((c) =>
                  c.id === editingId
                    ? {
                        ...c,
                        ...card, // overwrite brand, last4, maskedDisplay, cardNumber, etc.
                        id: editingId,
                        // keep existing c.isDefault unchanged
                      }
                    : c
                ),
              },
            }
          }

          // ADD NEW CARD (becomes default)
          const newId = crypto.randomUUID()
          const newCard: LinkedCard = {
            id: newId,
            brand: card.brand,
            last4: card.last4,
            maskedDisplay: card.maskedDisplay,
            isDefault: true,
            cardNumber: card.cardNumber,
            cardExpDate: card.cardExpDate,
            cardCvv: card.cardCvv,
            cardCountry: card.cardCountry,
          }

          return {
            profile: {
              ...state.profile,
              linkedCards: [
                // all existing cards become non-default
                ...linkedCards.map((c) => ({ ...c, isDefault: false })),
                newCard,
              ],
            },
          }
        }),
      setDefaultCard: (id: string) =>
        set((state) => ({
          profile: {
            ...state.profile,
            linkedCards: state.profile.linkedCards.map((c) => ({
              ...c,
              isDefault: c.id === id,
            })),
          },
        })),
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
      addOrUpdateLinkedBank: (
        bank: Omit<LinkedBank, 'id' | 'isDefault'> & { id?: string }
      ) =>
        set((state) => {
          const { linkedBanks } = state.profile
          const editingId = bank.id

          // EDIT EXISTING BANK
          if (editingId) {
            return {
              profile: {
                ...state.profile,
                linkedBanks: linkedBanks.map((b) =>
                  b.id === editingId
                    ? {
                        ...b,
                        ...bank, // overwrite bankName, country, swiftBic, accountNumber, accountHolderName
                        id: editingId,
                        // keep existing b.isDefault unchanged
                      }
                    : b
                ),
              },
            }
          }

          // ADD NEW BANK (becomes default)
          const newId = crypto.randomUUID()
          const newBank: LinkedBank = {
            id: newId,
            bankName: bank.bankName,
            country: bank.country,
            swiftBic: bank.swiftBic,
            accountNumber: bank.accountNumber,
            accountHolderName: bank.accountHolderName,
            isDefault: true,
          }

          return {
            profile: {
              ...state.profile,
              linkedBanks: [
                // all existing banks become non-default
                ...linkedBanks.map((b) => ({ ...b, isDefault: false })),
                newBank,
              ],
            },
          }
        }),
      setDefaultBank: (id: string) =>
        set((state) => ({
          profile: {
            ...state.profile,
            linkedBanks: state.profile.linkedBanks.map((b) => ({
              ...b,
              isDefault: b.id === id,
            })),
          },
        })),
      removeLinkedBank: (id: string) => {
        set((state) => {
          const updatedBanks = state.profile.linkedBanks.filter((b) => b.id !== id)
          // If we removed the default bank and there are other banks, make the first one default
          if (updatedBanks.length > 0) {
            const hadDefault = state.profile.linkedBanks.find((b) => b.id === id)?.isDefault
            if (hadDefault) {
              updatedBanks[0].isDefault = true
            }
          }
          return {
            profile: {
              ...state.profile,
              linkedBanks: updatedBanks,
            },
          }
        })
      },
    }),
    { name: 'user-profile-store-v1' }
  )
)


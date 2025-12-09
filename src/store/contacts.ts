'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type GoogleContact = {
  id: string
  name: string
  email?: string
  phone?: string
  photoUrl?: string
  source?: 'connections' | 'otherContacts' | string
}

interface ContactsState {
  contacts: GoogleContact[]
  setContacts: (contacts: GoogleContact[]) => void
  addContact: (contact: GoogleContact) => void
  removeContact: (id: string) => void
  clearContacts: () => void
}

export const useContactsStore = create<ContactsState>()(
  persist(
    (set) => ({
      contacts: [],
      setContacts: (contacts) => set({ contacts }),
      addContact: (contact) =>
        set((state) => ({
          contacts: [...state.contacts, contact],
        })),
      removeContact: (id) =>
        set((state) => ({
          contacts: state.contacts.filter((c) => c.id !== id),
        })),
      clearContacts: () => set({ contacts: [] }),
    }),
    { name: 'contacts-store-v1' }
  )
)


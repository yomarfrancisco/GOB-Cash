'use client'

import { useEffect, useRef } from 'react'
import { syncContactsForUser } from '@/lib/contacts'
import { getFirebaseAuth } from '@/lib/firebase'
import { useUserProfileStore } from '@/store/userProfile'

type LocalContact = {
  id?: string
  name: string
  handle?: string
  phone?: string
  email?: string
  avatarUrl?: string
  tags?: string[]
}

const MIN_CONTACTS = 5
const SYNC_COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes

export const useSyncContacts = (localContacts: LocalContact[]) => {
  const auth = getFirebaseAuth()
  const shareContacts = useUserProfileStore((s) => s.profile.socialGraphShareContacts ?? true)
  const lastSyncRef = useRef<number>(0)

  useEffect(() => {
    const user = auth.currentUser
    if (!user?.uid) return
    if (!shareContacts) return
    if (!localContacts || localContacts.length < MIN_CONTACTS) return

    const now = Date.now()
    if (now - lastSyncRef.current < SYNC_COOLDOWN_MS) return

    const run = async () => {
      try {
        console.log('[ContactsSync] Syncing', localContacts.length, 'contacts')
        await syncContactsForUser(user.uid, localContacts)
        lastSyncRef.current = Date.now()
        console.log('[ContactsSync] Completed')
      } catch (err) {
        console.error('[ContactsSync] Failed', err)
      }
    }

    void run()
  }, [auth, localContacts, shareContacts])
}


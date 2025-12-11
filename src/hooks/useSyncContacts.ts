'use client'

import { useEffect, useRef } from 'react'
import { syncContactsForUser } from '@/lib/contacts'
import { getFirebaseAuth } from '@/lib/firebase'

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
  const lastSyncRef = useRef<number>(0)

  useEffect(() => {
    const user = auth.currentUser
    if (!user?.uid) {
      console.log('[ContactsSync] Skipping sync: reason=not-authed')
      return
    }
    if (!localContacts || localContacts.length < MIN_CONTACTS) {
      console.log(`[ContactsSync] Skipping sync: reason=too-few-contacts (${localContacts?.length || 0} < ${MIN_CONTACTS})`)
      return
    }

    const now = Date.now()
    if (now - lastSyncRef.current < SYNC_COOLDOWN_MS) {
      console.log('[ContactsSync] Skipping sync: reason=cooldown')
      return
    }

    const run = async () => {
      try {
        console.log(`[ContactsSync] Syncing ${localContacts.length} contacts for uid=${user.uid}`)
        await syncContactsForUser(user.uid, localContacts)
        lastSyncRef.current = Date.now()
        console.log('[ContactsSync] Completed')
      } catch (err) {
        console.error('[ContactsSync] Error:', err)
      }
    }

    void run()
  }, [auth, localContacts])
}


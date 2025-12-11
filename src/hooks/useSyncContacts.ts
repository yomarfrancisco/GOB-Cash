'use client'

import { useEffect } from 'react'
import { syncContactsForUser } from '@/lib/contacts'
import { getFirebaseAuth } from '@/lib/firebase'
import { getFirestoreDb } from '@/lib/firebase'

type LocalContact = {
  id?: string
  name: string
  handle?: string
  phone?: string
  email?: string
  avatarUrl?: string
  tags?: string[]
}

// Log Firestore project ID once per session
let hasLoggedProjectId = false

export const useSyncContacts = (localContacts: LocalContact[]) => {
  const auth = getFirebaseAuth()

  // Log hook mount and project ID (once)
  useEffect(() => {
    console.log('[ContactsSync] Hook mounted', {
      contactsLength: localContacts?.length ?? 0,
    })

    if (!hasLoggedProjectId) {
      try {
        const db = getFirestoreDb()
        const projectId = (db.app.options as any).projectId
        console.log('[ContactsSync] Using Firestore project', projectId)
        hasLoggedProjectId = true
      } catch (err) {
        console.error('[ContactsSync] Failed to get Firestore project ID', err)
      }
    }
  }, [])

  useEffect(() => {
    const user = auth.currentUser
    const uid = user?.uid

    if (!uid) {
      console.log('[ContactsSync] Skipping sync: not authed')
      return
    }

    if (!localContacts || localContacts.length === 0) {
      console.log('[ContactsSync] Skipping sync: no contacts')
      return
    }

    // For debugging: always sync on mount when authed & we have contacts
    const doSync = async () => {
      try {
        console.log('[ContactsSync] Syncing contacts', {
          uid,
          count: localContacts.length,
        })
        await syncContactsForUser(uid, localContacts)
        console.log('[ContactsSync] Completed sync for uid', uid)
      } catch (err) {
        console.error('[ContactsSync] Sync error', err)
      }
    }

    void doSync()
  }, [auth, localContacts])
}


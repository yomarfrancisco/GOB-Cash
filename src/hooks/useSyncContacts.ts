'use client'

import { useEffect } from 'react'
import { syncContactsForUser } from '@/lib/contacts'
import { getFirestoreDb } from '@/lib/firebase'
import { getFirebaseAuth } from '@/lib/firebase'
import { useAuthStore } from '@/store/auth'

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
  const { isAuthed } = useAuthStore()

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
    const contactsLength = localContacts?.length ?? 0

    // Get user from Firebase Auth when isAuthed is true
    const auth = getFirebaseAuth()
    const user = isAuthed ? auth.currentUser : null
    const uid = user?.uid

    console.log('[ContactsSync] Effect run', {
      uid,
      contactsLength,
      isAuthed,
    })

    if (!uid) {
      console.log('[ContactsSync] Skipping sync: not authed (uid missing)')
      return
    }

    if (!localContacts || localContacts.length === 0) {
      console.log('[ContactsSync] Skipping sync: no contacts')
      return
    }

    // Sync contacts (batched, incremental)
    const doSync = async () => {
      try {
        console.log('[ContactsSync] Syncing contacts', {
          uid,
          count: localContacts.length,
        })
        const result = await syncContactsForUser(uid, localContacts)
        if (result) {
          console.log('[ContactsSync] Completed sync for uid', {
            uid,
            newContacts: result.newContactsUploaded,
            totalSynced: result.totalSynced,
            hasMore: result.hasMoreToSync,
          })
        }
      } catch (err) {
        console.error('[ContactsSync] Sync error', { uid, err })
      }
    }

    void doSync()
  }, [isAuthed, localContacts])
}


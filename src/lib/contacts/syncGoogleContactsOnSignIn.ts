/**
 * Automatically sync Google Contacts on sign-in
 * 
 * This function:
 * 1. Fetches contacts from Google People API
 * 2. Populates the contacts store
 * 3. Syncs to Firestore via existing syncContactsForUser flow
 * 4. Logs to /users/{uid}/debug/contactsSyncLogs
 * 
 * Throttled: Only runs if last sync was > 24h ago
 */

import { User } from 'firebase/auth'
import { getFirestoreDb, getFirebaseAuth } from '@/lib/firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { fetchGoogleContacts } from '@/lib/google/contacts'
import { useContactsStore } from '@/store/contacts'
import { syncContactsForUser } from '@/lib/contacts'
import { getRankedContacts } from '@/lib/contacts/rankContacts'

const SYNC_THROTTLE_HOURS = 24

interface ContactsSyncLog {
  startedAt: any // Firestore Timestamp
  finishedAt?: any // Firestore Timestamp
  contactsFetchedCount: number
  contactsWrittenCount: number
  otherContactsFetchedCount: number
  errors?: string[]
  skippedReason?: string
}

/**
 * Sync Google Contacts automatically on sign-in
 * 
 * @param user - Firebase Auth User
 * @param userDocData - User document data from Firestore (must include socialGraphShareContacts)
 * @returns Promise that resolves when sync completes (or is skipped)
 */
export async function syncGoogleContactsOnSignIn(
  user: User,
  userDocData: { socialGraphShareContacts?: boolean; lastContactsSyncAt?: any } | null
): Promise<void> {
  // Check if user has enabled contact sharing
  if (!userDocData?.socialGraphShareContacts) {
    console.log('[ContactSync] Skipping: socialGraphShareContacts is false')
    return
  }

  // Check throttling (24h)
  const now = Date.now()
  const lastSyncAt = userDocData?.lastContactsSyncAt?.toMillis?.() ?? 0
  const hoursSinceLastSync = (now - lastSyncAt) / (1000 * 60 * 60)
  
  if (hoursSinceLastSync < SYNC_THROTTLE_HOURS && lastSyncAt > 0) {
    console.log(`[ContactSync] Skipping: last sync was ${hoursSinceLastSync.toFixed(1)}h ago (throttle: ${SYNC_THROTTLE_HOURS}h)`)
    return
  }

  const db = getFirestoreDb()
  const logRef = doc(db, 'users', user.uid, 'debug', 'contactsSyncLogs', Date.now().toString())
  
  const log: ContactsSyncLog = {
    startedAt: serverTimestamp(),
    contactsFetchedCount: 0,
    contactsWrittenCount: 0,
    otherContactsFetchedCount: 0,
    errors: [],
  }

  try {
    console.log('[ContactSync] Starting automatic Google Contacts sync for user', user.uid)
    
    // Get Google access token from sessionStorage (stored during sign-in)
    let accessToken: string | null = null
    if (typeof window !== 'undefined') {
      accessToken = sessionStorage.getItem('google_access_token')
    }
    
    if (!accessToken) {
      // Try to get it from the user's credential (fallback)
      const auth = getFirebaseAuth()
      const currentUser = auth.currentUser
      if (!currentUser || currentUser.uid !== user.uid) {
        throw new Error('User mismatch or not authenticated')
      }
      
      // Fallback: try to get from credential (may not work if token expired)
      accessToken = await getGoogleAccessToken(currentUser)
    }
    
    if (!accessToken) {
      throw new Error('Failed to get Google access token. Please sign out and sign in again.')
    }

    // Fetch contacts from Google People API
    const googleContacts = await fetchGoogleContacts(accessToken)
    
    // Count contacts by source
    const connectionsCount = googleContacts.filter(c => c.source === 'contacts').length
    const otherContactsCount = googleContacts.filter(c => c.source === 'otherContacts').length
    
    log.contactsFetchedCount = googleContacts.length
    log.otherContactsFetchedCount = otherContactsCount

    console.log(`[ContactSync] Fetched ${googleContacts.length} contacts from Google (${connectionsCount} connections, ${otherContactsCount} other)`)

    // Populate contacts store
    const { setContacts } = useContactsStore.getState()
    setContacts(googleContacts)

    // Convert GoogleContact[] to LocalContact[] format expected by syncContactsForUser
    // syncContactsForUser expects: { id?, name, handle?, phone?, email?, avatarUrl?, tags? }[]
    const localContacts = googleContacts.map(contact => ({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      avatarUrl: contact.photoUrl,
      // No handle or tags from Google contacts initially
    }))

    // Sync to Firestore (this will write to /users/{uid}/contacts/{contactId})
    const syncResult = await syncContactsForUser(user.uid, localContacts)
    
    if (syncResult) {
      log.contactsWrittenCount = syncResult.newContactsUploaded
      console.log(`[ContactSync] Synced ${syncResult.newContactsUploaded} new contacts to Firestore (${syncResult.totalSynced} total)`)
    } else {
      console.log('[ContactSync] No contacts to sync (all already synced or empty)')
    }

    // Update lastContactsSyncAt on user doc
    const userRef = doc(db, 'users', user.uid)
    await setDoc(userRef, { lastContactsSyncAt: serverTimestamp() }, { merge: true })

    log.finishedAt = serverTimestamp()
    await setDoc(logRef, log)
    
    console.log('[ContactSync] Automatic sync completed successfully')
  } catch (error: any) {
    console.error('[ContactSync] Automatic sync failed:', error)
    log.errors = log.errors || []
    log.errors.push(error.message || String(error))
    log.finishedAt = serverTimestamp()
    await setDoc(logRef, log).catch(err => {
      console.error('[ContactSync] Failed to write error log:', err)
    })
    // Don't throw - non-blocking error
  }
}

/**
 * Get Google OAuth access token from Firebase Auth user (fallback)
 * 
 * This is a fallback if the token wasn't stored during sign-in.
 * Firebase Auth doesn't directly expose the OAuth access token, so this may not work.
 */
async function getGoogleAccessToken(user: User): Promise<string | null> {
  try {
    const providerData = user.providerData.find(p => p.providerId === 'google.com')
    if (!providerData) {
      console.error('[ContactSync] User did not sign in with Google')
      return null
    }

    // Firebase Auth doesn't expose the OAuth access token directly
    // The token should have been stored in sessionStorage during sign-in
    // If it's not there, we can't retrieve it
    console.warn('[ContactSync] Access token not found in sessionStorage. User may need to sign in again.')
    return null
  } catch (error) {
    console.error('[ContactSync] Error getting Google access token:', error)
    return null
  }
}


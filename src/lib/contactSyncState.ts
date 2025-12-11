/**
 * Contact sync state management
 * Tracks which contacts have been synced to avoid re-uploading
 */

import { CONTACT_SYNC_LOCAL_STATE_VERSION } from '@/config/contactSync'

const keyForUser = (uid: string) =>
  `gobankless_contact_sync_${CONTACT_SYNC_LOCAL_STATE_VERSION}_${uid}`

export type ContactSyncState = {
  syncedContactIds: string[] // Stable contact IDs (from buildContactId)
  lastSyncAt?: string // ISO string timestamp
}

/**
 * Load contact sync state from localStorage
 */
export function loadContactSyncState(uid: string): ContactSyncState {
  if (typeof window === 'undefined') return { syncedContactIds: [] }

  try {
    const raw = window.localStorage.getItem(keyForUser(uid))
    if (!raw) return { syncedContactIds: [] }
    return JSON.parse(raw)
  } catch {
    return { syncedContactIds: [] }
  }
}

/**
 * Save contact sync state to localStorage
 */
export function saveContactSyncState(uid: string, state: ContactSyncState): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(keyForUser(uid), JSON.stringify(state))
  } catch {
    // Fail silently - localStorage might be disabled (private mode, etc.)
  }
}

/**
 * Clear contact sync state for a user (useful for testing or reset)
 */
export function clearContactSyncState(uid: string): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(keyForUser(uid))
  } catch {
    // Fail silently
  }
}


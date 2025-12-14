/**
 * Cloud Function: syncUserToGlobalContacts
 * 
 * Syncs user data to globalContactsPublic and globalContactsPrivate collections.
 * 
 * Triggers:
 * - Called from onUserWrite when /users/{uid} is created or updated
 * 
 * Behavior:
 * - Reads /users/{uid} to get handle, displayName, avatarUrl, email, phoneNumber
 * - Normalizes handle (strip @, ensure $ prefix)
 * - Upserts /globalContactsPublic/{handle} with public fields
 * - Upserts /globalContactsPrivate/{handle} with email/phone
 * - Merges intelligently with existing contact data
 */

import * as admin from 'firebase-admin'
import { normalizeHandle } from './utils/handleNormalization'

const db = admin.firestore()

interface UserDocument {
  userId: string
  email: string
  fullName: string | null
  displayName: string | null
  handle: string
  avatarUrl: string | null
  phoneNumber: string | null
  phoneE164: string | null
}

/**
 * Check if displayName looks generic (e.g., "User 8513")
 */
function isGenericDisplayName(displayName: string | null): boolean {
  if (!displayName) return false
  return /^User\s+\d+$/i.test(displayName.trim())
}

/**
 * Sync user to globalContactsPublic and globalContactsPrivate
 */
export async function syncUserToGlobalContacts(uid: string, userData: UserDocument): Promise<void> {
  const handle = userData.handle
  
  if (!handle || handle.trim() === '') {
    console.warn('[syncUserToGlobalContacts] User has no handle, skipping', { uid })
    return
  }

  // Normalize handle (strip @, ensure $ prefix, lowercase)
  const normalizedHandle = normalizeHandle(handle)
  if (!normalizedHandle) {
    console.warn('[syncUserToGlobalContacts] Invalid handle after normalization', { uid, handle })
    return
  }

  const now = admin.firestore.Timestamp.now()

  // 1. Upsert globalContactsPublic
  const publicRef = db.collection('globalContactsPublic').doc(normalizedHandle)
  const publicDoc = await publicRef.get()

  const publicData: any = {
    handle: normalizedHandle,
    updatedAt: now,
  }

  if (publicDoc.exists) {
    const existingData = publicDoc.data()
    
    // displayName: if incoming user has a value and existing looks generic, overwrite; otherwise use latest-updated wins
    const userDisplayName = userData.displayName || userData.fullName
    if (userDisplayName) {
      const existingDisplayName = existingData?.displayName
      if (isGenericDisplayName(existingDisplayName) || !existingDisplayName) {
        publicData.displayName = userDisplayName
      } else {
        // Use latest-updated wins (for now, prefer user's displayName if it exists)
        publicData.displayName = userDisplayName
      }
    } else if (existingData?.displayName) {
      publicData.displayName = existingData.displayName
    }

    // avatarUrl: if incoming user has a real value, overwrite existing
    if (userData.avatarUrl) {
      publicData.avatarUrl = userData.avatarUrl
    } else if (existingData?.avatarUrl) {
      publicData.avatarUrl = existingData.avatarUrl
    }

    // sources: union existing + "signup" (to distinguish from "device" contacts)
    const existingSources = new Set(existingData?.sources || [])
    existingSources.add('signup')
    publicData.sources = Array.from(existingSources)

    if (existingData?.createdAt) {
      publicData.createdAt = existingData.createdAt
    } else {
      publicData.createdAt = now
    }

    await publicRef.update(publicData)
    console.log('[syncUserToGlobalContacts] Updated globalContactsPublic', { handle: normalizedHandle, uid })
  } else {
    // New entry
    publicData.displayName = userData.displayName || userData.fullName || null
    publicData.avatarUrl = userData.avatarUrl || null
    publicData.sources = ['signup']
    publicData.createdAt = now
    await publicRef.set(publicData)
    console.log('[syncUserToGlobalContacts] Created globalContactsPublic', { handle: normalizedHandle, uid })
  }

  // 2. Upsert globalContactsPrivate (only if we have email or phone)
  const userEmail = userData.email?.trim() || ''
  const userPhone = userData.phoneE164 || userData.phoneNumber || null
  const normalizedPhone = userPhone ? userPhone.replace(/\s+/g, '').trim() : null

  if (userEmail || normalizedPhone) {
    const privateRef = db.collection('globalContactsPrivate').doc(normalizedHandle)
    const privateDoc = await privateRef.get()

    const privateData: any = {
      handle: normalizedHandle,
      updatedAt: now,
    }

    if (privateDoc.exists) {
      const existingData = privateDoc.data()

      // primaryEmail: from user email only if non-empty, never overwrite existing with empty
      if (userEmail) {
        privateData.primaryEmail = userEmail
      } else if (existingData?.primaryEmail) {
        privateData.primaryEmail = existingData.primaryEmail
      }

      // primaryPhone: from user phoneNumber only if non-empty, never overwrite existing with empty
      if (normalizedPhone) {
        privateData.primaryPhone = normalizedPhone
      } else if (existingData?.primaryPhone) {
        privateData.primaryPhone = existingData.primaryPhone
      }

      if (existingData?.createdAt) {
        privateData.createdAt = existingData.createdAt
      } else {
        privateData.createdAt = now
      }

      await privateRef.update(privateData)
      console.log('[syncUserToGlobalContacts] Updated globalContactsPrivate', { handle: normalizedHandle, uid })
    } else {
      // New entry
      if (userEmail) {
        privateData.primaryEmail = userEmail
      }
      if (normalizedPhone) {
        privateData.primaryPhone = normalizedPhone
      }
      privateData.createdAt = now
      await privateRef.set(privateData)
      console.log('[syncUserToGlobalContacts] Created globalContactsPrivate', { handle: normalizedHandle, uid })
    }
  }
}


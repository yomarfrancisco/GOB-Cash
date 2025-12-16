/**
 * User restriction helpers
 * 
 * Temporary per-user restrictions that can later be generalized
 * into a restrictedActions flag from Firestore.
 */

/**
 * Check if a user UID is restricted
 * 
 * @param uid - User UID to check
 * @returns true if the user is restricted
 */
export const isRestrictedUser = (uid?: string | null): boolean => {
  return uid === "Q7OwZCSAQcMlxEyMuGie4MSMLzZ2"
}

/**
 * Get restricted actions for a user
 * 
 * @param uid - User UID to check
 * @returns Object with action flags
 */
export const getRestrictedActions = (uid?: string | null): { inbox: boolean; cashInOut: boolean } => {
  const restricted = isRestrictedUser(uid)
  return {
    inbox: restricted,
    cashInOut: restricted,
  }
}


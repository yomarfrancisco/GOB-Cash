/**
 * Contact sync configuration
 * Controls how many contacts are synced per user and batch sizes
 */

export const CONTACT_SYNC_LIMIT_PER_USER = 600 // Overall cap (increased from 300)
export const CONTACT_SYNC_BATCH_SIZE = 100 // Contacts per async batch
export const CONTACT_SYNC_LOCAL_STATE_VERSION = 1 // Used for localStorage key versioning


/**
 * Contact sync configuration
 * Controls how many contacts are synced per user and batch sizes
 */

import { devLog } from '@/lib/logger'

export const CONTACT_SYNC_LIMIT_PER_USER = 600 // Overall cap (increased from 300)
export const CONTACT_SYNC_BATCH_SIZE = 100 // Contacts per async batch
export const CONTACT_SYNC_LOCAL_STATE_VERSION = 1 // Used for localStorage key versioning

// Log config at module load (dev only)
if (typeof window !== 'undefined') {
  devLog('[ContactSync] CONFIG', {
    limit: CONTACT_SYNC_LIMIT_PER_USER,
    batchSize: CONTACT_SYNC_BATCH_SIZE,
  })
}


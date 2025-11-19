import type { ActorIdentity } from '@/store/notifications'
import { useUserProfileStore } from '@/store/userProfile'

// High-quality GoB admin avatar (pink + white logo)
const GOB_ADMIN_AVATAR = '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
// Co-op uses the same high-quality logo (can be recolored later if needed)
const CO_OP_AVATAR = GOB_ADMIN_AVATAR
const AI_MANAGER_AVATAR = '/assets/Brics-girl-blue.png'
const MEMBER_DEFAULT = '/assets/avatar_agent5.png' // Updated to use new high-quality avatars

/**
 * Resolves the avatar URL for a given actor identity.
 * Maps identity types to their default avatars, with fallbacks.
 */
export function resolveAvatarForActor(actor?: ActorIdentity): string {
  if (!actor) {
    // Fallback – generic app avatar (co-op)
    return CO_OP_AVATAR
  }

  // If actor has explicit avatar, use it
  if (actor.avatar) return actor.avatar

  // Otherwise, use identity-based defaults
  switch (actor.type) {
    case 'ai_manager':
      return AI_MANAGER_AVATAR

    case 'co_op':
      return CO_OP_AVATAR

    case 'system':
      // System uses admin avatar
      return GOB_ADMIN_AVATAR

    case 'member':
      // Fallback for member if none provided – use new agent avatar
      return MEMBER_DEFAULT

    case 'user':
    default:
      // Let user profile logic override this where we have a real avatar
      const userProfile = useUserProfileStore.getState().profile
      return userProfile.avatarUrl || GOB_ADMIN_AVATAR
  }
}

/**
 * Check if an actor is the AI manager
 */
export function isAiManager(actor?: ActorIdentity): boolean {
  return actor?.type === 'ai_manager'
}


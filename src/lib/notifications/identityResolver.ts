import type { ActorIdentity } from '@/store/notifications'
import { useUserProfileStore } from '@/store/userProfile'
import {
  MOZPAGA_ADMIN_AVATAR,
  resolveAdminAvatarUrl,
  USER_PLACEHOLDER_AVATAR,
} from '@/lib/avatarAssets'

export {
  GOB_ADMIN_AVATAR,
  MOZPAGA_ADMIN_AVATAR,
  resolveAdminAvatarUrl,
  USER_PLACEHOLDER_AVATAR,
} from '@/lib/avatarAssets'
export { isUserPlaceholderAvatar } from '@/lib/avatarAssets'

const CO_OP_AVATAR = MOZPAGA_ADMIN_AVATAR
/** Desk / routing agent faces stay on their assigned assets; this is only the generic ai_manager fallback. */
const AI_MANAGER_AVATAR = '/assets/avatar_agent1.png'

/**
 * Resolves the avatar URL for a given actor identity.
 * Maps identity types to their default avatars, with fallbacks.
 * Admin/system/co-op → grey Benjamin (same as Routing Manager). Agent-assigned faces are unchanged.
 */
export function resolveAvatarForActor(actor?: ActorIdentity): string {
  if (!actor) {
    return CO_OP_AVATAR
  }

  // Remap baked-in mozpaga-admin.png; agent-assigned faces pass through unchanged.
  if (actor.avatar) return resolveAdminAvatarUrl(actor.avatar)

  switch (actor.type) {
    case 'ai_manager':
      return AI_MANAGER_AVATAR

    case 'co_op':
      return CO_OP_AVATAR

    case 'system':
      return MOZPAGA_ADMIN_AVATAR

    case 'member':
    case 'user':
    default: {
      const userProfile = useUserProfileStore.getState().profile
      if (actor.type === 'user' && userProfile.avatarUrl) {
        return userProfile.avatarUrl
      }
      return USER_PLACEHOLDER_AVATAR
    }
  }
}

/**
 * Check if an actor is the AI manager
 */
export function isAiManager(actor?: ActorIdentity): boolean {
  return actor?.type === 'ai_manager'
}

import type { ActorIdentity } from '@/store/notifications'
import { useUserProfileStore } from '@/store/userProfile'
import {
  MOZPAGA_ADMIN_AVATAR,
  USER_PLACEHOLDER_AVATAR,
} from '@/lib/avatarAssets'

export { GOB_ADMIN_AVATAR, MOZPAGA_ADMIN_AVATAR, USER_PLACEHOLDER_AVATAR } from '@/lib/avatarAssets'
export { isUserPlaceholderAvatar } from '@/lib/avatarAssets'

const CO_OP_AVATAR = MOZPAGA_ADMIN_AVATAR
const AI_MANAGER_AVATAR = '/assets/Brics-girl-blue.png'

/**
 * Resolves the avatar URL for a given actor identity.
 * Maps identity types to their default avatars, with fallbacks.
 */
export function resolveAvatarForActor(actor?: ActorIdentity): string {
  if (!actor) {
    return CO_OP_AVATAR
  }

  if (actor.avatar) return actor.avatar

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

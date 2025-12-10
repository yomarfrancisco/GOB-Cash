/**
 * Reusable auth guard hook
 * Wraps useAuthStore to provide a consistent guard function for all interactive handlers
 */
import { useAuthStore } from '@/store/auth'

/**
 * Returns a guard function that checks authentication before executing a callback
 * If user is not authenticated, opens the auth sheet and returns early
 * If user is authenticated, executes the callback
 */
export function useRequireAuth() {
  const { isAuthed, requireAuth } = useAuthStore()

  const guardAuthed = (fn?: () => void) => {
    if (!isAuthed) {
      requireAuth(() => {
        // After auth, execute the callback if provided
        fn?.()
      })
      return
    }
    fn?.()
  }

  return { guardAuthed, isAuthed, requireAuth }
}


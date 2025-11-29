// Haptic feedback utility for supported devices
export function triggerLongPressHaptic() {
  if (typeof window === 'undefined') return

  const nav = window.navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }

  // Only proceed if vibrate is available
  if (!nav.vibrate) return

  try {
    // Short, subtle vibration pattern
    nav.vibrate(10) // 10ms vibration
  } catch {
    // Fail silently – haptics are best-effort only
  }
}


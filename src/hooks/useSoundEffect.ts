import { useCallback, useRef } from 'react'

export function useSoundEffect(src: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const play = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(src)
      }

      // rewind to start so rapid taps work
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {
        // ignore iOS autoplay restrictions — this is inside a tap anyway
      })
    } catch (err) {
      console.warn('[SOUND] Failed to play:', err)
    }
  }, [src])

  return { play }
}


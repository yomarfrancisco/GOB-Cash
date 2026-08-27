type QrDetector = {
  detect: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>
}

async function createQrDetector(): Promise<QrDetector> {
  const BarcodeDetectorCtor = (typeof window !== 'undefined'
    ? (window as unknown as { BarcodeDetector?: new (options?: { formats: string[] }) => {
        detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
      } }).BarcodeDetector
    : undefined)

  if (typeof BarcodeDetectorCtor === 'function') {
    try {
      const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] })
      return {
        detect: async (video) => {
          const codes = await detector.detect(video)
          const value = codes[0]?.rawValue?.trim()
          return value || null
        },
      }
    } catch {
      // Fall through to jsQR
    }
  }

  const { default: jsQR } = await import('jsqr')
  return {
    detect: async (video, canvas) => {
      if (video.videoWidth < 16 || video.videoHeight < 16) return null
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(video, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      })
      return code?.data?.trim() || null
    },
  }
}

/**
 * Poll `video` for a QR payload until `isCancelled()` is true.
 * Calls `onDetect` once per unique value.
 */
export function startQrScanLoop(options: {
  video: HTMLVideoElement
  onDetect: (text: string) => void
  isCancelled: () => boolean
}): () => void {
  const canvas = document.createElement('canvas')
  let rafId = 0
  let busy = false
  let lastValue = ''
  let detectorPromise: Promise<QrDetector> | null = null

  const tick = () => {
    if (options.isCancelled()) return
    rafId = window.requestAnimationFrame(tick)
    if (busy || options.video.readyState < 2) return

    busy = true
    if (!detectorPromise) detectorPromise = createQrDetector()

    detectorPromise
      .then((detector) => detector.detect(options.video, canvas))
      .then((text) => {
        if (!text || options.isCancelled() || text === lastValue) return
        lastValue = text
        options.onDetect(text)
      })
      .catch(() => {
        // Keep scanning; a single failed frame is not fatal.
      })
      .finally(() => {
        busy = false
      })
  }

  rafId = window.requestAnimationFrame(tick)
  return () => window.cancelAnimationFrame(rafId)
}

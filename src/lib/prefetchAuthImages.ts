/**
 * Prefetch auth background images to improve perceived load speed
 * Called when auth is about to open (hover, tap, or modal open)
 */

const AUTH_IMAGES = [
  '/assets/sign up - first contact.png',
  '/assets/sign_up - phone2.png',
] as const

let prefetched = false

/**
 * Prefetch auth background images using browser's native prefetch
 * This is lightweight and doesn't block rendering
 */
export function prefetchAuthImages() {
  if (prefetched) return // Only prefetch once per session
  
  // Use browser's native link prefetch for optimal performance
  AUTH_IMAGES.forEach((src) => {
    // Check if link already exists
    const existingLink = document.querySelector(`link[rel="prefetch"][href*="${src}"]`)
    if (existingLink) return
    
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.as = 'image'
    // Next.js will serve the optimized version (AVIF/WebP) automatically
    link.href = src
    document.head.appendChild(link)
  })
  
  prefetched = true
}

/**
 * Reset prefetch state (useful for testing)
 */
export function resetPrefetchState() {
  prefetched = false
}


/**
 * Prefetch ActionSheet icons to improve perceived load speed
 * Called at page load to ensure icons are ready when share sheet opens
 * 
 * Client-only, idempotent, non-blocking prefetch using native DOM API
 */

const ACTION_SHEET_ICONS = [
  '/assets/Tether.png', // USDT icon for ActionSheet
] as const

// Idempotency: check both module scope and sessionStorage
let prefetched = false
const PREFETCH_KEY = 'actionsheet-icons-prefetched'

/**
 * Prefetch ActionSheet icons using browser's native prefetch
 * This is lightweight, non-blocking, and idempotent
 * 
 * Client-only: guards SSR with typeof document check
 */
export function prefetchActionSheetIcons() {
  // Guard SSR - this is client-only
  if (typeof document === 'undefined') {
    return
  }
  
  // Check module scope
  if (prefetched) return
  
  // Check sessionStorage (survives page navigation within session)
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PREFETCH_KEY)) {
    prefetched = true
    return
  }
  
  // Use browser's native link prefetch for optimal performance
  ACTION_SHEET_ICONS.forEach((src) => {
    // Check if link already exists in DOM
    const existingLink = document.querySelector(`link[rel="prefetch"][href*="${src}"]`)
    if (existingLink) return
    
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.as = 'image' // Important: tells browser this is an image
    
    // Use fetchPriority="low" if supported (optional, safe)
    if ('fetchPriority' in link) {
      ;(link as HTMLLinkElement & { fetchPriority?: string }).fetchPriority = 'low'
    }
    
    link.href = src
    document.head.appendChild(link)
  })
  
  // Mark as prefetched
  prefetched = true
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(PREFETCH_KEY, 'true')
  }
}

/**
 * Reset prefetch state (useful for testing)
 */
export function resetActionSheetIconsPrefetchState() {
  // Guard SSR
  if (typeof document === 'undefined') {
    return
  }
  
  prefetched = false
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(PREFETCH_KEY)
  }
  // Remove prefetch links from DOM
  ACTION_SHEET_ICONS.forEach((src) => {
    const link = document.querySelector(`link[rel="prefetch"][href*="${src}"]`)
    if (link) {
      link.remove()
    }
  })
}


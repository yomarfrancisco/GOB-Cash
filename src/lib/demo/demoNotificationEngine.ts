/**
 * Demo Notification Engine
 * Simulates a smart, social, cross-border bank with AI protection and community activity
 * Only runs when NEXT_PUBLIC_DEMO_MODE === 'true'
 */

import type { NotificationItem } from '@/store/notifications'
import { 
  useAiFabHighlightStore, 
  shouldHighlightAiFab,
  shouldHighlightArielFab,
} from '@/state/aiFabHighlight'
import { CHARACTERS } from '@/lib/demo/templates/characters'
import { getDemoConfig, DEMO_NOTIFICATION_CONFIG } from './demoConfig'
import { 
  getNextDemoNotification, 
  resetDemoState 
} from './templates/notificationSelection'

// Feature flag: v2 notifications enabled by default unless explicitly disabled
const USE_V2_NOTIFICATIONS = process.env.NEXT_PUBLIC_V2_NOTIFICATIONS !== 'false'

type NotificationInput = Omit<NotificationItem, 'id' | 'timestamp'>

type DemoEngineOptions = {
  userHandle?: string
  onMapPan?: (lat: number, lng: number) => void
  onCardAnimation?: (type: 'ai_trade' | 'portfolio_rebalanced') => void
}

let demoInterval: NodeJS.Timeout | null = null
let lastNotificationTime = 0
let notificationCount = 0
let windowStartTime = Date.now()
let engineStartTime = Date.now()
let currentIsAuthed = false // Track auth state for config

// Demo event templates - aligned with smart, social, cross-border bank identity
const demoEvents: NotificationInput[] = [
  // AI Manager events - Smart: AI defending purchasing power
  {
    kind: 'ai_trade',
    title: 'AI reduced market risk',
    action: 'Shifted R250 to stable assets.',
    reason: 'Crypto volatility detected. Protecting your balance.',
    amount: { currency: 'ZAR', value: -250 },
    direction: 'down',
    actor: { type: 'ai_manager' },
    routeOnTap: '/transactions',
  },
  {
    kind: 'ai_trade',
    title: 'AI moved funds to safety',
    action: 'Moved R180 to cash reserves.',
    reason: 'Volatility in ZAR/MZN — holding steady.',
    amount: { currency: 'ZAR', value: -180 },
    direction: 'down',
    actor: { type: 'ai_manager' },
  },
  {
    kind: 'ai_trade',
    title: 'AI rebalanced for growth',
    action: 'Moved R150 back to earning yield.',
    reason: 'Market stable. Resuming normal allocation.',
    amount: { currency: 'ZAR', value: 150 },
    direction: 'up',
    actor: { type: 'ai_manager' },
  },
  {
    kind: 'ai_trade',
    title: 'AI protection triggered',
    action: 'Protected R320 from market drop.',
    reason: 'Market stress detected. Funds secured.',
    amount: { currency: 'ZAR', value: -320 },
    direction: 'down',
    actor: { type: 'ai_manager' },
  },

  // Social: Cross-border payments and remittances
  {
    kind: 'payment_received',
    title: 'Cross-border transfer received',
    body: 'You received R450 from Mozambique.',
    amount: { currency: 'ZAR', value: 450 },
    direction: 'up',
    actor: {
      type: 'member',
      id: 'demo-member-1',
      name: 'Member',
      handle: '@member1',
      avatar: '/assets/avatar_agent5.png',
    },
    map: { lat: -25.9692, lng: 32.5732, markerId: 'member-moz' }, // Maputo
  },
  {
    kind: 'payment_sent',
    title: 'Cross-border payment sent',
    body: 'You sent R280 to Zimbabwe. Payment complete.',
    amount: { currency: 'ZAR', value: -280 },
    direction: 'down',
    actor: { type: 'user' },
  },
  {
    kind: 'payment_received',
    title: 'Payment received',
    body: 'R320 from @member2',
    amount: { currency: 'ZAR', value: 320 },
    direction: 'up',
    actor: {
      type: 'member',
      id: 'demo-member-2',
      name: 'Member',
      handle: '@member2',
      avatar: '/assets/avatar_agent13.png',
    },
  },
  {
    kind: 'sponsorship',
    title: 'Now backing @thabo',
    body: 'R150/week committed. You earn when they move cash.',
    amount: { currency: 'ZAR', value: -150 },
    direction: 'down',
    actor: { type: 'user' },
  },

  // Bank: Deposits, withdrawals, transfers
  {
    kind: 'payment_received',
    title: 'Cash deposit secured',
    body: 'Your R500 cash deposit is confirmed.',
    amount: { currency: 'ZAR', value: 500 },
    direction: 'up',
    actor: { type: 'system', name: 'GoBankless' },
  },
  {
    kind: 'transfer',
    title: 'Card top-up completed',
    body: 'You moved R300 into your MZN card.',
    amount: { currency: 'ZAR', value: -300 },
    direction: 'down',
    actor: { type: 'user' },
  },
  {
    kind: 'transfer',
    title: 'Transfer completed',
    body: 'You topped up your ZAR card with R200.',
    amount: { currency: 'ZAR', value: -200 },
    direction: 'down',
    actor: { type: 'user' },
  },
  {
    kind: 'transfer',
    title: 'Transfer completed',
    body: 'You moved R180 into your Crypto Card.',
    amount: { currency: 'ZAR', value: -180 },
    direction: 'down',
    actor: { type: 'user' },
  },

  // Social proximity (anonymous, privacy-respecting)
  {
    kind: 'payment_received',
    title: 'Community activity',
    body: 'Someone nearby just made a cross-border transfer.',
    actor: { type: 'system', name: 'GoBankless' },
  },
  {
    kind: 'payment_received',
    title: 'Local activity',
    body: 'Users around you have sent R1,200 today.',
    actor: { type: 'system', name: 'GoBankless' },
  },
]

/**
 * Get a random event from the demo events pool
 * Uses v2 template system if enabled, otherwise falls back to v1
 */
function getRandomEvent(secondsSinceStart: number, isAuthed: boolean): NotificationInput {
  // Try v2 notification system first
  if (USE_V2_NOTIFICATIONS) {
    try {
      // FIX 1: Filter out ai_trade notifications - retry if we get one
      let template = getNextDemoNotification(isAuthed)
      let retries = 0
      const MAX_RETRIES = 10
      
      // Keep retrying until we get a non-ai_trade notification (or max retries)
      while (template.kind === 'ai_trade' && retries < MAX_RETRIES) {
        template = getNextDemoNotification(isAuthed)
        retries++
      }
      
      // If we still got ai_trade after retries, fall through to v1
      if (template.kind === 'ai_trade') {
        console.warn('[DemoNotificationEngine] Could not get non-ai_trade notification from v2, falling back to v1')
        // Fall through to v1 logic
      } else {
        // Convert template to notification format
        const notification: NotificationInput = {
          kind: template.kind,
          title: template.title,
          body: template.body,
          action: template.action,
          reason: template.reason,
          amount: template.amount ? {
            currency: template.amount.currency,
            value: template.amount.baseValue // Convert baseValue to value
          } : undefined,
          direction: template.amount?.direction,
          actor: template.actor,
          map: template.map,
          routeOnTap: template.routeOnTap
        }
        
        return notification
      }
    } catch (error) {
      console.error('V2 notification error, falling back to v1:', error)
      // Fall through to v1 logic
    }
  }
  
  // V1 fallback: Filter out ai_trade events (AI Action Cycle handles these)
  // In first 8 seconds, prioritize other events to establish narrative
  const isEarly = secondsSinceStart < 8
  const nonAiEvents = demoEvents.filter((e) => e.kind !== 'ai_trade')
  
  // If no non-AI events available, fall back to all events (shouldn't happen)
  const availableEvents = nonAiEvents.length > 0 ? nonAiEvents : demoEvents.filter((e) => e.kind !== 'ai_trade')
  
  let event: NotificationInput
  
  if (availableEvents.length > 0) {
    // Pick from non-AI events only
    event = { ...availableEvents[Math.floor(Math.random() * availableEvents.length)] }
  } else {
    // Last resort: return a default payment event if somehow all events are filtered
    event = {
      kind: 'payment_received',
      title: 'Payment received',
      body: 'R100 received',
      amount: { currency: 'ZAR', value: 100 },
      direction: 'up',
      actor: { type: 'system' },
    }
  }
  
  // Randomize amounts slightly (±10%)
  if (event.amount) {
    const variance = 0.9 + Math.random() * 0.2 // 0.9 to 1.1
    event.amount = {
      ...event.amount,
      value: Math.round(event.amount.value * variance * 100) / 100,
    }
  }

  return event
}

/**
 * Check if we can send a notification (rate limiting)
 */
function canSendNotification(): boolean {
  const intensity = getDemoConfig(currentIsAuthed)
  const config = DEMO_NOTIFICATION_CONFIG[intensity]
  const now = Date.now()
  
  // Reset window if rate limit period has passed
  if (now - windowStartTime >= config.RATE_LIMIT_MS) {
    notificationCount = 0
    windowStartTime = now
  }

  // Check if we've hit the limit
  if (notificationCount >= config.MAX_NOTIFICATIONS_PER_WINDOW) {
    return false
  }

  return true
}

/**
 * Start the demo notification engine
 */
export function startDemoNotificationEngine(
  pushNotification: (notification: NotificationInput) => void,
  options: DemoEngineOptions = {},
  isAuthed: boolean = false
): void {
  if (demoInterval) {
    stopDemoNotificationEngine()
  }

  currentIsAuthed = isAuthed
  const intensity = getDemoConfig(isAuthed)
  const config = DEMO_NOTIFICATION_CONFIG[intensity]
  engineStartTime = Date.now()
  
  // Reset v2 state when demo starts
  if (USE_V2_NOTIFICATIONS) {
    resetDemoState()
  }
  
  const scheduleNext = () => {
    // Use config-based random interval
    const INTERVAL_MS = config.INTERVAL_MIN_MS + Math.random() * (config.INTERVAL_MAX_MS - config.INTERVAL_MIN_MS)
    demoInterval = setTimeout(() => {
      // Re-check intensity in case auth state changed
      const currentIntensity = getDemoConfig(currentIsAuthed)
      const currentConfig = DEMO_NOTIFICATION_CONFIG[currentIntensity]
      
      if (canSendNotification()) {
        const secondsSinceStart = (Date.now() - engineStartTime) / 1000
        let event = getRandomEvent(secondsSinceStart, currentIsAuthed)
        
        // FIX 1: Filter out ai_trade notifications - AI Action Cycle handles these with real card animations
        // Skip this notification and schedule the next one if it's an ai_trade
        if (event.kind === 'ai_trade') {
          scheduleNext()
          return
        }
        
        // Trigger map pan for member events with coordinates
        if (event.map && options.onMapPan) {
          options.onMapPan(event.map.lat, event.map.lng)
        }

        // Check if $ariel notification should trigger FAB highlight
        // Avoid spamming: only trigger if not already highlighted
        const { isHighlighted, triggerAiFabHighlight } = useAiFabHighlightStore.getState()
        if (
          !isHighlighted &&
          shouldHighlightArielFab(event.actor, event.amount?.value)
        ) {
          triggerAiFabHighlight({
            reason: 'ariel-high-volume',
            amountZar: event.amount?.value,
            avatar: CHARACTERS.ariel.avatar,
          })
        }

        // Push the notification
        pushNotification(event)
        
        notificationCount++
        lastNotificationTime = Date.now()
      }

      // Schedule next event with current config
      scheduleNext()
    }, INTERVAL_MS)
  }

  // Start the first event after config-based initial delay
  setTimeout(() => {
    scheduleNext()
  }, config.INITIAL_DELAY_MS)
}

/**
 * Update auth state for notification engine (call when auth state changes)
 */
export function updateDemoNotificationAuthState(isAuthed: boolean): void {
  currentIsAuthed = isAuthed
}

/**
 * Stop the demo notification engine
 */
export function stopDemoNotificationEngine(): void {
  if (demoInterval) {
    clearTimeout(demoInterval)
    demoInterval = null
  }
  notificationCount = 0
  windowStartTime = Date.now()
  engineStartTime = Date.now()
}

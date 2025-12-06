/**
 * Demo Notification Engine
 * Simulates a smart, social, cross-border bank with AI protection and community activity
 * Only runs when NEXT_PUBLIC_DEMO_MODE === 'true'
 */

import type { NotificationItem } from '@/store/notifications'
import { useAiFabHighlightStore, shouldHighlightAiFab } from '@/state/aiFabHighlight'
import { getDemoConfig, DEMO_NOTIFICATION_CONFIG } from './demoConfig'

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
      avatar: '/assets/avatar_agent6.png',
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
 * Prioritizes AI events in the first 5-8 seconds for "catching up" narrative
 */
function getRandomEvent(secondsSinceStart: number): NotificationInput {
  // In first 8 seconds, 60% chance of AI event to establish "AI is working" narrative
  const isEarly = secondsSinceStart < 8
  const shouldPrioritizeAI = isEarly && Math.random() < 0.6
  
  let event: NotificationInput
  
  if (shouldPrioritizeAI) {
    // Pick from AI events only
    const aiEvents = demoEvents.filter((e) => e.actor?.type === 'ai_manager')
    event = { ...aiEvents[Math.floor(Math.random() * aiEvents.length)] }
  } else {
    // Pick from all events
    event = { ...demoEvents[Math.floor(Math.random() * demoEvents.length)] }
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
  
  const scheduleNext = () => {
    // Use config-based random interval
    const INTERVAL_MS = config.INTERVAL_MIN_MS + Math.random() * (config.INTERVAL_MAX_MS - config.INTERVAL_MIN_MS)
    demoInterval = setTimeout(() => {
      // Re-check intensity in case auth state changed
      const currentIntensity = getDemoConfig(currentIsAuthed)
      const currentConfig = DEMO_NOTIFICATION_CONFIG[currentIntensity]
      
      if (canSendNotification()) {
        const secondsSinceStart = (Date.now() - engineStartTime) / 1000
        const event = getRandomEvent(secondsSinceStart)
        
        // Trigger map pan for member events with coordinates
        if (event.map && options.onMapPan) {
          options.onMapPan(event.map.lat, event.map.lng)
        }

        // Trigger card animation for AI trades
        if (event.kind === 'ai_trade' && options.onCardAnimation) {
          options.onCardAnimation('ai_trade')
        }

        // Push the notification
        pushNotification(event)
        
        // Trigger FAB highlight for "important" AI trades in demo mode
        if (event.kind === 'ai_trade' && event.amount) {
          const amountZar = Math.abs(event.amount.value)
          if (shouldHighlightAiFab(amountZar)) {
            const { triggerAiFabHighlight } = useAiFabHighlightStore.getState()
            triggerAiFabHighlight({
              reason: event.reason,
              amountZar: amountZar,
            })
          }
        }
        
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

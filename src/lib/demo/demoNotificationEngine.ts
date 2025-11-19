/**
 * Demo Notification Engine
 * Simulates a "crowded house" co-op with multiple identities generating notifications
 * Only runs when NEXT_PUBLIC_DEMO_MODE === 'true'
 */

import type { NotificationItem } from '@/store/notifications'
import { useAiFabHighlightStore, shouldHighlightAiFab } from '@/state/aiFabHighlight'

type NotificationInput = Omit<NotificationItem, 'id' | 'timestamp'>

type DemoEngineOptions = {
  userHandle?: string
  onMapPan?: (lat: number, lng: number) => void
  onCardAnimation?: (type: 'ai_trade' | 'portfolio_rebalanced') => void
}

let demoInterval: NodeJS.Timeout | null = null
let lastNotificationTime = 0
const RATE_LIMIT_MS = 20000 // 20 seconds
const MAX_NOTIFICATIONS_PER_WINDOW = 3
let notificationCount = 0
let windowStartTime = Date.now()
let engineStartTime = Date.now()

// Demo event templates - refined for "catching up with the world" narrative
const demoEvents: NotificationInput[] = [
  // AI Manager events - appear early to show AI is already working
  {
    kind: 'ai_trade',
    title: 'AI trade executed',
    action: 'Rebalanced 10.11 PEPE → ETH (R183.09).',
    reason: 'Keeping your co-op portfolio aligned with current trends.',
    amount: { currency: 'ZAR', value: -183.09 },
    direction: 'down',
    actor: { type: 'ai_manager' },
    routeOnTap: '/transactions',
  },
  {
    kind: 'ai_trade',
    title: 'AI manager reduced risk',
    action: 'Shifted R250 from PEPE to cash.',
    reason: 'Short-term volatility detected; raising cash buffer.',
    amount: { currency: 'ZAR', value: -250 },
    direction: 'down',
    actor: { type: 'ai_manager' },
  },
  {
    kind: 'ai_trade',
    title: 'AI trade executed',
    action: 'Bought 5.2 PEPE (R94.20).',
    reason: 'Market conditions favor this adjustment.',
    amount: { currency: 'ZAR', value: -94.2 },
    direction: 'down',
    actor: { type: 'ai_manager' },
  },
  {
    kind: 'ai_trade',
    title: 'AI manager preparing',
    body: 'Setting up your community wallet...',
    actor: { type: 'ai_manager' },
  },

  // Co-op events - show the co-op is active
  {
    kind: 'payment_received',
    title: 'Co-op contribution',
    body: '3 members added R270 to the shared wallet.',
    amount: { currency: 'ZAR', value: 270 },
    direction: 'up',
    actor: { type: 'co_op', name: 'GoBankless Co-op' },
    map: { lat: -26.1069, lng: 28.0567, markerId: 'co-op-sandton' }, // Sandton-ish
  },
  {
    kind: 'payment_received',
    title: 'Co-op crossed R12,500',
    body: 'Your community reached R12,500 toward its goal.',
    amount: { currency: 'ZAR', value: 500 },
    direction: 'up',
    actor: { type: 'co_op', name: 'GoBankless Co-op' },
  },
  {
    kind: 'payment_received',
    title: 'Co-op opened new cell',
    body: 'Co-op opened a new cell in Maputo CBD.',
    actor: { type: 'co_op', name: 'GoBankless Co-op' },
    map: { lat: -25.9692, lng: 32.5732, markerId: 'co-op-maputo' }, // Maputo
  },

  // Member events - with map coordinates for panning (using new high-quality avatars)
  {
    kind: 'payment_received',
    title: 'Naledi added R200',
    body: 'Naledi added R200 from Johannesburg.',
    amount: { currency: 'ZAR', value: 200 },
    direction: 'up',
    actor: {
      type: 'member',
      id: 'demo-naledi',
      name: 'Naledi',
      handle: '@naledi',
      avatar: '/assets/avatar_agent5.png',
    },
    map: { lat: -26.2041, lng: 28.0473, markerId: 'member-naledi-jhb' }, // Johannesburg
  },
  {
    kind: 'payment_sent',
    title: 'João cashed out R350',
    body: 'João cashed out R350 in Maputo.',
    amount: { currency: 'ZAR', value: -350 },
    direction: 'down',
    actor: {
      type: 'member',
      id: 'demo-joao',
      name: 'João',
      handle: '@joao',
      avatar: '/assets/avatar_agent6.png',
    },
    map: { lat: -25.9692, lng: 32.5732, markerId: 'member-joao-maputo' }, // Maputo
  },
  {
    kind: 'payment_received',
    title: 'Thabo added R150',
    body: 'Thabo added R150 to the co-op from Cape Town.',
    amount: { currency: 'ZAR', value: 150 },
    direction: 'up',
    actor: {
      type: 'member',
      id: 'demo-thabo',
      name: 'Thabo',
      handle: '@thabo',
      avatar: '/assets/avatar_agent7.png',
    },
    map: { lat: -33.9249, lng: 18.4241, markerId: 'member-thabo-cpt' }, // Cape Town
  },
  {
    kind: 'payment_received',
    title: 'Sarah added R180',
    body: 'Sarah added R180 from Durban.',
    amount: { currency: 'ZAR', value: 180 },
    direction: 'up',
    actor: {
      type: 'member',
      id: 'demo-sarah',
      name: 'Sarah',
      handle: '@sarah',
      avatar: '/assets/avatar_agent8.png',
    },
    map: { lat: -29.8587, lng: 31.0218, markerId: 'member-sarah-dbn' }, // Durban
  },

  // User events (only show if user has done something)
  {
    kind: 'payment_sent',
    title: 'You paid R120 to @thando',
    body: 'You paid R120 to @thando for materials.',
    amount: { currency: 'ZAR', value: -120 },
    direction: 'down',
    actor: { type: 'user' },
  },
  {
    kind: 'transfer',
    title: 'You topped up R300',
    body: 'You topped up R300 into your MZN card.',
    amount: { currency: 'ZAR', value: -300 },
    direction: 'down',
    actor: { type: 'user' },
  },
  {
    kind: 'payment_sent',
    title: 'You supported the co-op',
    body: 'You sent R150 to the co-op wallet.',
    amount: { currency: 'ZAR', value: -150 },
    direction: 'down',
    actor: { type: 'user' },
  },

  // System events
  {
    kind: 'payment_failed',
    title: 'Temporary network issue',
    body: 'We retried a trade due to a network hiccup.',
    actor: { type: 'system', name: 'System' },
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
  const now = Date.now()
  
  // Reset window if 20 seconds have passed
  if (now - windowStartTime >= RATE_LIMIT_MS) {
    notificationCount = 0
    windowStartTime = now
  }

  // Check if we've hit the limit
  if (notificationCount >= MAX_NOTIFICATIONS_PER_WINDOW) {
    return false
  }

  return true
}

/**
 * Start the demo notification engine
 */
export function startDemoNotificationEngine(
  pushNotification: (notification: NotificationInput) => void,
  options: DemoEngineOptions = {}
): void {
  if (demoInterval) {
    stopDemoNotificationEngine()
  }

  engineStartTime = Date.now()
  
  const scheduleNext = () => {
    // Random interval between 4-9 seconds
    const delay = 4000 + Math.random() * 5000
    demoInterval = setTimeout(() => {
      if (canSendNotification()) {
        const secondsSinceStart = (Date.now() - engineStartTime) / 1000
        const event = getRandomEvent(secondsSinceStart)
        
        // Trigger map pan for member/co-op events with coordinates
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

      // Schedule next event
      scheduleNext()
    }, delay)
  }

  // Start the first event after a short delay (2 seconds)
  setTimeout(() => {
    scheduleNext()
  }, 2000)
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


/**
 * Dev helper functions for testing notifications
 * Usage: window.debugNotify('payment_sent')
 * Usage: window.debugAiExamples() - shows 3 example AI trade notifications
 * Usage: window.debugSeedActivity() - seeds activity store with sample items
 */

import { useNotificationStore } from '@/store/notifications'
import { useActivityStore } from '@/store/activity'
import { useAuthStore } from '@/store/auth'

export function setupDevNotificationHelpers() {
  if (typeof window === 'undefined') return

  const store = useNotificationStore.getState()
  const isAuthed = useAuthStore.getState().isAuthed

  // Auto-fire identity examples once per session in non-production builds
  // BUT only if demo mode is NOT enabled (demo mode handles its own notifications)
  // AND user is NOT authenticated (post-signin: never fire)
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_DEMO_MODE !== 'true' &&
    !isAuthed &&
    !(window as any).__debugIdentitiesFired
  ) {
    // Mark as fired to prevent duplicate calls
    ;(window as any).__debugIdentitiesFired = true

    // Fire after a short delay to ensure app is fully loaded
    setTimeout(() => {
      const push = store.pushNotification

      // 1. Me / user
      push({
        kind: 'payment_sent',
        title: 'You paid R120 to @member1',
        body: 'Payment complete.',
        actor: { type: 'user' },
      })

      // 2. AI manager
      push({
        kind: 'ai_trade',
        title: 'AI reduced market risk',
        action: 'Shifted R250 to stable assets.',
        reason: 'Fragility increased in crypto markets; preserving purchasing power.',
        actor: { type: 'ai_manager' },
      })

      // 3. Cross-border payment
      push({
        kind: 'payment_received',
        title: 'Cross-border transfer received',
        body: 'You received R450 from Mozambique.',
        actor: { type: 'system', name: 'GoBankless' },
      })

      // 4. Member
      push({
        kind: 'payment_received',
        title: 'You received R320',
        body: 'Payment from @member2 received.',
        actor: {
          type: 'member',
          id: 'demo-member',
          name: 'Member',
          handle: '@member2',
          avatar: '/assets/avatar_agent2.png',
        },
      })

      // 5. System
      push({
        kind: 'payment_failed',
        title: 'Network issue',
        body: "We'll retry your payment in a moment.",
        actor: { type: 'system', name: 'System' },
      })
    }, 1000) // 1 second delay to ensure UI is ready
  }

  // @ts-ignore
  window.debugNotify = (kind: string, options?: Partial<any>) => {
    const baseNotification = {
      kind: kind as any,
      title: 'Test Notification',
      body: 'This is a test notification body.',
      actor: {
        type: 'user' as const,
      },
      routeOnTap: '/transactions',
    }

    const examples: Record<string, any> = {
      payment_sent: {
        ...baseNotification,
        kind: 'payment_sent',
        title: 'Payment sent',
        body: "You sent R100 to recipient@email.com for 'Deposit for the next batch. Thanx.'",
        amount: { currency: 'ZAR', value: -100 },
        direction: 'down',
      },
      payment_received: {
        ...baseNotification,
        kind: 'payment_received',
        title: 'Payment received',
        body: 'sender@email.com sent you R100 for "[reference]"',
        amount: { currency: 'ZAR', value: 100 },
        direction: 'up',
      },
      request_sent: {
        ...baseNotification,
        kind: 'request_sent',
        title: 'Request sent',
        body: "You requested R100 from recipient@email.com for '[reference]'.",
        amount: { currency: 'ZAR', value: 100 },
        direction: 'up',
      },
      payment_failed: {
        ...baseNotification,
        kind: 'payment_failed',
        title: 'Payment failed',
        body: 'Your payment could not be processed and has been fully refunded.',
        direction: 'down',
      },
      refund: {
        ...baseNotification,
        kind: 'refund',
        title: 'Refund issued',
        body: 'We refunded R100 to your card • Ref: 9X3K…',
        amount: { currency: 'ZAR', value: 100 },
        direction: 'up',
      },
      ai_trade: {
        ...baseNotification,
        kind: 'ai_trade',
        title: 'AI reduced market risk',
        action: 'Shifted R120 to stable assets.',
        reason: 'Fragility increased in crypto markets; preserving purchasing power.',
        amount: { currency: 'ZAR', value: -120 },
        direction: 'down',
        actor: {
          type: 'ai' as const,
        },
      },
    }

    const notification = examples[kind] || { ...baseNotification, kind }
    store.pushNotification({ ...notification, ...options })
  }

  // @ts-ignore
  window.debugAiExamples = () => {
    const pushNotification = store.pushNotification

    pushNotification({
      kind: 'ai_trade',
      title: 'AI reduced market risk',
      action: 'Shifted R250 to stable assets.',
      reason: 'Fragility increased in crypto markets; preserving purchasing power.',
      actor: { type: 'ai' },
      routeOnTap: '/transactions',
    })

    pushNotification({
      kind: 'ai_trade',
      title: 'AI increased defensive position',
      action: 'Moved R180 to cash buffer.',
      reason: 'Short-term volatility detected in ZAR/MZN corridor.',
      actor: { type: 'ai' },
    })

    pushNotification({
      kind: 'ai_trade',
      title: 'AI restored growth exposure',
      action: 'Redeployed R150 from cash buffer.',
      reason: 'Market stabilized; restoring balanced allocation.',
      actor: { type: 'ai' },
    })
  }

  // @ts-ignore
  window.debugMapAgentDemo = () => {
    const push = store.pushNotification
    // Dynamic import to avoid SSR issues
    const { useMapHighlightStore } = require('@/state/mapHighlight')
    const { highlightOnMap } = useMapHighlightStore.getState()
    
    const agents = [
      { id: 'demo-naledi', name: 'Naledi', lat: -26.2041, lng: 28.0473, avatar: '/assets/avatar_agent5.png' },
      { id: 'demo-joao', name: 'João', lat: -25.9692, lng: 32.5732, avatar: '/assets/avatar_agent6.png' },
      { id: 'demo-thabo', name: 'Thabo', lat: -33.9249, lng: 18.4241, avatar: '/assets/avatar_agent7.png' },
      { id: 'demo-sarah', name: 'Sarah', lat: -29.8587, lng: 31.0218, avatar: '/assets/avatar_agent8.png' },
    ]
    
    let index = 0
    const cycle = () => {
      const agent = agents[index]
      
      // Push notification
      const amount = 150 + Math.floor(Math.random() * 100)
      push({
        kind: 'payment_received',
        title: `You received R${amount}`,
        body: `Payment from @${agent.name.toLowerCase()} received.`,
        amount: { currency: 'ZAR', value: amount },
        direction: 'up',
        actor: {
          type: 'member',
          id: agent.id,
          name: agent.name,
          handle: `@${agent.name.toLowerCase()}`,
          avatar: agent.avatar,
        },
        map: { lat: agent.lat, lng: agent.lng, markerId: agent.id },
      })
      
      // Trigger map highlight
      highlightOnMap({
        id: agent.id,
        lat: agent.lat,
        lng: agent.lng,
        kind: 'member',
      })
      
      index = (index + 1) % agents.length
      
      // Schedule next
      if (index > 0) {
        setTimeout(cycle, 4000)
      }
    }
    
    cycle()
    console.log('[Dev Helper] Started map agent demo cycle')
  }

  // @ts-ignore
  window.debugSeedActivity = () => {
    const activityStore = useActivityStore.getState()
    const now = Date.now()
    const oneHour = 60 * 60 * 1000
    const oneDay = 24 * oneHour
    const threeDays = 3 * oneDay
    const tenDays = 10 * oneDay

    activityStore.addMany([
      {
        id: crypto.randomUUID(),
        actor: { type: 'ai' },
        title: 'AI reduced market risk',
        body: 'Shifted R120.50 to stable assets. — Fragility increased in crypto markets; preserving purchasing power.',
        amount: { currency: 'ZAR', value: 120.50, sign: 'debit' },
        createdAt: now - oneHour,
        routeOnTap: '/activity',
      },
      {
        id: crypto.randomUUID(),
        actor: { type: 'user' },
        title: 'You paid R100 to @member1',
        body: 'Payment complete.',
        amount: { currency: 'ZAR', value: 100, sign: 'debit' },
        createdAt: now - 2 * oneHour,
        routeOnTap: '/activity',
      },
      {
        id: crypto.randomUUID(),
        actor: { type: 'user' },
        title: 'You received R250',
        body: 'Payment from @member2 received.',
        amount: { currency: 'ZAR', value: 250, sign: 'credit' },
        createdAt: now - oneDay,
        routeOnTap: '/activity',
      },
      {
        id: crypto.randomUUID(),
        actor: { type: 'ai' },
        title: 'AI increased defensive position',
        body: 'Moved R85.30 to cash buffer. — Short-term volatility detected in ZAR/MZN corridor.',
        amount: { currency: 'ZAR', value: 85.30, sign: 'debit' },
        createdAt: now - threeDays,
        routeOnTap: '/activity',
      },
      {
        id: crypto.randomUUID(),
        actor: { type: 'user' },
        title: 'Refund issued',
        body: 'We refunded R100 to your card • Ref: 9X3K…',
        amount: { currency: 'ZAR', value: 100, sign: 'credit' },
        createdAt: now - tenDays,
        routeOnTap: '/activity',
      },
    ])
  }

  // @ts-ignore
  window.debugIdentityExamples = () => {
    const push = store.pushNotification

    // 1. Me / user
    push({
      kind: 'payment_sent',
      title: 'You paid R120 to @member1',
      body: 'Payment complete.',
      actor: { type: 'user' },
    })

    // 2. AI manager
    push({
      kind: 'ai_trade',
      title: 'AI reduced market risk',
      action: 'Shifted R250 to stable assets.',
      reason: 'Fragility increased in crypto markets; preserving purchasing power.',
      actor: { type: 'ai_manager' },
    })

    // 3. Cross-border payment
    push({
      kind: 'payment_received',
      title: 'Cross-border transfer received',
      body: 'You received R450 from Mozambique.',
      actor: { type: 'system', name: 'GoBankless' },
    })

    // 4. Member
    push({
      kind: 'payment_received',
      title: 'You received R320',
      body: 'Payment from @member2 received.',
      actor: {
        type: 'member',
        id: 'demo-member',
        name: 'Member',
        handle: '@member2',
        avatar: '/assets/avatar_agent2.png',
      },
    })

    // 5. System
    push({
      kind: 'payment_failed',
      title: 'Network issue',
      body: "We'll retry your payment in a moment.",
      actor: { type: 'system', name: 'System' },
    })
  }
}


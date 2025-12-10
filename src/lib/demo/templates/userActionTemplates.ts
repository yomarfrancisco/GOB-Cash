/**
 * Notification System v2.0 - User Action Templates
 * User-initiated actions: Payments, backing, deposits, transfers, withdrawals
 * Voice: Simple, direct confirmations
 * Amount ranges vary by action type
 */

import type { NotificationTemplate } from './types'
import { AGENT_REGISTRY } from './agentRegistry'

// Helper to get agent data (will be substituted by selection logic)
const getAgentData = (agentId: string) => {
  const agent = AGENT_REGISTRY.find(a => a.id === agentId)
  return agent || AGENT_REGISTRY[0] // Fallback to first agent
}

// Payments sent (4 templates)
const paymentSentTemplates: NotificationTemplate[] = [
  {
    id: 'user-01',
    category: 'user_payment',
    kind: 'payment_sent',
    title: 'You paid R450 to @thabo. Payment complete.',
    body: 'Payment sent successfully.',
    amount: {
      currency: 'ZAR',
      baseValue: 450,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      agentName: 'thabo', // Will be substituted
      priority: 5,
      cooldown: 3
    }
  },
  {
    id: 'user-02',
    category: 'user_payment',
    kind: 'payment_sent',
    title: 'You paid R1,200 to @lindiwe. Payment complete.',
    body: 'Payment sent successfully.',
    amount: {
      currency: 'ZAR',
      baseValue: 1200,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      agentName: 'lindiwe', // Will be substituted
      priority: 5,
      cooldown: 3
    }
  },
  {
    id: 'user-03',
    category: 'user_payment',
    kind: 'payment_sent',
    title: 'Payment sent across border to Zimbabwe.',
    body: 'R850 sent successfully.',
    amount: {
      currency: 'ZAR',
      baseValue: 850,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      priority: 6,
      cooldown: 4
    }
  },
  {
    id: 'user-04',
    category: 'user_payment',
    kind: 'payment_sent',
    title: 'You paid R2,100 to @grace. Payment complete.',
    body: 'Payment sent successfully.',
    amount: {
      currency: 'ZAR',
      baseValue: 2100,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      agentName: 'grace', // Will be substituted
      priority: 5,
      cooldown: 3
    }
  }
]

// Backing started (4 templates) - Changed from "sponsorship" to "backing"
const backingStartedTemplates: NotificationTemplate[] = [
  {
    id: 'user-05',
    category: 'user_backing',
    kind: 'payment_sent',
    title: 'Now backing @thabo',
    body: 'R150/week committed. You earn when they move cash.',
    amount: {
      currency: 'ZAR',
      baseValue: 150,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      agentName: 'thabo', // Will be substituted
      priority: 6,
      cooldown: 5
    }
  },
  {
    id: 'user-06',
    category: 'user_backing',
    kind: 'payment_sent',
    title: 'Now backing @lindiwe',
    body: 'R200/week committed. You earn when they move cash.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      agentName: 'lindiwe', // Will be substituted
      priority: 6,
      cooldown: 5
    }
  },
  {
    id: 'user-07',
    category: 'user_backing',
    kind: 'payment_sent',
    title: 'Weekly backing of R100 to @grace activated.',
    body: 'R100/week committed. You earn when they move cash.',
    amount: {
      currency: 'ZAR',
      baseValue: 100,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      agentName: 'grace', // Will be substituted
      priority: 6,
      cooldown: 5
    }
  },
  {
    id: 'user-08',
    category: 'user_backing',
    kind: 'payment_sent',
    title: 'You supported @tendai with R180. First proof of payment arriving shortly.',
    body: 'R180/week committed. You earn when they move cash.',
    amount: {
      currency: 'ZAR',
      baseValue: 180,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      agentName: 'tendai', // Will be substituted
      priority: 6,
      cooldown: 5
    }
  }
]

// Deposits (4 templates)
const depositTemplates: NotificationTemplate[] = [
  {
    id: 'user-09',
    category: 'user_deposit',
    kind: 'payment_received',
    title: 'Cash deposit secured',
    body: 'Your R500 cash deposit is confirmed.',
    amount: {
      currency: 'ZAR',
      baseValue: 500,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      priority: 6,
      cooldown: 4
    }
  },
  {
    id: 'user-10',
    category: 'user_deposit',
    kind: 'payment_received',
    title: 'Cash deposit secured',
    body: 'Your R1,200 cash deposit is confirmed.',
    amount: {
      currency: 'ZAR',
      baseValue: 1200,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      priority: 6,
      cooldown: 4
    }
  },
  {
    id: 'user-11',
    category: 'user_deposit',
    kind: 'payment_received',
    title: 'Cash deposit secured',
    body: 'Your R3,500 cash deposit is confirmed.',
    amount: {
      currency: 'ZAR',
      baseValue: 3500,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      priority: 6,
      cooldown: 4
    }
  },
  {
    id: 'user-12',
    category: 'user_deposit',
    kind: 'payment_received',
    title: 'Cash deposit secured',
    body: 'Your R5,000 cash deposit is confirmed.',
    amount: {
      currency: 'ZAR',
      baseValue: 5000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      priority: 6,
      cooldown: 4
    }
  }
]

// Transfers (4 templates)
const transferTemplates: NotificationTemplate[] = [
  {
    id: 'user-13',
    category: 'user_transfer',
    kind: 'transfer',
    title: 'Card top-up completed',
    body: 'You moved R300 into your MZN card.',
    amount: {
      currency: 'ZAR',
      baseValue: 300,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      priority: 5,
      cooldown: 3
    }
  },
  {
    id: 'user-14',
    category: 'user_transfer',
    kind: 'transfer',
    title: 'Transfer completed',
    body: 'You topped up your ZAR card with R200.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      priority: 5,
      cooldown: 3
    }
  },
  {
    id: 'user-15',
    category: 'user_transfer',
    kind: 'transfer',
    title: 'Transfer completed',
    body: 'You moved R1,500 into your Crypto Card.',
    amount: {
      currency: 'ZAR',
      baseValue: 1500,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      priority: 5,
      cooldown: 3
    }
  },
  {
    id: 'user-16',
    category: 'user_transfer',
    kind: 'transfer',
    title: 'Transfer completed',
    body: 'You moved R800 into your ZAR card.',
    amount: {
      currency: 'ZAR',
      baseValue: 800,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      priority: 5,
      cooldown: 3
    }
  }
]

// Withdrawals (3 templates)
const withdrawalTemplates: NotificationTemplate[] = [
  {
    id: 'user-17',
    category: 'user_withdrawal',
    kind: 'payment_sent',
    title: 'Withdrawal confirmed',
    body: 'R1,200 sent to your bank account.',
    amount: {
      currency: 'ZAR',
      baseValue: 1200,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      priority: 5,
      cooldown: 4
    }
  },
  {
    id: 'user-18',
    category: 'user_withdrawal',
    kind: 'payment_sent',
    title: 'Withdrawal confirmed',
    body: 'R2,500 sent to your bank account.',
    amount: {
      currency: 'ZAR',
      baseValue: 2500,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      priority: 5,
      cooldown: 4
    }
  },
  {
    id: 'user-19',
    category: 'user_withdrawal',
    kind: 'payment_sent',
    title: 'Hard cash withdrawal confirmed',
    body: 'Cash delivered. Balance updated.',
    amount: {
      currency: 'ZAR',
      baseValue: 3500,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      priority: 6,
      cooldown: 5
    }
  }
]

export const USER_ACTION_TEMPLATES: NotificationTemplate[] = [
  ...paymentSentTemplates,
  ...backingStartedTemplates,
  ...depositTemplates,
  ...transferTemplates,
  ...withdrawalTemplates
]

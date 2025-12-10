/**
 * Notification System v2.0 - Agent-You Templates
 * Agent-specific notifications for users who are agents
 * Voice: Personal, agent-focused, second person
 * Requires authentication AND agent role
 */

import type { NotificationTemplate } from './types'

// Your shift (4 templates)
const shiftTemplates: NotificationTemplate[] = [
  {
    id: 'agent-you-01',
    category: 'agent_you_shift',
    kind: 'payment_received',
    title: 'Your shift started. Clock in complete.',
    body: 'Ready to process transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 6,
      cooldown: 5
    }
  },
  {
    id: 'agent-you-02',
    category: 'agent_you_shift',
    kind: 'payment_received',
    title: 'You\'ve been online for 2 hours. Keep going.',
    body: 'Shift progress: 67% complete.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 5,
      cooldown: 5
    }
  },
  {
    id: 'agent-you-03',
    category: 'agent_you_shift',
    kind: 'payment_received',
    title: 'Your shift ends in 1 hour. Finish strong.',
    body: '3 hours completed. 1 hour remaining.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 5,
      cooldown: 5
    }
  },
  {
    id: 'agent-you-04',
    category: 'agent_you_shift',
    kind: 'payment_received',
    title: 'Shift complete. You processed 8 transactions today.',
    body: 'Great work today.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 6,
      cooldown: 5
    }
  }
]

// Your earnings (4 templates)
const earningsTemplates: NotificationTemplate[] = [
  {
    id: 'agent-you-05',
    category: 'agent_you_earnings',
    kind: 'payment_received',
    title: 'You earned R180 this shift.',
    body: 'Commission: R150. Bonus: R30.',
    amount: {
      currency: 'ZAR',
      baseValue: 180,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 7,
      cooldown: 5
    }
  },
  {
    id: 'agent-you-06',
    category: 'agent_you_earnings',
    kind: 'payment_received',
    title: 'You earned R320 today. Total: R1,200 this week.',
    body: 'Daily earnings updated.',
    amount: {
      currency: 'ZAR',
      baseValue: 320,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 7,
      cooldown: 10
    }
  },
  {
    id: 'agent-you-07',
    category: 'agent_you_earnings',
    kind: 'payment_received',
    title: 'Weekly earnings: R2,400. Your best week yet.',
    body: 'R2,400 earned this week.',
    amount: {
      currency: 'ZAR',
      baseValue: 2400,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 7,
      cooldown: 15
    }
  },
  {
    id: 'agent-you-08',
    category: 'agent_you_earnings',
    kind: 'payment_received',
    title: 'You earned R45 from backing returns.',
    body: 'Your agents moved cash. Your cut: R45.',
    amount: {
      currency: 'ZAR',
      baseValue: 45,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 6,
      cooldown: 10
    }
  }
]

// Your productivity (4 templates)
const productivityTemplates: NotificationTemplate[] = [
  {
    id: 'agent-you-09',
    category: 'agent_you_productivity',
    kind: 'payment_received',
    title: 'Your productivity score: 85/100. Excellent.',
    body: 'Above average performance.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 6,
      cooldown: 10
    }
  },
  {
    id: 'agent-you-10',
    category: 'agent_you_productivity',
    kind: 'payment_received',
    title: 'Your productivity increased 5 points this week.',
    body: 'Score: 78 → 83.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 6,
      cooldown: 10
    }
  },
  {
    id: 'agent-you-11',
    category: 'agent_you_productivity',
    kind: 'payment_received',
    title: 'You processed R18,000 today. High volume.',
    body: 'Productivity: 92/100.',
    amount: {
      currency: 'ZAR',
      baseValue: 18000,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 7,
      cooldown: 10
    }
  },
  {
    id: 'agent-you-12',
    category: 'agent_you_productivity',
    kind: 'payment_received',
    title: 'Your productivity is in the top 10%. Keep it up.',
    body: 'Score: 95/100.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 7,
      cooldown: 10
    }
  }
]

// Customer requests (4 templates)
const requestTemplates: NotificationTemplate[] = [
  {
    id: 'agent-you-13',
    category: 'agent_you_request',
    kind: 'request_sent',
    title: 'New cash pickup request. R850. 2km away.',
    body: 'Customer request received.',
    amount: {
      currency: 'ZAR',
      baseValue: 850,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 7,
      cooldown: 5
    }
  },
  {
    id: 'agent-you-14',
    category: 'agent_you_request',
    kind: 'request_sent',
    title: 'Cash delivery request. R1,200. Accept?',
    body: 'New delivery request.',
    amount: {
      currency: 'ZAR',
      baseValue: 1200,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 7,
      cooldown: 5
    }
  },
  {
    id: 'agent-you-15',
    category: 'agent_you_request',
    kind: 'request_sent',
    title: 'You accepted a request. R2,100 pickup.',
    body: 'Request accepted. En route.',
    amount: {
      currency: 'ZAR',
      baseValue: 2100,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 6,
      cooldown: 5
    }
  },
  {
    id: 'agent-you-16',
    category: 'agent_you_request',
    kind: 'request_sent',
    title: 'Request completed. R450 delivered. Commission: R18.',
    body: 'Transaction complete.',
    amount: {
      currency: 'ZAR',
      baseValue: 450,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 6,
      cooldown: 5
    }
  }
]

// Milestones (4 templates)
const milestoneTemplates: NotificationTemplate[] = [
  {
    id: 'agent-you-17',
    category: 'agent_you_milestone',
    kind: 'payment_received',
    title: 'You completed 100 transactions. Milestone reached.',
    body: 'R5,000 milestone bonus.',
    amount: {
      currency: 'ZAR',
      baseValue: 5000,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 8,
      cooldown: 120
    }
  },
  {
    id: 'agent-you-18',
    category: 'agent_you_milestone',
    kind: 'payment_received',
    title: 'You processed R100,000 lifetime. Achievement unlocked.',
    body: 'R2,000 milestone bonus.',
    amount: {
      currency: 'ZAR',
      baseValue: 2000,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 8,
      cooldown: 120
    }
  },
  {
    id: 'agent-you-19',
    category: 'agent_you_milestone',
    kind: 'payment_received',
    title: 'You reached 500 transactions. Veteran status.',
    body: 'R10,000 veteran bonus.',
    amount: {
      currency: 'ZAR',
      baseValue: 10000,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 9,
      cooldown: 120
    }
  },
  {
    id: 'agent-you-20',
    category: 'agent_you_milestone',
    kind: 'payment_received',
    title: 'You earned R50,000 lifetime. Elite agent status.',
    body: 'R5,000 elite bonus.',
    amount: {
      currency: 'ZAR',
      baseValue: 5000,
      direction: 'up'
    },
    actor: {
      type: 'user',
      name: 'You'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      requiresAgentRole: true,
      priority: 9,
      cooldown: 120
    }
  }
]

export const AGENT_YOU_TEMPLATES: NotificationTemplate[] = [
  ...shiftTemplates,
  ...earningsTemplates,
  ...productivityTemplates,
  ...requestTemplates,
  ...milestoneTemplates
]

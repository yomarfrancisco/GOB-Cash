/**
 * Notification System v2.0 - Competition Templates
 * Gamification: Rankings, streaks, levels, comparisons
 * Voice: Encouraging, status-focused
 * Requires authentication
 */

import type { NotificationTemplate } from './types'

// Your rank (5 templates)
const rankTemplates: NotificationTemplate[] = [
  {
    id: 'compete-01',
    category: 'competition_rank',
    kind: 'payment_received',
    title: 'You\'re ranked #12 this week. Keep it up.',
    body: 'Productivity score: 78/100.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 5,
      cooldown: 60
    }
  },
  {
    id: 'compete-02',
    category: 'competition_rank',
    kind: 'payment_received',
    title: 'You moved up 3 spots. Now #8.',
    body: 'Rising in the rankings.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 5,
      cooldown: 60
    }
  },
  {
    id: 'compete-03',
    category: 'competition_rank',
    kind: 'payment_received',
    title: 'Top 10 this month. You\'re #7.',
    body: 'Excellent productivity.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 5,
      cooldown: 60
    }
  },
  {
    id: 'compete-04',
    category: 'competition_rank',
    kind: 'payment_received',
    title: 'You\'re in the top 5%. Rank: #3.',
    body: 'Outstanding performance.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'compete-05',
    category: 'competition_rank',
    kind: 'payment_received',
    title: 'You\'re #1 this week. Champion.',
    body: 'Highest productivity score.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 7,
      cooldown: 60
    }
  }
]

// Streaks (4 templates)
const streakTemplates: NotificationTemplate[] = [
  {
    id: 'compete-06',
    category: 'competition_streak',
    kind: 'payment_received',
    title: '5-day check-in streak. Keep going.',
    body: 'Consistency pays off.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 4,
      cooldown: 30
    }
  },
  {
    id: 'compete-07',
    category: 'competition_streak',
    kind: 'payment_received',
    title: '10-day streak unlocked. Bonus earned.',
    body: 'R50 bonus for consistency.',
    amount: {
      currency: 'ZAR',
      baseValue: 50,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 5,
      cooldown: 30
    }
  },
  {
    id: 'compete-08',
    category: 'competition_streak',
    kind: 'payment_received',
    title: '20-day streak. You\'re on fire.',
    body: 'R100 streak bonus.',
    amount: {
      currency: 'ZAR',
      baseValue: 100,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 6,
      cooldown: 30
    }
  },
  {
    id: 'compete-09',
    category: 'competition_streak',
    kind: 'payment_received',
    title: '30-day streak milestone. Legendary.',
    body: 'R200 streak bonus unlocked.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 7,
      cooldown: 30
    }
  }
]

// Level ups (4 templates)
const levelUpTemplates: NotificationTemplate[] = [
  {
    id: 'compete-10',
    category: 'competition_level',
    kind: 'payment_received',
    title: 'Level up! You\'re now Level 5.',
    body: 'New perks unlocked.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 5,
      cooldown: 60
    }
  },
  {
    id: 'compete-11',
    category: 'competition_level',
    kind: 'payment_received',
    title: 'Level 10 reached. Advanced tier unlocked.',
    body: 'Higher yield rates available.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'compete-12',
    category: 'competition_level',
    kind: 'payment_received',
    title: 'Level 15 achieved. Elite status.',
    body: 'Exclusive benefits unlocked.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'compete-13',
    category: 'competition_level',
    kind: 'payment_received',
    title: 'Level 20. Master tier unlocked.',
    body: 'Maximum benefits active.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 7,
      cooldown: 60
    }
  }
]

// Comparisons (4 templates)
const comparisonTemplates: NotificationTemplate[] = [
  {
    id: 'compete-14',
    category: 'competition_compare',
    kind: 'payment_received',
    title: 'You\'re ahead of 85% of users this week.',
    body: 'Keep up the great work.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 4,
      cooldown: 60
    }
  },
  {
    id: 'compete-15',
    category: 'competition_compare',
    kind: 'payment_received',
    title: 'You\'re 12% more productive than average.',
    body: 'Above average performance.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 4,
      cooldown: 60
    }
  },
  {
    id: 'compete-16',
    category: 'competition_compare',
    kind: 'payment_received',
    title: 'You beat your personal best this week.',
    body: 'New record set.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 5,
      cooldown: 60
    }
  },
  {
    id: 'compete-17',
    category: 'competition_compare',
    kind: 'payment_received',
    title: 'You\'re in the top 3 this month. Elite performance.',
    body: 'Ranked #2 overall.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'GoBankless'
    },
    metadata: {
      character: 'user',
      requiresAuth: true,
      priority: 6,
      cooldown: 60
    }
  }
]

export const COMPETITION_TEMPLATES: NotificationTemplate[] = [
  ...rankTemplates,
  ...streakTemplates,
  ...levelUpTemplates,
  ...comparisonTemplates
]

/**
 * Notification System v2.0 - $ama Templates
 * AI Portfolio Manager: Sophisticated, protective, pattern-seer
 * Voice: Calm, assured, occasionally cryptic. Never panicked. Uses "I" not "we."
 */

import type { NotificationTemplate } from './types'
import { CHARACTERS } from './characters'

const ama = CHARACTERS.ama

// Protection & Defense (When markets are risky)
const protectionTemplates: NotificationTemplate[] = [
  {
    id: 'ama-01',
    category: 'ai_protection',
    kind: 'ai_trade',
    title: '$ama: Pulled R250 out of ETH. Something\'s off in the order books.',
    action: 'Pulled R250 out of ETH.',
    reason: 'Something\'s off in the order books.',
    amount: {
      currency: 'ZAR',
      baseValue: 250,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'ama',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'ama-02',
    category: 'ai_protection',
    kind: 'ai_trade',
    title: '$ama: Moving R180 to cash. ZAR/MZN corridor feels shaky.',
    action: 'Moving R180 to cash.',
    reason: 'ZAR/MZN corridor feels shaky.',
    amount: {
      currency: 'ZAR',
      baseValue: 180,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'ama-03',
    category: 'ai_protection',
    kind: 'ai_trade',
    title: '$ama: Fragility spike. Secured R320 — we wait this out.',
    action: 'Secured R320.',
    reason: 'Fragility spike. We wait this out.',
    amount: {
      currency: 'ZAR',
      baseValue: 320,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'ama',
      priority: 9,
      cooldown: 6
    }
  },
  {
    id: 'ama-04',
    category: 'ai_protection',
    kind: 'ai_trade',
    title: '$ama: BTC volatility incoming. Already moved you to stable.',
    action: 'Moved you to stable.',
    reason: 'BTC volatility incoming.',
    amount: {
      currency: 'ZAR',
      baseValue: 280,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'ama-05',
    category: 'ai_protection',
    kind: 'ai_trade',
    title: '$ama: Saw this pattern before. Defensive position until tomorrow.',
    action: 'Defensive position until tomorrow.',
    reason: 'Saw this pattern before.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 4
    }
  },
  {
    id: 'ama-06',
    category: 'ai_protection',
    kind: 'ai_trade',
    title: '$ama: Crypto markets are nervous. Your funds aren\'t.',
    action: 'Your funds aren\'t nervous.',
    reason: 'Crypto markets are nervous.',
    amount: {
      currency: 'ZAR',
      baseValue: 350,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'ama-07',
    category: 'ai_protection',
    kind: 'ai_trade',
    title: '$ama: Flash crash on ETH. I moved 3 minutes before it hit.',
    action: 'Moved 3 minutes before it hit.',
    reason: 'Flash crash on ETH.',
    amount: {
      currency: 'ZAR',
      baseValue: 400,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'ama',
      priority: 9,
      cooldown: 6
    }
  },
  {
    id: 'ama-08',
    category: 'ai_protection',
    kind: 'ai_trade',
    title: '$ama: Order book thinning. Shifted R400 to safety.',
    action: 'Shifted R400 to safety.',
    reason: 'Order book thinning.',
    amount: {
      currency: 'ZAR',
      baseValue: 400,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'ama-09',
    category: 'ai_protection',
    kind: 'ai_trade',
    title: '$ama: Weekend volatility starting. I\'ve got you covered.',
    action: 'I\'ve got you covered.',
    reason: 'Weekend volatility starting.',
    amount: {
      currency: 'ZAR',
      baseValue: 220,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 4
    }
  },
  {
    id: 'ama-10',
    category: 'ai_protection',
    kind: 'ai_trade',
    title: '$ama: Asian markets just opened rough. Already adjusted.',
    action: 'Already adjusted.',
    reason: 'Asian markets just opened rough.',
    amount: {
      currency: 'ZAR',
      baseValue: 300,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 8,
      cooldown: 5
    }
  }
]

// Recovery & Growth (When markets stabilize)
const recoveryTemplates: NotificationTemplate[] = [
  {
    id: 'ama-11',
    category: 'ai_recovery',
    kind: 'ai_trade',
    title: '$ama: All clear. Putting R150 back to work.',
    action: 'Putting R150 back to work.',
    reason: 'All clear.',
    amount: {
      currency: 'ZAR',
      baseValue: 150,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 4
    }
  },
  {
    id: 'ama-12',
    category: 'ai_recovery',
    kind: 'ai_trade',
    title: '$ama: Storm passed. Restoring growth allocation.',
    action: 'Restoring growth allocation.',
    reason: 'Storm passed.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 4
    }
  },
  {
    id: 'ama-13',
    category: 'ai_recovery',
    kind: 'ai_trade',
    title: '$ama: Markets calmed down. Redeploying to yield.',
    action: 'Redeploying to yield.',
    reason: 'Markets calmed down.',
    amount: {
      currency: 'ZAR',
      baseValue: 180,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 4
    }
  },
  {
    id: 'ama-14',
    category: 'ai_recovery',
    kind: 'ai_trade',
    title: '$ama: Back to normal. Your funds are earning again.',
    action: 'Your funds are earning again.',
    reason: 'Back to normal.',
    amount: {
      currency: 'ZAR',
      baseValue: 250,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 4
    }
  },
  {
    id: 'ama-15',
    category: 'ai_recovery',
    kind: 'ai_trade',
    title: '$ama: Volatility over. Moved R280 back to ETH.',
    action: 'Moved R280 back to ETH.',
    reason: 'Volatility over.',
    amount: {
      currency: 'ZAR',
      baseValue: 280,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 4
    }
  }
]

// Opportunity Spotting
const opportunityTemplates: NotificationTemplate[] = [
  {
    id: 'ama-16',
    category: 'ai_opportunity',
    kind: 'ai_trade',
    title: '$ama: Zimbabwe agents at 14% yield. Moving R200 there.',
    action: 'Moving R200 there.',
    reason: 'Zimbabwe agents at 14% yield.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 5
    }
  },
  {
    id: 'ama-17',
    category: 'ai_opportunity',
    kind: 'ai_trade',
    title: '$ama: Maputo corridor is hot. Allocating more float.',
    action: 'Allocating more float.',
    reason: 'Maputo corridor is hot.',
    amount: {
      currency: 'ZAR',
      baseValue: 250,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 5
    }
  },
  {
    id: 'ama-18',
    category: 'ai_opportunity',
    kind: 'ai_trade',
    title: '$ama: Found a 2% spread on ZAR/MZN. Taking it.',
    action: 'Taking it.',
    reason: 'Found a 2% spread on ZAR/MZN.',
    amount: {
      currency: 'ZAR',
      baseValue: 300,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 5
    }
  },
  {
    id: 'ama-19',
    category: 'ai_opportunity',
    kind: 'ai_trade',
    title: '$ama: Agent @lindiwe is on fire. Increasing her allocation.',
    action: 'Increasing her allocation.',
    reason: 'Agent @lindiwe is on fire.',
    amount: {
      currency: 'ZAR',
      baseValue: 180,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      agentName: 'lindiwe', // Will be substituted with random agent
      priority: 7,
      cooldown: 5
    }
  },
  {
    id: 'ama-20',
    category: 'ai_opportunity',
    kind: 'ai_trade',
    title: '$ama: Harare demand spiking. Positioning for it.',
    action: 'Positioning for it.',
    reason: 'Harare demand spiking.',
    amount: {
      currency: 'ZAR',
      baseValue: 220,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 5
    }
  },
  {
    id: 'ama-21',
    category: 'ai_opportunity',
    kind: 'ai_trade',
    title: '$ama: ETH staking rewards just increased. Moving funds.',
    action: 'Moving funds.',
    reason: 'ETH staking rewards just increased.',
    amount: {
      currency: 'ZAR',
      baseValue: 280,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 5
    }
  },
  {
    id: 'ama-22',
    category: 'ai_opportunity',
    kind: 'ai_trade',
    title: '$ama: Best yield right now is in the Durban cluster. Adjusting.',
    action: 'Adjusting.',
    reason: 'Best yield right now is in the Durban cluster.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 5
    }
  },
  {
    id: 'ama-23',
    category: 'ai_opportunity',
    kind: 'ai_trade',
    title: '$ama: Weekend remittance surge coming. Pre-positioned.',
    action: 'Pre-positioned.',
    reason: 'Weekend remittance surge coming.',
    amount: {
      currency: 'ZAR',
      baseValue: 250,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 5
    }
  }
]

// Performance Updates
const performanceTemplates: NotificationTemplate[] = [
  {
    id: 'ama-24',
    category: 'ai_performance',
    kind: 'ai_trade',
    title: '$ama: You\'re up 2.3% this month. Quiet week but we\'re ahead.',
    action: 'You\'re up 2.3% this month.',
    reason: 'Quiet week but we\'re ahead.',
    amount: {
      currency: 'ZAR',
      baseValue: 180,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 60 // 1 hour - performance updates less frequent
    }
  },
  {
    id: 'ama-25',
    category: 'ai_performance',
    kind: 'ai_trade',
    title: '$ama: Your portfolio grew R180 today. Mostly from agent yield.',
    action: 'Your portfolio grew R180 today.',
    reason: 'Mostly from agent yield.',
    amount: {
      currency: 'ZAR',
      baseValue: 180,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'ama-26',
    category: 'ai_performance',
    kind: 'ai_trade',
    title: '$ama: This week: +1.8%. Outperforming inflation.',
    action: 'This week: +1.8%.',
    reason: 'Outperforming inflation.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'ama-27',
    category: 'ai_performance',
    kind: 'ai_trade',
    title: '$ama: Monthly report: 3.2% growth. Top quartile performance.',
    action: 'Monthly report: 3.2% growth.',
    reason: 'Top quartile performance.',
    amount: {
      currency: 'ZAR',
      baseValue: 250,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 120 // 2 hours - monthly reports very infrequent
    }
  },
  {
    id: 'ama-28',
    category: 'ai_performance',
    kind: 'ai_trade',
    title: '$ama: Your money made R45 while you slept.',
    action: 'Your money made R45 while you slept.',
    reason: '',
    amount: {
      currency: 'ZAR',
      baseValue: 45,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'ama-29',
    category: 'ai_performance',
    kind: 'ai_trade',
    title: '$ama: 7-day yield: R320. Your agents are working.',
    action: '7-day yield: R320.',
    reason: 'Your agents are working.',
    amount: {
      currency: 'ZAR',
      baseValue: 320,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 60
    }
  }
]

// Rebalancing
const rebalancingTemplates: NotificationTemplate[] = [
  {
    id: 'ama-30',
    category: 'ai_rebalancing',
    kind: 'ai_trade',
    title: '$ama: Portfolio drifted. Rebalancing.',
    action: 'Rebalancing.',
    reason: 'Portfolio drifted.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 5,
      cooldown: 30 // 30 minutes
    }
  },
  {
    id: 'ama-31',
    category: 'ai_rebalancing',
    kind: 'ai_trade',
    title: '$ama: Too heavy in ZAR. Moving some to MZN for balance.',
    action: 'Moving some to MZN for balance.',
    reason: 'Too heavy in ZAR.',
    amount: {
      currency: 'ZAR',
      baseValue: 180,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 5,
      cooldown: 30
    }
  },
  {
    id: 'ama-32',
    category: 'ai_rebalancing',
    kind: 'ai_trade',
    title: '$ama: Agent allocation was uneven. Fixed it.',
    action: 'Fixed it.',
    reason: 'Agent allocation was uneven.',
    amount: {
      currency: 'ZAR',
      baseValue: 150,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 5,
      cooldown: 30
    }
  },
  {
    id: 'ama-33',
    category: 'ai_rebalancing',
    kind: 'ai_trade',
    title: '$ama: Monthly rebalance complete. Optimal allocation restored.',
    action: 'Optimal allocation restored.',
    reason: 'Monthly rebalance complete.',
    amount: {
      currency: 'ZAR',
      baseValue: 220,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 5,
      cooldown: 120 // 2 hours - monthly rebalance
    }
  }
]

// Market Commentary
const commentaryTemplates: NotificationTemplate[] = [
  {
    id: 'ama-34',
    category: 'ai_commentary',
    kind: 'ai_trade',
    title: '$ama: BTC flat. ETH moving. Staying defensive.',
    action: 'Staying defensive.',
    reason: 'BTC flat. ETH moving.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 5,
      cooldown: 20
    }
  },
  {
    id: 'ama-35',
    category: 'ai_commentary',
    kind: 'ai_trade',
    title: '$ama: Rand weakened 0.8% today. Your USD exposure helped.',
    action: 'Your USD exposure helped.',
    reason: 'Rand weakened 0.8% today.',
    amount: {
      currency: 'ZAR',
      baseValue: 180,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 5,
      cooldown: 20
    }
  },
  {
    id: 'ama-36',
    category: 'ai_commentary',
    kind: 'ai_trade',
    title: '$ama: Interesting day. Markets volatile but we came out ahead.',
    action: 'We came out ahead.',
    reason: 'Interesting day. Markets volatile.',
    amount: {
      currency: 'ZAR',
      baseValue: 150,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 5,
      cooldown: 20
    }
  },
  {
    id: 'ama-37',
    category: 'ai_commentary',
    kind: 'ai_trade',
    title: '$ama: SARB announcement tomorrow. I\'m positioned for it.',
    action: 'I\'m positioned for it.',
    reason: 'SARB announcement tomorrow.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 6,
      cooldown: 30
    }
  },
  {
    id: 'ama-38',
    category: 'ai_commentary',
    kind: 'ai_trade',
    title: '$ama: Crypto winter talk is back. Doesn\'t matter — we adapt.',
    action: 'We adapt.',
    reason: 'Crypto winter talk is back. Doesn\'t matter.',
    amount: {
      currency: 'ZAR',
      baseValue: 180,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 5,
      cooldown: 20
    }
  },
  {
    id: 'ama-39',
    category: 'ai_commentary',
    kind: 'ai_trade',
    title: '$ama: Everyone\'s panicking about rates. We\'re fine.',
    action: 'We\'re fine.',
    reason: 'Everyone\'s panicking about rates.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 5,
      cooldown: 20
    }
  }
]

// AI Failure/Recovery (New)
const failureRecoveryTemplates: NotificationTemplate[] = [
  {
    id: 'ama-40',
    category: 'ai_failure_recovery',
    kind: 'ai_trade',
    title: '$ama: Transaction failed on first route. Rerouted. Done.',
    action: 'Rerouted. Done.',
    reason: 'Transaction failed on first route.',
    amount: {
      currency: 'ZAR',
      baseValue: 250,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 10
    }
  },
  {
    id: 'ama-41',
    category: 'ai_failure_recovery',
    kind: 'ai_trade',
    title: '$ama: Network hiccup. Your funds are safe. Retrying.',
    action: 'Your funds are safe. Retrying.',
    reason: 'Network hiccup.',
    amount: {
      currency: 'ZAR',
      baseValue: 200,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 10
    }
  },
  {
    id: 'ama-42',
    category: 'ai_failure_recovery',
    kind: 'ai_trade',
    title: '$ama: Exchange rate spiked. Waited 30 seconds. Got you a better deal.',
    action: 'Got you a better deal.',
    reason: 'Exchange rate spiked. Waited 30 seconds.',
    amount: {
      currency: 'ZAR',
      baseValue: 280,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ama',
      avatar: ama.avatar
    },
    metadata: {
      character: 'ama',
      priority: 7,
      cooldown: 10
    }
  }
]

export const AMA_TEMPLATES: NotificationTemplate[] = [
  ...protectionTemplates,
  ...recoveryTemplates,
  ...opportunityTemplates,
  ...performanceTemplates,
  ...rebalancingTemplates,
  ...commentaryTemplates,
  ...failureRecoveryTemplates
]


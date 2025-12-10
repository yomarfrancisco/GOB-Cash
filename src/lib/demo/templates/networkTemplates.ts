/**
 * Notification System v2.0 - Network Pulse Templates
 * Network activity: Corridors, milestones, local activity, economy, time-based
 * Voice: Observational, slightly awe-inspiring. Uses "Network:" prefix.
 * Amount range: R1M - R50M (big numbers for FOMO)
 */

import type { NotificationTemplate } from './types'
import { CHARACTERS } from './characters'
import { CITY_COORDINATES } from './agentRegistry'

const network = CHARACTERS.network

// Corridor activity (6 templates)
const corridorTemplates: NotificationTemplate[] = [
  {
    id: 'network-01',
    category: 'network_corridor',
    kind: 'payment_received',
    title: 'Network: R2.4M through Harare since morning. Busy day.',
    body: 'Harare corridor is active. 340 transactions/hour.',
    amount: {
      currency: 'ZAR',
      baseValue: 2400000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    map: {
      lat: CITY_COORDINATES['harare'].lat,
      lng: CITY_COORDINATES['harare'].lng
    },
    metadata: {
      character: 'network',
      priority: 7,
      cooldown: 15
    }
  },
  {
    id: 'network-02',
    category: 'network_corridor',
    kind: 'payment_received',
    title: 'Network: Maputo corridor moved R5.8M today.',
    body: 'Mozambique ↔ South Africa: 892 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 5800000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    map: {
      lat: CITY_COORDINATES['maputo'].lat,
      lng: CITY_COORDINATES['maputo'].lng
    },
    metadata: {
      character: 'network',
      priority: 7,
      cooldown: 15
    }
  },
  {
    id: 'network-03',
    category: 'network_corridor',
    kind: 'payment_received',
    title: 'Network: Johannesburg → Durban: R3.2M in the last hour.',
    body: 'Domestic corridor heating up. 156 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 3200000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    map: {
      lat: CITY_COORDINATES['johannesburg'].lat,
      lng: CITY_COORDINATES['johannesburg'].lng
    },
    metadata: {
      character: 'network',
      priority: 7,
      cooldown: 15
    }
  },
  {
    id: 'network-04',
    category: 'network_corridor',
    kind: 'payment_received',
    title: 'Network: Bulawayo → Cape Town corridor: R1.8M flowing.',
    body: 'Cross-border activity rising. 78 transactions/hour.',
    amount: {
      currency: 'ZAR',
      baseValue: 1800000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    map: {
      lat: CITY_COORDINATES['bulawayo'].lat,
      lng: CITY_COORDINATES['bulawayo'].lng
    },
    metadata: {
      character: 'network',
      priority: 7,
      cooldown: 15
    }
  },
  {
    id: 'network-05',
    category: 'network_corridor',
    kind: 'payment_received',
    title: 'Network: Pretoria ↔ Soweto: R4.1M moved today.',
    body: 'Local network active. 234 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 4100000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    map: {
      lat: CITY_COORDINATES['pretoria'].lat,
      lng: CITY_COORDINATES['pretoria'].lng
    },
    metadata: {
      character: 'network',
      priority: 7,
      cooldown: 15
    }
  },
  {
    id: 'network-06',
    category: 'network_corridor',
    kind: 'payment_received',
    title: 'Network: Beira → Harare → Johannesburg. R6.5M multi-hop route.',
    body: 'Complex routing active. 145 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 6500000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    map: {
      lat: CITY_COORDINATES['johannesburg'].lat,
      lng: CITY_COORDINATES['johannesburg'].lng
    },
    metadata: {
      character: 'network',
      priority: 8,
      cooldown: 20
    }
  }
]

// Community milestones (6 templates)
const milestoneTemplates: NotificationTemplate[] = [
  {
    id: 'network-07',
    category: 'network_milestone',
    kind: 'payment_received',
    title: 'Network: 10,000 cross-border transfers this week. New record.',
    body: 'Community milestone reached. R42M moved.',
    amount: {
      currency: 'ZAR',
      baseValue: 42000000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 9,
      cooldown: 30
    }
  },
  {
    id: 'network-08',
    category: 'network_milestone',
    kind: 'payment_received',
    title: 'Network: R50M moved across borders this month.',
    body: 'Largest monthly volume yet. 3,456 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 50000000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 9,
      cooldown: 60
    }
  },
  {
    id: 'network-09',
    category: 'network_milestone',
    kind: 'payment_received',
    title: 'Network: 1,000 active agents online. Network growing.',
    body: 'R12M in active transactions right now.',
    amount: {
      currency: 'ZAR',
      baseValue: 12000000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 8,
      cooldown: 30
    }
  },
  {
    id: 'network-10',
    category: 'network_milestone',
    kind: 'payment_received',
    title: 'Network: 50,000 total transactions processed.',
    body: 'Community milestone. R180M lifetime volume.',
    amount: {
      currency: 'ZAR',
      baseValue: 180000000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 9,
      cooldown: 60
    }
  },
  {
    id: 'network-11',
    category: 'network_milestone',
    kind: 'payment_received',
    title: 'Network: 5 countries connected. Cross-border network live.',
    body: 'SA, Zim, Moz, Zambia, Malawi. R8.5M today.',
    amount: {
      currency: 'ZAR',
      baseValue: 8500000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 9,
      cooldown: 30
    }
  },
  {
    id: 'network-12',
    category: 'network_milestone',
    kind: 'payment_received',
    title: 'Network: R100M lifetime volume. Community milestone.',
    body: 'Thank you for being part of this.',
    amount: {
      currency: 'ZAR',
      baseValue: 100000000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 10,
      cooldown: 120
    }
  }
]

// Local activity (6 templates)
const localTemplates: NotificationTemplate[] = [
  {
    id: 'network-13',
    category: 'network_local',
    kind: 'payment_received',
    title: 'Network: R120,000 moved in your area today.',
    body: '3 payments made in the last hour.',
    amount: {
      currency: 'ZAR',
      baseValue: 120000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 10
    }
  },
  {
    id: 'network-14',
    category: 'network_local',
    kind: 'payment_received',
    title: 'Network: Someone nearby just made a cross-border transfer.',
    body: 'R450 to Zimbabwe. Community activity.',
    amount: {
      currency: 'ZAR',
      baseValue: 450,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 10
    }
  },
  {
    id: 'network-15',
    category: 'network_local',
    kind: 'payment_received',
    title: 'Network: Users around you have sent R85,000 today.',
    body: 'Local network active. 12 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 85000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 10
    }
  },
  {
    id: 'network-16',
    category: 'network_local',
    kind: 'payment_received',
    title: 'Network: Community activity is rising — 3 payments made in your area in the last hour.',
    body: 'R45,000 moved locally.',
    amount: {
      currency: 'ZAR',
      baseValue: 45000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 10
    }
  },
  {
    id: 'network-17',
    category: 'network_local',
    kind: 'payment_received',
    title: 'Network: Your neighborhood moved R200,000 this week.',
    body: 'Active zone. 28 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 200000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 15
    }
  },
  {
    id: 'network-18',
    category: 'network_local',
    kind: 'payment_received',
    title: 'Network: 5 agents active within 5km of you.',
    body: 'R65,000 in nearby transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 65000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 10
    }
  }
]

// Agent economy (6 templates)
const economyTemplates: NotificationTemplate[] = [
  {
    id: 'network-19',
    category: 'network_economy',
    kind: 'payment_received',
    title: 'Network: Agents earned R2.8M in commissions this week.',
    body: 'Productivity economy growing. 1,234 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 2800000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 7,
      cooldown: 20
    }
  },
  {
    id: 'network-20',
    category: 'network_economy',
    kind: 'payment_received',
    title: 'Network: Top 10 agents moved R15M today.',
    body: 'High performers driving volume.',
    amount: {
      currency: 'ZAR',
      baseValue: 15000000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 7,
      cooldown: 20
    }
  },
  {
    id: 'network-21',
    category: 'network_economy',
    kind: 'payment_received',
    title: 'Network: Agent productivity up 23% this month.',
    body: 'R8.5M in agent-driven transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 8500000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 7,
      cooldown: 20
    }
  },
  {
    id: 'network-22',
    category: 'network_economy',
    kind: 'payment_received',
    title: 'Network: Average transaction size: R1,200. Healthy economy.',
    body: 'R4.2M moved in last 24 hours.',
    amount: {
      currency: 'ZAR',
      baseValue: 4200000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 15
    }
  },
  {
    id: 'network-23',
    category: 'network_economy',
    kind: 'payment_received',
    title: 'Network: Cross-border remittances: R12M this week.',
    body: 'Remittance economy strong. 892 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 12000000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 7,
      cooldown: 20
    }
  },
  {
    id: 'network-24',
    category: 'network_economy',
    kind: 'payment_received',
    title: 'Network: Agent network value: R45M in active float.',
    body: 'Network liquidity healthy.',
    amount: {
      currency: 'ZAR',
      baseValue: 45000000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 7,
      cooldown: 20
    }
  }
]

// Time-based (6 templates)
const timeBasedTemplates: NotificationTemplate[] = [
  {
    id: 'network-25',
    category: 'network_time',
    kind: 'payment_received',
    title: 'Network: R3.5M moved in the last hour.',
    body: 'Peak activity period. 234 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 3500000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 10
    }
  },
  {
    id: 'network-26',
    category: 'network_time',
    kind: 'payment_received',
    title: 'Network: Weekend surge: R8.2M moved since Friday.',
    body: 'Remittance weekend active. 456 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 8200000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 7,
      cooldown: 15
    }
  },
  {
    id: 'network-27',
    category: 'network_time',
    kind: 'payment_received',
    title: 'Network: Morning rush: R2.1M in first 3 hours.',
    body: 'Early activity strong. 178 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 2100000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 10
    }
  },
  {
    id: 'network-28',
    category: 'network_time',
    kind: 'payment_received',
    title: 'Network: R6.8M moved today. Above average.',
    body: 'Active day. 567 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 6800000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 15
    }
  },
  {
    id: 'network-29',
    category: 'network_time',
    kind: 'payment_received',
    title: 'Network: Evening activity: R1.9M in last 2 hours.',
    body: 'Late transactions active. 123 payments.',
    amount: {
      currency: 'ZAR',
      baseValue: 1900000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 10
    }
  },
  {
    id: 'network-30',
    category: 'network_time',
    kind: 'payment_received',
    title: 'Network: R4.5M moved this week. Steady growth.',
    body: 'Weekly volume healthy. 1,234 transactions.',
    amount: {
      currency: 'ZAR',
      baseValue: 4500000,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: network.avatar
    },
    metadata: {
      character: 'network',
      priority: 6,
      cooldown: 20
    }
  }
]

export const NETWORK_TEMPLATES: NotificationTemplate[] = [
  ...corridorTemplates,
  ...milestoneTemplates,
  ...localTemplates,
  ...economyTemplates,
  ...timeBasedTemplates
]

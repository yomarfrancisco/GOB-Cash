/**
 * Notification System v2.0 - Cross-Border Templates
 * Cross-border payments: Incoming, outgoing, multi-hop, celebratory
 * Voice: Rebellious, triumphant, border-defying
 * Amount range: R280 - R4,500 (realistic remittance range)
 */

import type { NotificationTemplate } from './types'
import { CITY_COORDINATES } from './agentRegistry'

// Incoming (7 templates)
const incomingTemplates: NotificationTemplate[] = [
  {
    id: 'xborder-01',
    category: 'cross_border_incoming',
    kind: 'payment_received',
    title: 'Cross-border transfer received',
    body: 'You received R450 from Mozambique.',
    amount: {
      currency: 'ZAR',
      baseValue: 450,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: 'Cross-border sender',
      avatar: '/assets/avatar_agent2.png'
    },
    map: {
      lat: CITY_COORDINATES['maputo'].lat,
      lng: CITY_COORDINATES['maputo'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'xborder-02',
    category: 'cross_border_incoming',
    kind: 'payment_received',
    title: 'Cross-border transfer received',
    body: 'R1,200 from Zimbabwe. No bank fees.',
    amount: {
      currency: 'ZAR',
      baseValue: 1200,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: 'Cross-border sender',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: CITY_COORDINATES['harare'].lat,
      lng: CITY_COORDINATES['harare'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'xborder-03',
    category: 'cross_border_incoming',
    kind: 'payment_received',
    title: 'Cross-border transfer received',
    body: 'R850 arrived from Beira, Mozambique.',
    amount: {
      currency: 'ZAR',
      baseValue: 850,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: 'Cross-border sender',
      avatar: '/assets/avatar_agent2.png'
    },
    map: {
      lat: CITY_COORDINATES['beira'].lat,
      lng: CITY_COORDINATES['beira'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'xborder-04',
    category: 'cross_border_incoming',
    kind: 'payment_received',
    title: 'Cross-border transfer received',
    body: 'R2,100 from Harare. Faster than SWIFT.',
    amount: {
      currency: 'ZAR',
      baseValue: 2100,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: 'Cross-border sender',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: CITY_COORDINATES['harare'].lat,
      lng: CITY_COORDINATES['harare'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'xborder-05',
    category: 'cross_border_incoming',
    kind: 'payment_received',
    title: 'Cross-border transfer received',
    body: 'R3,500 from Maputo. Border crossed in 3 minutes.',
    amount: {
      currency: 'ZAR',
      baseValue: 3500,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: 'Cross-border sender',
      avatar: '/assets/avatar_agent2.png'
    },
    map: {
      lat: CITY_COORDINATES['maputo'].lat,
      lng: CITY_COORDINATES['maputo'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 9,
      cooldown: 6
    }
  },
  {
    id: 'xborder-06',
    category: 'cross_border_incoming',
    kind: 'payment_received',
    title: 'Cross-border transfer received',
    body: 'R4,500 from Bulawayo. No waiting, no fees.',
    amount: {
      currency: 'ZAR',
      baseValue: 4500,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: 'Cross-border sender',
      avatar: '/assets/avatar_agent3.png'
    },
    map: {
      lat: CITY_COORDINATES['bulawayo'].lat,
      lng: CITY_COORDINATES['bulawayo'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 9,
      cooldown: 6
    }
  },
  {
    id: 'xborder-07',
    category: 'cross_border_incoming',
    kind: 'payment_received',
    title: 'Cross-border transfer received',
    body: 'R680 from Mutare, Zimbabwe. Direct to your wallet.',
    amount: {
      currency: 'ZAR',
      baseValue: 680,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: 'Cross-border sender',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: CITY_COORDINATES['mutare'].lat,
      lng: CITY_COORDINATES['mutare'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 8,
      cooldown: 5
    }
  }
]

// Outgoing (6 templates)
const outgoingTemplates: NotificationTemplate[] = [
  {
    id: 'xborder-08',
    category: 'cross_border_outgoing',
    kind: 'payment_sent',
    title: 'Cross-border payment sent',
    body: 'You sent R280 to Zimbabwe. Payment complete.',
    amount: {
      currency: 'ZAR',
      baseValue: 280,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    map: {
      lat: CITY_COORDINATES['harare'].lat,
      lng: CITY_COORDINATES['harare'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'xborder-09',
    category: 'cross_border_outgoing',
    kind: 'payment_sent',
    title: 'Cross-border payment sent',
    body: 'R1,500 sent to Maputo. No SWIFT delays.',
    amount: {
      currency: 'ZAR',
      baseValue: 1500,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    map: {
      lat: CITY_COORDINATES['maputo'].lat,
      lng: CITY_COORDINATES['maputo'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'xborder-10',
    category: 'cross_border_outgoing',
    kind: 'payment_sent',
    title: 'Cross-border payment sent',
    body: 'R2,800 to Harare. Banks take 3 days. You took 3 minutes.',
    amount: {
      currency: 'ZAR',
      baseValue: 2800,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    map: {
      lat: CITY_COORDINATES['harare'].lat,
      lng: CITY_COORDINATES['harare'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 9,
      cooldown: 6
    }
  },
  {
    id: 'xborder-11',
    category: 'cross_border_outgoing',
    kind: 'payment_sent',
    title: 'Cross-border payment sent',
    body: 'R4,200 sent to Mozambique. Border crossed.',
    amount: {
      currency: 'ZAR',
      baseValue: 4200,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    map: {
      lat: CITY_COORDINATES['maputo'].lat,
      lng: CITY_COORDINATES['maputo'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 9,
      cooldown: 6
    }
  },
  {
    id: 'xborder-12',
    category: 'cross_border_outgoing',
    kind: 'payment_sent',
    title: 'Cross-border payment sent',
    body: 'R950 to Bulawayo. No fees, no waiting.',
    amount: {
      currency: 'ZAR',
      baseValue: 950,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    map: {
      lat: CITY_COORDINATES['bulawayo'].lat,
      lng: CITY_COORDINATES['bulawayo'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 8,
      cooldown: 5
    }
  },
  {
    id: 'xborder-13',
    category: 'cross_border_outgoing',
    kind: 'payment_sent',
    title: 'Cross-border payment sent',
    body: 'R3,200 sent to Beira. Your grandmother\'s generation waited weeks. You waited 4 minutes.',
    amount: {
      currency: 'ZAR',
      baseValue: 3200,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    map: {
      lat: CITY_COORDINATES['beira'].lat,
      lng: CITY_COORDINATES['beira'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 9,
      cooldown: 6
    }
  }
]

// Multi-hop routes (3 templates)
const multiHopTemplates: NotificationTemplate[] = [
  {
    id: 'xborder-14',
    category: 'cross_border_multi_hop',
    kind: 'payment_received',
    title: 'Cross-border transfer received',
    body: 'R1,800 routed through Harare → Johannesburg. Multi-hop complete.',
    amount: {
      currency: 'ZAR',
      baseValue: 1800,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: 'Cross-border sender',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: CITY_COORDINATES['johannesburg'].lat,
      lng: CITY_COORDINATES['johannesburg'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 8,
      cooldown: 6
    }
  },
  {
    id: 'xborder-15',
    category: 'cross_border_multi_hop',
    kind: 'payment_received',
    title: 'Cross-border transfer received',
    body: 'R2,500 via Maputo → Durban → Cape Town. Three cities, one payment.',
    amount: {
      currency: 'ZAR',
      baseValue: 2500,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: 'Cross-border sender',
      avatar: '/assets/avatar_agent2.png'
    },
    map: {
      lat: CITY_COORDINATES['cape-town'].lat,
      lng: CITY_COORDINATES['cape-town'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 9,
      cooldown: 6
    }
  },
  {
    id: 'xborder-16',
    category: 'cross_border_multi_hop',
    kind: 'payment_received',
    title: 'Cross-border transfer received',
    body: 'R3,800 through Zimbabwe → SA → Mozambique. Network routing at work.',
    amount: {
      currency: 'ZAR',
      baseValue: 3800,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: 'Cross-border sender',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: CITY_COORDINATES['maputo'].lat,
      lng: CITY_COORDINATES['maputo'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 9,
      cooldown: 6
    }
  }
]

// Celebratory (4 templates)
const celebratoryTemplates: NotificationTemplate[] = [
  {
    id: 'xborder-17',
    category: 'cross_border_celebratory',
    kind: 'payment_sent',
    title: 'Another border crossed. Banks hate this.',
    body: 'R450 crossed a border in 3 minutes. Banks take 3 days.',
    amount: {
      currency: 'ZAR',
      baseValue: 450,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    map: {
      lat: CITY_COORDINATES['harare'].lat,
      lng: CITY_COORDINATES['harare'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 9,
      cooldown: 8
    }
  },
  {
    id: 'xborder-18',
    category: 'cross_border_celebratory',
    kind: 'payment_sent',
    title: 'No SWIFT. No fees. No waiting. Just money where it needs to be.',
    body: 'R1,200 sent across border. Done.',
    amount: {
      currency: 'ZAR',
      baseValue: 1200,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    map: {
      lat: CITY_COORDINATES['maputo'].lat,
      lng: CITY_COORDINATES['maputo'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 9,
      cooldown: 8
    }
  },
  {
    id: 'xborder-19',
    category: 'cross_border_celebratory',
    kind: 'payment_received',
    title: 'Your grandmother\'s generation waited weeks. You waited 4 minutes.',
    body: 'R2,800 from Zimbabwe. Border crossed.',
    amount: {
      currency: 'ZAR',
      baseValue: 2800,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: 'Cross-border sender',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: CITY_COORDINATES['harare'].lat,
      lng: CITY_COORDINATES['harare'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 9,
      cooldown: 8
    }
  },
  {
    id: 'xborder-20',
    category: 'cross_border_celebratory',
    kind: 'payment_sent',
    title: 'R450 moved across an international border in 180 seconds. Welcome to the future.',
    body: 'Payment complete. No bank. No borders. No problem.',
    amount: {
      currency: 'ZAR',
      baseValue: 450,
      direction: 'down'
    },
    actor: {
      type: 'user',
      name: 'You',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    map: {
      lat: CITY_COORDINATES['maputo'].lat,
      lng: CITY_COORDINATES['maputo'].lng
    },
    routeOnTap: '/transactions',
    metadata: {
      character: 'user',
      priority: 10,
      cooldown: 10
    }
  }
]

export const CROSS_BORDER_TEMPLATES: NotificationTemplate[] = [
  ...incomingTemplates,
  ...outgoingTemplates,
  ...multiHopTemplates,
  ...celebratoryTemplates
]

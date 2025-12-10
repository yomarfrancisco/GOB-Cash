/**
 * Notification System v2.0 - $ariel Templates
 * AI Cash Agent: Bold, operations-focused, handles large transfers
 * Voice: Direct, confident, action-oriented. Uses "I" not "we."
 * Amount range: R20,000 - R200,000 (large transfers)
 */

import type { NotificationTemplate } from './types'
import { CHARACTERS } from './characters'
import { CITY_COORDINATES } from './agentRegistry'

const ariel = CHARACTERS.ariel

// Large transfers (6 templates)
const largeTransferTemplates: NotificationTemplate[] = [
  {
    id: 'ariel-01',
    category: 'large_transfer',
    kind: 'payment_received',
    title: '$ariel: R45,000 clearing from Maputo. 8 minutes out.',
    body: 'R45,000 clearing from Maputo. 8 minutes out.',
    amount: {
      currency: 'ZAR',
      baseValue: 45000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    map: {
      lat: CITY_COORDINATES['maputo'].lat,
      lng: CITY_COORDINATES['maputo'].lng,
      markerId: 'maputo-large'
    },
    metadata: {
      character: 'ariel',
      priority: 9,
      cooldown: 10
    }
  },
  {
    id: 'ariel-02',
    category: 'large_transfer',
    kind: 'payment_received',
    title: '$ariel: R120,000 incoming from Harare. Routing now.',
    body: 'R120,000 incoming from Harare. Routing now.',
    amount: {
      currency: 'ZAR',
      baseValue: 120000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    map: {
      lat: CITY_COORDINATES['harare'].lat,
      lng: CITY_COORDINATES['harare'].lng,
      markerId: 'harare-large'
    },
    metadata: {
      character: 'ariel',
      priority: 9,
      cooldown: 12
    }
  },
  {
    id: 'ariel-03',
    category: 'large_transfer',
    kind: 'payment_sent',
    title: '$ariel: R85,000 sent to Johannesburg. Done.',
    body: 'R85,000 sent to Johannesburg. Done.',
    amount: {
      currency: 'ZAR',
      baseValue: 85000,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    map: {
      lat: CITY_COORDINATES['johannesburg'].lat,
      lng: CITY_COORDINATES['johannesburg'].lng,
      markerId: 'jhb-large'
    },
    metadata: {
      character: 'ariel',
      priority: 9,
      cooldown: 10
    }
  },
  {
    id: 'ariel-04',
    category: 'large_transfer',
    kind: 'payment_received',
    title: '$ariel: R200,000 secured from Cape Town. Ready.',
    body: 'R200,000 secured from Cape Town. Ready.',
    amount: {
      currency: 'ZAR',
      baseValue: 200000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    map: {
      lat: CITY_COORDINATES['cape-town'].lat,
      lng: CITY_COORDINATES['cape-town'].lng,
      markerId: 'cpt-large'
    },
    metadata: {
      character: 'ariel',
      priority: 10,
      cooldown: 15
    }
  },
  {
    id: 'ariel-05',
    category: 'large_transfer',
    kind: 'payment_sent',
    title: '$ariel: R65,000 routed to Durban. Handled.',
    body: 'R65,000 routed to Durban. Handled.',
    amount: {
      currency: 'ZAR',
      baseValue: 65000,
      direction: 'down'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    map: {
      lat: CITY_COORDINATES['durban'].lat,
      lng: CITY_COORDINATES['durban'].lng,
      markerId: 'durban-large'
    },
    metadata: {
      character: 'ariel',
      priority: 8,
      cooldown: 10
    }
  },
  {
    id: 'ariel-06',
    category: 'large_transfer',
    kind: 'payment_received',
    title: '$ariel: R150,000 from Bulawayo. Processing.',
    body: 'R150,000 from Bulawayo. Processing.',
    amount: {
      currency: 'ZAR',
      baseValue: 150000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    map: {
      lat: CITY_COORDINATES['bulawayo'].lat,
      lng: CITY_COORDINATES['bulawayo'].lng,
      markerId: 'bulawayo-large'
    },
    metadata: {
      character: 'ariel',
      priority: 9,
      cooldown: 12
    }
  }
]

// Agent coordination (4 templates)
const agentCoordinationTemplates: NotificationTemplate[] = [
  {
    id: 'ariel-07',
    category: 'agent_coordination',
    kind: 'payment_received',
    title: '$ariel: Agent @lindiwe assigned to R35,000 transfer.',
    body: 'Agent @lindiwe assigned to R35,000 transfer.',
    amount: {
      currency: 'ZAR',
      baseValue: 35000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    metadata: {
      character: 'ariel',
      agentName: 'lindiwe', // Will be substituted
      priority: 8,
      cooldown: 8
    }
  },
  {
    id: 'ariel-08',
    category: 'agent_coordination',
    kind: 'payment_received',
    title: '$ariel: Coordinated 3 agents for R95,000 route. Done.',
    body: 'Coordinated 3 agents for R95,000 route. Done.',
    amount: {
      currency: 'ZAR',
      baseValue: 95000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    metadata: {
      character: 'ariel',
      priority: 8,
      cooldown: 10
    }
  },
  {
    id: 'ariel-09',
    category: 'agent_coordination',
    kind: 'payment_received',
    title: '$ariel: @grace handling R55,000. Status: en route.',
    body: '@grace handling R55,000. Status: en route.',
    amount: {
      currency: 'ZAR',
      baseValue: 55000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    metadata: {
      character: 'ariel',
      agentName: 'grace', // Will be substituted
      priority: 8,
      cooldown: 8
    }
  },
  {
    id: 'ariel-10',
    category: 'agent_coordination',
    kind: 'payment_received',
    title: '$ariel: Multi-agent handoff complete. R125,000 secured.',
    body: 'Multi-agent handoff complete. R125,000 secured.',
    amount: {
      currency: 'ZAR',
      baseValue: 125000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    metadata: {
      character: 'ariel',
      priority: 9,
      cooldown: 10
    }
  }
]

// Routing decisions (4 templates)
const routingDecisionTemplates: NotificationTemplate[] = [
  {
    id: 'ariel-11',
    category: 'routing_decision',
    kind: 'payment_received',
    title: '$ariel: Rerouted R75,000 via Maputo. Faster path.',
    body: 'Rerouted R75,000 via Maputo. Faster path.',
    amount: {
      currency: 'ZAR',
      baseValue: 75000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    map: {
      lat: CITY_COORDINATES['maputo'].lat,
      lng: CITY_COORDINATES['maputo'].lng
    },
    metadata: {
      character: 'ariel',
      priority: 8,
      cooldown: 8
    }
  },
  {
    id: 'ariel-12',
    category: 'routing_decision',
    kind: 'payment_received',
    title: '$ariel: Switched R110,000 to Harare corridor. Optimal.',
    body: 'Switched R110,000 to Harare corridor. Optimal.',
    amount: {
      currency: 'ZAR',
      baseValue: 110000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    map: {
      lat: CITY_COORDINATES['harare'].lat,
      lng: CITY_COORDINATES['harare'].lng
    },
    metadata: {
      character: 'ariel',
      priority: 8,
      cooldown: 8
    }
  },
  {
    id: 'ariel-13',
    category: 'routing_decision',
    kind: 'payment_received',
    title: '$ariel: R90,000 split across 2 routes. Efficiency up.',
    body: 'R90,000 split across 2 routes. Efficiency up.',
    amount: {
      currency: 'ZAR',
      baseValue: 90000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    metadata: {
      character: 'ariel',
      priority: 8,
      cooldown: 8
    }
  },
  {
    id: 'ariel-14',
    category: 'routing_decision',
    kind: 'payment_received',
    title: '$ariel: R140,000 direct route chosen. No stops.',
    body: 'R140,000 direct route chosen. No stops.',
    amount: {
      currency: 'ZAR',
      baseValue: 140000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    metadata: {
      character: 'ariel',
      priority: 8,
      cooldown: 8
    }
  }
]

// Status updates (3 templates)
const statusUpdateTemplates: NotificationTemplate[] = [
  {
    id: 'ariel-15',
    category: 'status_update',
    kind: 'payment_received',
    title: '$ariel: All large transfers on track. System healthy.',
    body: 'All large transfers on track. System healthy.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    metadata: {
      character: 'ariel',
      priority: 7,
      cooldown: 15
    }
  },
  {
    id: 'ariel-16',
    category: 'status_update',
    kind: 'payment_received',
    title: '$ariel: R180,000 in transit. ETA: 12 minutes.',
    body: 'R180,000 in transit. ETA: 12 minutes.',
    amount: {
      currency: 'ZAR',
      baseValue: 180000,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    metadata: {
      character: 'ariel',
      priority: 8,
      cooldown: 10
    }
  },
  {
    id: 'ariel-17',
    category: 'status_update',
    kind: 'payment_received',
    title: '$ariel: Network capacity: 95%. Ready for more.',
    body: 'Network capacity: 95%. Ready for more.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'ai_manager',
      name: '$ariel',
      avatar: ariel.avatar
    },
    metadata: {
      character: 'ariel',
      priority: 7,
      cooldown: 15
    }
  }
]

export const ARIEL_TEMPLATES: NotificationTemplate[] = [
  ...largeTransferTemplates,
  ...agentCoordinationTemplates,
  ...routingDecisionTemplates,
  ...statusUpdateTemplates
]

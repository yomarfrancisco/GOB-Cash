/**
 * Notification System v2.0 - Agent Activity Templates
 * Human agents: Check-ins, productivity, milestones, competing
 * Voice: Direct, factual. Uses agent handles.
 * Amount range: R8,000 - R52,000 (daily/weekly volumes)
 */

import type { NotificationTemplate } from './types'
import { AGENT_REGISTRY } from './agentRegistry'

// Helper to get agent data (will be substituted by selection logic)
const getAgentData = (agentId: string) => {
  const agent = AGENT_REGISTRY.find(a => a.id === agentId)
  return agent || AGENT_REGISTRY[0] // Fallback to first agent
}

// Check-ins (10 templates)
const checkinTemplates: NotificationTemplate[] = [
  {
    id: 'agent-01',
    category: 'agent_checkin',
    kind: 'payment_received',
    title: '@thabo checked in. Ready for transactions.',
    body: 'Agent online in Johannesburg.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@thabo',
      avatar: '/assets/avatar_agent5.png'
    },
    map: {
      lat: getAgentData('thabo').lat,
      lng: getAgentData('thabo').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'thabo',
      priority: 5,
      cooldown: 30
    }
  },
  {
    id: 'agent-02',
    category: 'agent_checkin',
    kind: 'payment_received',
    title: '@lindiwe is online. High productivity agent active.',
    body: 'Agent ready in Durban.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@lindiwe',
      avatar: '/assets/avatar_agent6.png'
    },
    map: {
      lat: getAgentData('lindiwe').lat,
      lng: getAgentData('lindiwe').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'lindiwe',
      priority: 6,
      cooldown: 30
    }
  },
  {
    id: 'agent-03',
    category: 'agent_checkin',
    kind: 'payment_received',
    title: '@sipho checked in. Rising agent online.',
    body: 'Agent active in Pretoria.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@sipho',
      avatar: '/assets/avatar_agent7.png'
    },
    map: {
      lat: getAgentData('sipho').lat,
      lng: getAgentData('sipho').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'sipho',
      priority: 5,
      cooldown: 30
    }
  },
  {
    id: 'agent-04',
    category: 'agent_checkin',
    kind: 'payment_received',
    title: '@grace is online. Top-rated agent active.',
    body: 'Veteran agent ready in Soweto.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@grace',
      avatar: '/assets/avatar_agent8.png'
    },
    map: {
      lat: getAgentData('grace').lat,
      lng: getAgentData('grace').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'grace',
      priority: 6,
      cooldown: 30
    }
  },
  {
    id: 'agent-05',
    category: 'agent_checkin',
    kind: 'payment_received',
    title: '@tendai checked in. Cross-border specialist online.',
    body: 'Agent active in Harare.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@tendai',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: getAgentData('tendai').lat,
      lng: getAgentData('tendai').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'tendai',
      priority: 6,
      cooldown: 30
    }
  },
  {
    id: 'agent-06',
    category: 'agent_checkin',
    kind: 'payment_received',
    title: '@blessing is online. Maputo corridor agent active.',
    body: 'Agent ready in Maputo.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@blessing',
      avatar: '/assets/avatar_agent2.png'
    },
    map: {
      lat: getAgentData('blessing').lat,
      lng: getAgentData('blessing').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'blessing',
      priority: 6,
      cooldown: 30
    }
  },
  {
    id: 'agent-07',
    category: 'agent_checkin',
    kind: 'payment_received',
    title: '@chipo checked in. Reliable agent online.',
    body: 'Agent active in Bulawayo.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@chipo',
      avatar: '/assets/avatar_agent3.png'
    },
    map: {
      lat: getAgentData('chipo').lat,
      lng: getAgentData('chipo').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'chipo',
      priority: 5,
      cooldown: 30
    }
  },
  {
    id: 'agent-08',
    category: 'agent_checkin',
    kind: 'payment_received',
    title: '@nomsa is online. High-volume agent active.',
    body: 'Agent ready in Cape Town.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@nomsa',
      avatar: '/assets/avatar_agent4.png'
    },
    map: {
      lat: getAgentData('nomsa').lat,
      lng: getAgentData('nomsa').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'nomsa',
      priority: 6,
      cooldown: 30
    }
  },
  {
    id: 'agent-09',
    category: 'agent_checkin',
    kind: 'payment_received',
    title: '@tawanda checked in. Border specialist online.',
    body: 'Agent active in Mutare.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@tawanda',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: getAgentData('tawanda').lat,
      lng: getAgentData('tawanda').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'tawanda',
      priority: 5,
      cooldown: 30
    }
  },
  {
    id: 'agent-10',
    category: 'agent_checkin',
    kind: 'payment_received',
    title: '@fatima is online. Coastal corridor agent active.',
    body: 'Agent ready in Inhambane.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@fatima',
      avatar: '/assets/avatar_agent2.png'
    },
    map: {
      lat: getAgentData('fatima').lat,
      lng: getAgentData('fatima').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'fatima',
      priority: 5,
      cooldown: 30
    }
  }
]

// Productivity (8 templates)
const productivityTemplates: NotificationTemplate[] = [
  {
    id: 'agent-11',
    category: 'agent_productivity',
    kind: 'payment_received',
    title: '@thabo moved R12,000 today. Steady productivity.',
    body: '8 transactions completed.',
    amount: {
      currency: 'ZAR',
      baseValue: 12000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@thabo',
      avatar: '/assets/avatar_agent5.png'
    },
    map: {
      lat: getAgentData('thabo').lat,
      lng: getAgentData('thabo').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'thabo',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'agent-12',
    category: 'agent_productivity',
    kind: 'payment_received',
    title: '@lindiwe processed R28,000 this shift. Top performer.',
    body: '15 transactions. High productivity.',
    amount: {
      currency: 'ZAR',
      baseValue: 28000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@lindiwe',
      avatar: '/assets/avatar_agent6.png'
    },
    map: {
      lat: getAgentData('lindiwe').lat,
      lng: getAgentData('lindiwe').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'lindiwe',
      priority: 7,
      cooldown: 60
    }
  },
  {
    id: 'agent-13',
    category: 'agent_productivity',
    kind: 'payment_received',
    title: '@sipho moved R18,000 today. Growing fast.',
    body: '10 transactions. Rising agent.',
    amount: {
      currency: 'ZAR',
      baseValue: 18000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@sipho',
      avatar: '/assets/avatar_agent7.png'
    },
    map: {
      lat: getAgentData('sipho').lat,
      lng: getAgentData('sipho').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'sipho',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'agent-14',
    category: 'agent_productivity',
    kind: 'payment_received',
    title: '@grace processed R35,000 today. Veteran performance.',
    body: '18 transactions. Highest-rated agent.',
    amount: {
      currency: 'ZAR',
      baseValue: 35000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@grace',
      avatar: '/assets/avatar_agent8.png'
    },
    map: {
      lat: getAgentData('grace').lat,
      lng: getAgentData('grace').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'grace',
      priority: 7,
      cooldown: 60
    }
  },
  {
    id: 'agent-15',
    category: 'agent_productivity',
    kind: 'payment_received',
    title: '@tendai moved R22,000 today. Cross-border specialist.',
    body: '12 transactions. Harare corridor active.',
    amount: {
      currency: 'ZAR',
      baseValue: 22000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@tendai',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: getAgentData('tendai').lat,
      lng: getAgentData('tendai').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'tendai',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'agent-16',
    category: 'agent_productivity',
    kind: 'payment_received',
    title: '@blessing processed R25,000 today. Maputo corridor active.',
    body: '14 transactions. Cross-border volume.',
    amount: {
      currency: 'ZAR',
      baseValue: 25000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@blessing',
      avatar: '/assets/avatar_agent2.png'
    },
    map: {
      lat: getAgentData('blessing').lat,
      lng: getAgentData('blessing').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'blessing',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'agent-17',
    category: 'agent_productivity',
    kind: 'payment_received',
    title: '@nomsa moved R42,000 today. High-volume agent.',
    body: '22 transactions. Cape Town active.',
    amount: {
      currency: 'ZAR',
      baseValue: 42000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@nomsa',
      avatar: '/assets/avatar_agent4.png'
    },
    map: {
      lat: getAgentData('nomsa').lat,
      lng: getAgentData('nomsa').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'nomsa',
      priority: 7,
      cooldown: 60
    }
  },
  {
    id: 'agent-18',
    category: 'agent_productivity',
    kind: 'payment_received',
    title: '@chipo processed R15,000 today. Consistent performance.',
    body: '9 transactions. Reliable agent.',
    amount: {
      currency: 'ZAR',
      baseValue: 15000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@chipo',
      avatar: '/assets/avatar_agent3.png'
    },
    map: {
      lat: getAgentData('chipo').lat,
      lng: getAgentData('chipo').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'chipo',
      priority: 5,
      cooldown: 60
    }
  }
]

// Milestones (7 templates)
const milestoneTemplates: NotificationTemplate[] = [
  {
    id: 'agent-19',
    category: 'agent_milestone',
    kind: 'payment_received',
    title: '@lindiwe hit R100,000 lifetime volume. Milestone reached.',
    body: 'Top productivity agent milestone.',
    amount: {
      currency: 'ZAR',
      baseValue: 100000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@lindiwe',
      avatar: '/assets/avatar_agent6.png'
    },
    map: {
      lat: getAgentData('lindiwe').lat,
      lng: getAgentData('lindiwe').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'lindiwe',
      priority: 8,
      cooldown: 120
    }
  },
  {
    id: 'agent-20',
    category: 'agent_milestone',
    kind: 'payment_received',
    title: '@grace completed 500 transactions. Veteran milestone.',
    body: 'Highest-rated agent achievement.',
    amount: {
      currency: 'ZAR',
      baseValue: 50000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@grace',
      avatar: '/assets/avatar_agent8.png'
    },
    map: {
      lat: getAgentData('grace').lat,
      lng: getAgentData('grace').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'grace',
      priority: 8,
      cooldown: 120
    }
  },
  {
    id: 'agent-21',
    category: 'agent_milestone',
    kind: 'payment_received',
    title: '@tendai processed R200,000 in cross-border transactions.',
    body: 'Border specialist milestone.',
    amount: {
      currency: 'ZAR',
      baseValue: 200000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@tendai',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: getAgentData('tendai').lat,
      lng: getAgentData('tendai').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'tendai',
      priority: 8,
      cooldown: 120
    }
  },
  {
    id: 'agent-22',
    category: 'agent_milestone',
    kind: 'payment_received',
    title: '@nomsa hit 1,000 transactions. High-volume milestone.',
    body: 'Cape Town agent achievement.',
    amount: {
      currency: 'ZAR',
      baseValue: 100000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@nomsa',
      avatar: '/assets/avatar_agent4.png'
    },
    map: {
      lat: getAgentData('nomsa').lat,
      lng: getAgentData('nomsa').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'nomsa',
      priority: 8,
      cooldown: 120
    }
  },
  {
    id: 'agent-23',
    category: 'agent_milestone',
    kind: 'payment_received',
    title: '@sipho reached R50,000 lifetime. Rising agent milestone.',
    body: 'Fast-growing agent achievement.',
    amount: {
      currency: 'ZAR',
      baseValue: 50000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@sipho',
      avatar: '/assets/avatar_agent7.png'
    },
    map: {
      lat: getAgentData('sipho').lat,
      lng: getAgentData('sipho').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'sipho',
      priority: 7,
      cooldown: 120
    }
  },
  {
    id: 'agent-24',
    category: 'agent_milestone',
    kind: 'payment_received',
    title: '@blessing processed R150,000 in Maputo corridor.',
    body: 'Cross-border specialist milestone.',
    amount: {
      currency: 'ZAR',
      baseValue: 150000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@blessing',
      avatar: '/assets/avatar_agent2.png'
    },
    map: {
      lat: getAgentData('blessing').lat,
      lng: getAgentData('blessing').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'blessing',
      priority: 8,
      cooldown: 120
    }
  },
  {
    id: 'agent-25',
    category: 'agent_milestone',
    kind: 'payment_received',
    title: '@thabo completed 300 transactions. Steady-earner milestone.',
    body: 'Reliable agent achievement.',
    amount: {
      currency: 'ZAR',
      baseValue: 75000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@thabo',
      avatar: '/assets/avatar_agent5.png'
    },
    map: {
      lat: getAgentData('thabo').lat,
      lng: getAgentData('thabo').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'thabo',
      priority: 7,
      cooldown: 120
    }
  }
]

// Shift ends (4 templates)
const shiftEndTemplates: NotificationTemplate[] = [
  {
    id: 'agent-26',
    category: 'agent_shift_end',
    kind: 'payment_received',
    title: '@lindiwe completed shift. R28,000 moved today.',
    body: 'High productivity shift complete.',
    amount: {
      currency: 'ZAR',
      baseValue: 28000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@lindiwe',
      avatar: '/assets/avatar_agent6.png'
    },
    map: {
      lat: getAgentData('lindiwe').lat,
      lng: getAgentData('lindiwe').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'lindiwe',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'agent-27',
    category: 'agent_shift_end',
    kind: 'payment_received',
    title: '@grace finished shift. R35,000 processed.',
    body: 'Veteran agent shift complete.',
    amount: {
      currency: 'ZAR',
      baseValue: 35000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@grace',
      avatar: '/assets/avatar_agent8.png'
    },
    map: {
      lat: getAgentData('grace').lat,
      lng: getAgentData('grace').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'grace',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'agent-28',
    category: 'agent_shift_end',
    kind: 'payment_received',
    title: '@nomsa completed shift. R42,000 moved today.',
    body: 'High-volume shift complete.',
    amount: {
      currency: 'ZAR',
      baseValue: 42000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@nomsa',
      avatar: '/assets/avatar_agent4.png'
    },
    map: {
      lat: getAgentData('nomsa').lat,
      lng: getAgentData('nomsa').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'nomsa',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'agent-29',
    category: 'agent_shift_end',
    kind: 'payment_received',
    title: '@tendai finished shift. R22,000 in cross-border transactions.',
    body: 'Border specialist shift complete.',
    amount: {
      currency: 'ZAR',
      baseValue: 22000,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@tendai',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: getAgentData('tendai').lat,
      lng: getAgentData('tendai').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'tendai',
      priority: 6,
      cooldown: 60
    }
  }
]

// Backing updates (5 templates)
const backingUpdateTemplates: NotificationTemplate[] = [
  {
    id: 'agent-30',
    category: 'backing_update',
    kind: 'payment_received',
    title: '@thabo is now being backed by 3 members.',
    body: 'Steady-earner agent receiving support.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@thabo',
      avatar: '/assets/avatar_agent5.png'
    },
    map: {
      lat: getAgentData('thabo').lat,
      lng: getAgentData('thabo').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'thabo',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'agent-31',
    category: 'backing_update',
    kind: 'payment_received',
    title: '@lindiwe now has 5 backers. High productivity attracts support.',
    body: 'Top performer receiving backing.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@lindiwe',
      avatar: '/assets/avatar_agent6.png'
    },
    map: {
      lat: getAgentData('lindiwe').lat,
      lng: getAgentData('lindiwe').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'lindiwe',
      priority: 7,
      cooldown: 60
    }
  },
  {
    id: 'agent-32',
    category: 'backing_update',
    kind: 'payment_received',
    title: '@grace reached 8 backers. Veteran agent milestone.',
    body: 'Highest-rated agent receiving support.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@grace',
      avatar: '/assets/avatar_agent8.png'
    },
    map: {
      lat: getAgentData('grace').lat,
      lng: getAgentData('grace').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'grace',
      priority: 7,
      cooldown: 60
    }
  },
  {
    id: 'agent-33',
    category: 'backing_update',
    kind: 'payment_received',
    title: '@tendai gained 2 new backers. Cross-border specialist.',
    body: 'Border specialist receiving support.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@tendai',
      avatar: '/assets/avatar_agent1.png'
    },
    map: {
      lat: getAgentData('tendai').lat,
      lng: getAgentData('tendai').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'tendai',
      priority: 6,
      cooldown: 60
    }
  },
  {
    id: 'agent-34',
    category: 'backing_update',
    kind: 'payment_received',
    title: '@nomsa now has 6 backers. High-volume agent support.',
    body: 'Cape Town agent receiving backing.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'member',
      name: '@nomsa',
      avatar: '/assets/avatar_agent4.png'
    },
    map: {
      lat: getAgentData('nomsa').lat,
      lng: getAgentData('nomsa').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'nomsa',
      priority: 6,
      cooldown: 60
    }
  }
]

// Agent competing (3 new templates from refinements)
const competingTemplates: NotificationTemplate[] = [
  {
    id: 'agent-35',
    category: 'agent_competing',
    kind: 'payment_received',
    title: '@lindiwe just passed @thabo on the leaderboard.',
    body: 'Productivity ranking updated.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    metadata: {
      character: 'agent',
      agentName: 'lindiwe',
      priority: 7,
      cooldown: 30
    }
  },
  {
    id: 'agent-36',
    category: 'agent_competing',
    kind: 'payment_received',
    title: 'Top 3 agents today: @grace, @lindiwe, @tendai.',
    body: 'Leaderboard update.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    metadata: {
      character: 'agent',
      priority: 7,
      cooldown: 30
    }
  },
  {
    id: 'agent-37',
    category: 'agent_competing',
    kind: 'payment_received',
    title: '@sipho is climbing fast. Up 40 spots this week.',
    body: 'Rising agent on the move.',
    amount: {
      currency: 'ZAR',
      baseValue: 0,
      direction: 'up'
    },
    actor: {
      type: 'system',
      name: 'Network',
      avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
    },
    map: {
      lat: getAgentData('sipho').lat,
      lng: getAgentData('sipho').lng
    },
    metadata: {
      character: 'agent',
      agentName: 'sipho',
      priority: 7,
      cooldown: 30
    }
  }
]

export const AGENT_TEMPLATES: NotificationTemplate[] = [
  ...checkinTemplates,
  ...productivityTemplates,
  ...milestoneTemplates,
  ...shiftEndTemplates,
  ...backingUpdateTemplates,
  ...competingTemplates
]

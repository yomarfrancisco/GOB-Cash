# Notification System v2.0 Implementation Plan

**Status**: PROPOSAL ONLY - NOT YET EXECUTED  
**Date**: 2024  
**Purpose**: Detailed implementation plan for transforming notifications into character-driven stories

---

## Executive Summary

This plan outlines the implementation of a character-based notification system (v2.0) that transforms system alerts into living stories from AI managers ($ama, $ariel), human agents, and the network. The system will include **180+ notifications** across **8 categories** with consistent character voices, intelligent sequencing, and narrative coherence.

**Key Changes**:
- Character-based voice system ($ama, $ariel, agents, network)
- 180+ notification templates (up from ~16)
- Extended demo sequencing with intelligent prioritization
- Competition/gamification notifications
- Agent-specific notifications for users who are agents
- Network pulse notifications

---

## 1. Current System Analysis

### 1.1 Current Architecture

**File**: `src/lib/demo/demoNotificationEngine.ts`
- **Current notifications**: ~16 templates
- **Selection logic**: Simple random selection with AI prioritization in first 8 seconds
- **Timing**: Config-based intervals (8-15s for unauthenticated, 60-120s for authenticated)
- **Amount variance**: ±10% randomization
- **No repeat prevention**: Same notification can appear multiple times

**File**: `src/store/notifications.ts`
- **Notification kinds**: 9 types (payment_sent, payment_received, request_sent, payment_failed, refund, ai_trade, mode-change, transfer, sponsorship)
- **Actor types**: 5 types (user, ai_manager, member, system, co_op)
- **Structure**: Supports title, body, action, reason, amount, actor, map, routeOnTap

### 1.2 Current Limitations

1. **Limited variety**: Only 16 notification templates
2. **No character voice**: Generic system messages
3. **No repeat prevention**: Same notification can appear multiple times
4. **No sequencing intelligence**: Random selection without narrative flow
5. **No agent-specific notifications**: No differentiation for users who are agents
6. **No competition/gamification**: No leaderboard or ranking notifications
7. **No network pulse**: Limited community activity notifications

---

## 2. Proposed System Architecture

### 2.1 Notification Template Structure

**New File**: `src/lib/demo/notificationTemplates.ts`

```typescript
type NotificationTemplate = {
  id: string                    // e.g., "ama-01", "agent-01", "xborder-01"
  category: NotificationCategory
  kind: NotificationKind
  title: string                 // Character name + message (e.g., "$ama: Pulled R250...")
  body?: string                 // Optional additional detail
  action?: string                // For AI trades: what happened
  reason?: string               // For AI trades: why it happened
  amount?: {
    currency: 'ZAR' | 'USDT'
    baseValue: number            // Base amount before variance
    direction: 'up' | 'down'
  }
  actor: ActorIdentity
  map?: {
    lat: number
    lng: number
    markerId?: string
  }
  routeOnTap?: string
  metadata: {
    character?: 'ama' | 'ariel' | 'network' | 'agent' | 'user'
    agentName?: string           // For agent-specific notifications
    requiresAuth?: boolean       // Only show when authenticated
    priority?: number            // 1-10, higher = more important
    cooldown?: number            // Minutes before this can repeat
  }
}
```

### 2.2 Character System

**New File**: `src/lib/demo/notificationCharacters.ts`

```typescript
type CharacterConfig = {
  id: 'ama' | 'ariel' | 'network' | 'agent' | 'user'
  name: string                   // Display name (e.g., "$ama", "$ariel", "Network")
  avatar: string                 // Avatar path
  voice: {
    pronoun: 'I' | 'we' | 'they' // For $ama: "I", for network: "we"
    tone: 'calm' | 'direct' | 'observational'
    sentenceLength: 'short' | 'medium' | 'long'
  }
}

const CHARACTERS: Record<string, CharacterConfig> = {
  ama: {
    id: 'ama',
    name: '$ama',
    avatar: '/assets/Brics-girl-blue.png',
    voice: {
      pronoun: 'I',
      tone: 'calm',
      sentenceLength: 'medium'
    }
  },
  ariel: {
    id: 'ariel',
    name: '$ariel',
    avatar: '/assets/Brics-girl-blue.png', // TODO: Get $ariel avatar
    voice: {
      pronoun: 'I',
      tone: 'direct',
      sentenceLength: 'short'
    }
  },
  network: {
    id: 'network',
    name: 'Network',
    avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png',
    voice: {
      pronoun: 'we',
      tone: 'observational',
      sentenceLength: 'medium'
    }
  }
}
```

### 2.3 Agent Registry

**New File**: `src/lib/demo/agentRegistry.ts`

```typescript
type AgentProfile = {
  id: string                     // e.g., "thabo", "lindiwe"
  name: string                   // Display name (e.g., "@thabo")
  handle: string                 // Full handle (e.g., "@thabo")
  city: string                   // e.g., "Johannesburg"
  country: string                // e.g., "South Africa"
  avatar: string                 // Avatar path
  lat: number
  lng: number
  productivity: number           // 0-100, for ranking
  specialties: string[]          // e.g., ["cross-border", "large-transactions"]
}

const AGENT_REGISTRY: AgentProfile[] = [
  {
    id: 'thabo',
    name: '@thabo',
    handle: '@thabo',
    city: 'Johannesburg',
    country: 'South Africa',
    avatar: '/assets/avatar_agent5.png',
    lat: -26.2041,
    lng: 28.0473,
    productivity: 85,
    specialties: ['reliable', 'steady-earner']
  },
  {
    id: 'lindiwe',
    name: '@lindiwe',
    handle: '@lindiwe',
    city: 'Durban',
    country: 'South Africa',
    avatar: '/assets/avatar_agent6.png',
    lat: -29.8587,
    lng: 31.0218,
    productivity: 95,
    specialties: ['high-performer', 'top-productivity']
  },
  // ... 8 more agents
]
```

---

## 3. Implementation Phases

### Phase 1: Foundation & Data Structure (Week 1)

#### 1.1 Create Template System

**Files to Create**:
- `src/lib/demo/notificationTemplates.ts` - All 180+ notification templates
- `src/lib/demo/notificationCharacters.ts` - Character definitions
- `src/lib/demo/agentRegistry.ts` - Agent profiles

**Tasks**:
1. Define `NotificationTemplate` type
2. Create character config system
3. Create agent registry with 10 agents
4. Organize templates by category:
   - Category 1: $ama (39 templates)
   - Category 2: $ariel (17 templates)
   - Category 3: Human Agents (34 templates)
   - Category 4: Cross-Border (20 templates)
   - Category 5: Network Pulse (30 templates)
   - Category 6: User Actions (19 templates)
   - Category 7: Competition (17 templates)
   - Category 8: Agent-Specific (20 templates)

**Deliverable**: All templates defined in TypeScript with proper typing

#### 1.2 Update Notification Store (if needed)

**File**: `src/store/notifications.ts`

**Tasks**:
1. Verify current structure supports new templates (should be compatible)
2. Add new notification kinds if needed:
   - `agent_checkin` - Agent check-in notifications
   - `agent_productivity` - Agent productivity updates
   - `agent_milestone` - Agent milestone achievements
   - `network_pulse` - Network activity notifications
   - `competition` - Ranking/leaderboard notifications
   - `agent_you` - Notifications for users who are agents

**Decision Point**: Can we reuse existing kinds or need new ones?

**Recommendation**: Reuse existing kinds where possible:
- `agent_checkin` → `payment_received` (with agent actor)
- `agent_productivity` → `payment_received` (with agent actor)
- `agent_milestone` → `payment_received` (with agent actor)
- `network_pulse` → `payment_received` (with system actor, name: "Network")
- `competition` → `payment_received` (with system actor)
- `agent_you` → `payment_sent` or `payment_received` (with user actor)

**Deliverable**: Updated notification kinds (if needed) or mapping document

---

### Phase 2: Template Implementation (Week 2)

#### 2.1 Implement $ama Templates (39 notifications)

**File**: `src/lib/demo/notificationTemplates.ts`

**Categories**:
- Protection & Defense (10 templates: ama-01 to ama-10)
- Recovery & Growth (5 templates: ama-11 to ama-15)
- Opportunity Spotting (8 templates: ama-16 to ama-23)
- Performance Updates (6 templates: ama-24 to ama-29)
- Rebalancing (4 templates: ama-30 to ama-33)
- Market Commentary (6 templates: ama-34 to ama-39)

**Implementation Pattern**:
```typescript
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
    avatar: '/assets/Brics-girl-blue.png'
  },
  routeOnTap: '/transactions',
  metadata: {
    character: 'ama',
    priority: 8,
    cooldown: 5 // 5 minutes before this can repeat
  }
}
```

**Tasks**:
1. Implement all 39 $ama templates
2. Ensure first-person voice ("I moved...", "I saw...")
3. Add appropriate amounts with base values
4. Set cooldown periods (3-10 minutes depending on importance)

**Deliverable**: All $ama templates implemented

#### 2.2 Implement $ariel Templates (17 notifications)

**Categories**:
- Large Transfers (6 templates: ariel-01 to ariel-06)
- Agent Coordination (4 templates: ariel-07 to ariel-10)
- Routing Decisions (4 templates: ariel-11 to ariel-14)
- Status Updates (3 templates: ariel-15 to ariel-17)

**Implementation Pattern**:
```typescript
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
    type: 'ai_manager', // Or new type 'large_operations_ai'?
    name: '$ariel',
    avatar: '/assets/Brics-girl-blue.png' // TODO: Get $ariel avatar
  },
  metadata: {
    character: 'ariel',
    priority: 9,
    cooldown: 10
  }
}
```

**Decision Point**: Should $ariel be a separate actor type or use `ai_manager`?

**Recommendation**: Use `ai_manager` with `name: '$ariel'` for now. Can add `large_operations_ai` type later if needed.

**Tasks**:
1. Implement all 17 $ariel templates
2. Ensure direct, short sentence voice
3. Add large amounts (R20,000+)
4. Set appropriate cooldowns

**Deliverable**: All $ariel templates implemented

#### 2.3 Implement Agent Templates (34 notifications)

**Categories**:
- Check-Ins (10 templates: agent-01 to agent-10)
- Productivity (8 templates: agent-11 to agent-18)
- Milestones (7 templates: agent-19 to agent-25)
- Shift Ends (4 templates: agent-26 to agent-29)
- Backing Updates (5 templates: agent-30 to agent-34)

**Implementation Pattern**:
```typescript
{
  id: 'agent-01',
  category: 'agent_checkin',
  kind: 'payment_received',
  title: '@thabo just checked in. 3h shift started.',
  body: '@thabo just checked in. 3h shift started.',
  actor: {
    type: 'member',
    id: 'thabo',
    name: '@thabo',
    handle: '@thabo',
    avatar: '/assets/avatar_agent5.png'
  },
  map: {
    lat: -26.2041,
    lng: 28.0473,
    markerId: 'thabo'
  },
  metadata: {
    character: 'agent',
    agentName: 'thabo',
    priority: 5,
    cooldown: 30 // 30 minutes before same agent can check in again
  }
}
```

**Tasks**:
1. Implement all 34 agent templates
2. Rotate through 10 agents (don't always use @thabo)
3. Add map coordinates for agent locations
4. Implement agent name substitution logic
5. Set cooldowns per agent (prevent same agent appearing too frequently)

**Deliverable**: All agent templates implemented with agent rotation

#### 2.4 Implement Cross-Border Templates (20 notifications)

**Categories**:
- Incoming (7 templates: xborder-01 to xborder-07)
- Outgoing (6 templates: xborder-08 to xborder-13)
- Multi-Hop Routes (3 templates: xborder-14 to xborder-16)
- Celebratory (4 templates: xborder-17 to xborder-20)

**Implementation Pattern**:
```typescript
{
  id: 'xborder-01',
  category: 'cross_border_incoming',
  kind: 'payment_received',
  title: 'R450 from Mozambique just landed. Faster than a bank could blink.',
  body: 'R450 from Mozambique just landed. Faster than a bank could blink.',
  amount: {
    currency: 'ZAR',
    baseValue: 450,
    direction: 'up'
  },
  actor: {
    type: 'member',
    avatar: '/assets/avatar_agent5.png'
  },
  map: {
    lat: -25.9692, // Maputo
    lng: 32.5732,
    markerId: 'maputo-transfer'
  },
  metadata: {
    character: 'user',
    priority: 7,
    cooldown: 5
  }
}
```

**Tasks**:
1. Implement all 20 cross-border templates
2. Add map coordinates for origin/destination cities
3. Vary amounts (R450 to R4,500)
4. Include celebratory tone for some notifications

**Deliverable**: All cross-border templates implemented

#### 2.5 Implement Network Pulse Templates (30 notifications)

**Categories**:
- Corridor Activity (6 templates: network-01 to network-06)
- Community Milestones (6 templates: network-07 to network-12)
- Local Activity (6 templates: network-13 to network-18)
- Agent Economy (6 templates: network-19 to network-24)
- Time-Based (6 templates: network-25 to network-30)

**Implementation Pattern**:
```typescript
{
  id: 'network-01',
  category: 'network_pulse',
  kind: 'payment_received',
  title: 'Network: Harare corridor is busy. R2.4M moved since morning.',
  body: 'Harare corridor is busy. R2.4M moved since morning.',
  actor: {
    type: 'system',
    name: 'Network',
    avatar: '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'
  },
  metadata: {
    character: 'network',
    priority: 4,
    cooldown: 15 // Network notifications less frequent
  }
}
```

**Tasks**:
1. Implement all 30 network templates
2. Ensure all start with "Network:"
3. Use observational tone (facts, not brags)
4. Include real-sounding numbers (R2.4M, 340 transactions/hour)
5. Set longer cooldowns (10-20 minutes)

**Deliverable**: All network templates implemented

#### 2.6 Implement User Action Templates (19 notifications)

**Categories**:
- Payments Sent (4 templates: user-01 to user-04)
- Backing Started (4 templates: user-05 to user-08)
- Deposits (4 templates: user-09 to user-12)
- Transfers (4 templates: user-13 to user-16)
- Withdrawals (3 templates: user-17 to user-19)

**Implementation Pattern**:
```typescript
{
  id: 'user-01',
  category: 'user_payment',
  kind: 'payment_sent',
  title: 'R280 to @member2. Delivered.',
  body: 'R280 to @member2. Delivered.',
  amount: {
    currency: 'ZAR',
    baseValue: 280,
    direction: 'down'
  },
  actor: {
    type: 'user'
  },
  metadata: {
    character: 'user',
    priority: 6,
    cooldown: 3
  }
}
```

**Tasks**:
1. Implement all 19 user action templates
2. Keep tone simple and direct
3. Use appropriate amounts
4. Set short cooldowns (2-5 minutes)

**Deliverable**: All user action templates implemented

#### 2.7 Implement Competition Templates (17 notifications)

**Categories**:
- Your Rank (5 templates: compete-01 to compete-05)
- Streaks (4 templates: compete-06 to compete-09)
- Level Ups (4 templates: compete-10 to compete-13)
- Comparisons (4 templates: compete-14 to compete-17)

**Implementation Pattern**:
```typescript
{
  id: 'compete-01',
  category: 'competition',
  kind: 'payment_received',
  title: 'Your productivity is up 8% this week. Rank: 847 of 12,000.',
  body: 'Your productivity is up 8% this week. Rank: 847 of 12,000.',
  actor: {
    type: 'system',
    name: 'GoBankless'
  },
  metadata: {
    character: 'user',
    requiresAuth: true, // Only show when authenticated
    priority: 5,
    cooldown: 60 // 1 hour before same type can repeat
  }
}
```

**Tasks**:
1. Implement all 17 competition templates
2. Mark as `requiresAuth: true` (only for authenticated users)
3. Use realistic ranking numbers
4. Set longer cooldowns (30-60 minutes)

**Deliverable**: All competition templates implemented

#### 2.8 Implement Agent-Specific Templates (20 notifications)

**Categories**:
- Your Shift (4 templates: agent-you-01 to agent-you-04)
- Your Earnings (4 templates: agent-you-05 to agent-you-08)
- Your Productivity (4 templates: agent-you-09 to agent-you-12)
- Customer Requests (4 templates: agent-you-13 to agent-you-16)
- Milestones (4 templates: agent-you-17 to agent-you-20)

**Implementation Pattern**:
```typescript
{
  id: 'agent-you-01',
  category: 'agent_you',
  kind: 'payment_sent',
  title: 'Shift started. You\'re visible to customers.',
  body: 'Shift started. You\'re visible to customers.',
  actor: {
    type: 'user'
  },
  metadata: {
    character: 'user',
    requiresAuth: true,
    requiresAgentRole: true, // Only show if user is an agent
    priority: 7,
    cooldown: 5
  }
}
```

**Tasks**:
1. Implement all 20 agent-specific templates
2. Mark as `requiresAuth: true` and `requiresAgentRole: true`
3. Use second-person voice ("You earned...", "Your shift...")
4. Set appropriate cooldowns

**Deliverable**: All agent-specific templates implemented

---

### Phase 3: Selection & Sequencing Logic (Week 3)

#### 3.1 Implement Repeat Prevention

**File**: `src/lib/demo/demoNotificationEngine.ts`

**New State**:
```typescript
let recentNotificationIds: string[] = [] // Track last 20 notification IDs
let notificationCooldowns: Map<string, number> = new Map() // ID -> timestamp when it can repeat
```

**New Function**:
```typescript
function canUseNotification(template: NotificationTemplate, secondsSinceStart: number): boolean {
  // Check cooldown
  const cooldownMs = (template.metadata.cooldown || 3) * 60 * 1000
  const lastUsed = notificationCooldowns.get(template.id) || 0
  if (Date.now() - lastUsed < cooldownMs) {
    return false
  }
  
  // Check if recently used (within last 3 minutes)
  if (recentNotificationIds.includes(template.id)) {
    return false
  }
  
  // Check auth requirements
  if (template.metadata.requiresAuth && !currentIsAuthed) {
    return false
  }
  
  // Check agent role requirements
  if (template.metadata.requiresAgentRole) {
    // TODO: Check if user is an agent
    // For now, skip in demo mode
    if (!currentIsAuthed) {
      return false
    }
  }
  
  return true
}
```

**Tasks**:
1. Implement cooldown tracking
2. Implement recent notification tracking (last 20)
3. Implement auth requirement checking
4. Implement agent role checking (stub for now)

**Deliverable**: Repeat prevention system working

#### 3.2 Implement Intelligent Selection

**New Function**:
```typescript
function selectNotification(
  secondsSinceStart: number,
  recentCategories: string[]
): NotificationTemplate {
  const availableTemplates = ALL_TEMPLATES.filter(t => 
    canUseNotification(t, secondsSinceStart)
  )
  
  // Phase 1: First 3 notifications (0-30 seconds)
  if (secondsSinceStart < 30) {
    // 50% chance of $ama (establish AI presence)
    if (Math.random() < 0.5) {
      const amaTemplates = availableTemplates.filter(t => 
        t.metadata.character === 'ama'
      )
      if (amaTemplates.length > 0) {
        return selectByPriority(amaTemplates)
      }
    }
  }
  
  // Phase 2: Next 2 minutes (30-150 seconds)
  if (secondsSinceStart < 150) {
    // Mix: AI (30%), Cross-border (25%), Agent (25%), Network (20%)
    const categoryWeights = {
      ai_protection: 0.15,
      ai_opportunity: 0.15,
      cross_border: 0.25,
      agent_checkin: 0.15,
      agent_productivity: 0.10,
      network_pulse: 0.20
    }
    return selectByCategoryWeights(availableTemplates, categoryWeights)
  }
  
  // Phase 3: Extended demo (150+ seconds)
  // Balanced distribution with category diversity
  return selectWithCategoryDiversity(availableTemplates, recentCategories)
}
```

**Tasks**:
1. Implement phase-based selection (0-30s, 30-150s, 150+s)
2. Implement priority-based selection
3. Implement category weight system
4. Implement category diversity (avoid repeating same category 3x in a row)

**Deliverable**: Intelligent selection system working

#### 3.3 Implement Agent Name Rotation

**New Function**:
```typescript
function substituteAgentName(template: NotificationTemplate): NotificationTemplate {
  if (!template.metadata.agentName) {
    return template
  }
  
  // Select random agent from registry
  const availableAgents = AGENT_REGISTRY.filter(a => 
    !recentAgentIds.includes(a.id) // Don't use same agent twice in a row
  )
  const agent = availableAgents[Math.floor(Math.random() * availableAgents.length)] || 
                AGENT_REGISTRY[0]
  
  // Substitute agent name in title and body
  const title = template.title.replace('@thabo', agent.handle)
                               .replace('@lindiwe', agent.handle)
                               // ... replace all agent names
  const body = template.body?.replace('@thabo', agent.handle)
                            // ... replace all agent names
  
  // Update actor with agent details
  const actor = {
    ...template.actor,
    id: agent.id,
    name: agent.handle,
    handle: agent.handle,
    avatar: agent.avatar
  }
  
  // Update map coordinates
  const map = template.map ? {
    ...template.map,
    lat: agent.lat,
    lng: agent.lng,
    markerId: agent.id
  } : undefined
  
  return {
    ...template,
    title,
    body,
    actor,
    map
  }
}
```

**Tasks**:
1. Implement agent name substitution
2. Implement agent rotation (don't use same agent twice in a row)
3. Update actor and map coordinates based on selected agent
4. Handle agent-specific amounts (e.g., "@lindiwe moved R12,000")

**Deliverable**: Agent rotation system working

#### 3.4 Implement Amount Variance

**Enhancement to existing logic**:
```typescript
function applyAmountVariance(template: NotificationTemplate): NotificationTemplate {
  if (!template.amount) {
    return template
  }
  
  // ±10% variance
  const variance = 0.9 + Math.random() * 0.2 // 0.9 to 1.1
  const variedValue = Math.round(template.amount.baseValue * variance * 100) / 100
  
  // Update title and body with varied amount
  const title = template.title.replace(
    `R${template.amount.baseValue}`,
    formatAmount(variedValue)
  )
  const body = template.body?.replace(
    `R${template.amount.baseValue}`,
    formatAmount(variedValue)
  )
  
  return {
    ...template,
    title,
    body,
    amount: {
      ...template.amount,
      value: variedValue * (template.amount.direction === 'up' ? 1 : -1)
    }
  }
}
```

**Tasks**:
1. Enhance amount variance to update title/body text
2. Implement `formatAmount()` helper (R1,200 format)
3. Ensure variance applies to all amount references

**Deliverable**: Enhanced amount variance working

---

### Phase 4: Character Voice System (Week 4)

#### 4.1 Implement Character Title Formatting

**New Function**:
```typescript
function formatCharacterTitle(template: NotificationTemplate): string {
  const character = CHARACTERS[template.metadata.character || 'user']
  if (!character) {
    return template.title
  }
  
  // Ensure title starts with character name
  if (!template.title.startsWith(character.name)) {
    return `${character.name}: ${template.title}`
  }
  
  return template.title
}
```

**Tasks**:
1. Implement character name prefixing
2. Ensure $ama, $ariel, Network all have proper prefixes
3. Handle agent notifications (use agent handle, not character name)

**Deliverable**: Character titles formatted correctly

#### 4.2 Implement Voice Consistency Checks

**New Function**:
```typescript
function validateVoiceConsistency(template: NotificationTemplate): boolean {
  const character = CHARACTERS[template.metadata.character || 'user']
  if (!character) {
    return true
  }
  
  // Check pronoun usage
  if (character.voice.pronoun === 'I') {
    // $ama and $ariel should use "I"
    if (template.title.includes('we ') || template.title.includes('We ')) {
      console.warn(`Template ${template.id} uses "we" but character uses "I"`)
      return false
    }
  }
  
  // Check sentence length
  const wordCount = template.title.split(' ').length
  if (character.voice.sentenceLength === 'short' && wordCount > 12) {
    console.warn(`Template ${template.id} is too long for ${character.id}`)
    return false
  }
  
  return true
}
```

**Tasks**:
1. Implement voice validation
2. Run validation on all templates during build
3. Fix any inconsistencies found

**Deliverable**: Voice consistency validated

---

### Phase 5: Demo Sequencing (Week 5)

#### 5.1 Implement Extended Demo Sequence

**New File**: `src/lib/demo/demoSequence.ts`

```typescript
type DemoSequenceStep = {
  time: number // Seconds since start
  templateId: string
  category: string
}

const EXTENDED_DEMO_SEQUENCE: DemoSequenceStep[] = [
  { time: 5, templateId: 'ama-34', category: 'ai' },
  { time: 15, templateId: 'agent-01', category: 'agent' },
  { time: 28, templateId: 'xborder-01', category: 'cross_border' },
  { time: 42, templateId: 'ama-03', category: 'ai' },
  { time: 58, templateId: 'network-13', category: 'network' },
  // ... continue for 5+ minutes
]

function getSequencedNotification(
  secondsSinceStart: number,
  sequence: DemoSequenceStep[]
): NotificationTemplate | null {
  // Find next step in sequence
  const nextStep = sequence.find(step => step.time > secondsSinceStart)
  if (!nextStep) {
    return null // Sequence complete, use random selection
  }
  
  // Check if we're close enough to the step time (±2 seconds)
  if (Math.abs(secondsSinceStart - nextStep.time) < 2) {
    const template = ALL_TEMPLATES.find(t => t.id === nextStep.templateId)
    if (template && canUseNotification(template, secondsSinceStart)) {
      return template
    }
  }
  
  return null
}
```

**Tasks**:
1. Create extended demo sequence (5+ minutes)
2. Implement sequence step matching
3. Fall back to random selection when sequence complete
4. Allow sequence to be interrupted by high-priority notifications

**Deliverable**: Extended demo sequence working

#### 5.2 Implement Timing Adjustments

**Update**: `src/lib/demo/demoConfig.ts`

```typescript
export const DEMO_NOTIFICATION_CONFIG = {
  lively: {
    INITIAL_DELAY_MS: 3000,           // 3-5s (was 8s)
    INTERVAL_MIN_MS: 12000,           // 12s (was 8s)
    INTERVAL_MAX_MS: 20000,           // 20s (was 15s)
    RATE_LIMIT_MS: 30000,
    MAX_NOTIFICATIONS_PER_WINDOW: 2,
  },
  // ... calm config unchanged
}
```

**Tasks**:
1. Update timing config to match proposal (12-20s intervals)
2. Update initial delay (3-5s instead of 8s)
3. Test timing feels natural

**Deliverable**: Timing adjusted to proposal specs

---

### Phase 6: Integration & Testing (Week 6)

#### 6.1 Update Demo Engine

**File**: `src/lib/demo/demoNotificationEngine.ts`

**Changes**:
1. Replace `demoEvents` array with `ALL_TEMPLATES` import
2. Replace `getRandomEvent()` with `selectNotification()`
3. Add repeat prevention logic
4. Add agent name substitution
5. Add amount variance enhancement
6. Add character title formatting
7. Integrate extended demo sequence

**Tasks**:
1. Refactor engine to use new template system
2. Integrate all new selection logic
3. Ensure backward compatibility with existing code
4. Test all notification categories appear

**Deliverable**: Demo engine fully refactored

#### 6.2 Update Sign-Up Success

**File**: `src/components/PhoneSignupSheet.tsx`

**Change**:
```typescript
pushNotification({
  kind: 'payment_sent',
  title: '$ama: You\'re in. Your wallet is ready. Let\'s make your money work.',
  actor: {
    type: 'ai_manager',
    name: '$ama',
    avatar: '/assets/Brics-girl-blue.png'
  },
})
```

**Tasks**:
1. Update sign-up success notification
2. Use $ama character voice
3. Test notification appears correctly

**Deliverable**: Sign-up notification updated

#### 6.3 Map Integration

**Enhancement**: Ensure all cross-border and agent notifications trigger map pans

**Tasks**:
1. Verify map coordinates in templates
2. Test map pan triggers for cross-border notifications
3. Test agent location highlights
4. Test multi-hop route visualization (if supported)

**Deliverable**: Map integration working

#### 6.4 Testing & Validation

**Test Cases**:
1. **Template Coverage**: All 180+ templates can be selected
2. **Character Voice**: $ama uses "I", Network uses "Network:", etc.
3. **Repeat Prevention**: Same notification doesn't appear within cooldown
4. **Agent Rotation**: Different agents appear, not always @thabo
5. **Amount Variance**: Amounts vary ±10% and update in title/body
6. **Timing**: Notifications appear at 12-20s intervals
7. **Sequencing**: First 3 notifications prioritize $ama (50% chance)
8. **Auth Requirements**: Competition/agent-you notifications only show when authenticated
9. **Map Integration**: Cross-border notifications trigger map pans
10. **Extended Demo**: 5+ minute sequence plays correctly

**Tasks**:
1. Create test suite
2. Run all test cases
3. Fix any issues found
4. Manual testing in browser

**Deliverable**: All tests passing

---

## 4. Technical Specifications

### 4.1 Data Structures

#### NotificationTemplate
```typescript
type NotificationTemplate = {
  id: string
  category: NotificationCategory
  kind: NotificationKind
  title: string
  body?: string
  action?: string
  reason?: string
  amount?: {
    currency: 'ZAR' | 'USDT'
    baseValue: number
    direction: 'up' | 'down'
  }
  actor: ActorIdentity
  map?: {
    lat: number
    lng: number
    markerId?: string
  }
  routeOnTap?: string
  metadata: {
    character?: 'ama' | 'ariel' | 'network' | 'agent' | 'user'
    agentName?: string
    requiresAuth?: boolean
    requiresAgentRole?: boolean
    priority?: number
    cooldown?: number
  }
}
```

#### NotificationCategory
```typescript
type NotificationCategory =
  | 'ai_protection'
  | 'ai_recovery'
  | 'ai_opportunity'
  | 'ai_performance'
  | 'ai_rebalancing'
  | 'ai_commentary'
  | 'large_transfer'
  | 'agent_coordination'
  | 'routing_decision'
  | 'status_update'
  | 'agent_checkin'
  | 'agent_productivity'
  | 'agent_milestone'
  | 'agent_shift_end'
  | 'backing_update'
  | 'cross_border_incoming'
  | 'cross_border_outgoing'
  | 'cross_border_multi_hop'
  | 'cross_border_celebratory'
  | 'network_corridor'
  | 'network_milestone'
  | 'network_local'
  | 'network_economy'
  | 'network_time'
  | 'user_payment'
  | 'user_backing'
  | 'user_deposit'
  | 'user_transfer'
  | 'user_withdrawal'
  | 'competition_rank'
  | 'competition_streak'
  | 'competition_level'
  | 'competition_compare'
  | 'agent_you_shift'
  | 'agent_you_earnings'
  | 'agent_you_productivity'
  | 'agent_you_request'
  | 'agent_you_milestone'
```

### 4.2 File Structure

```
src/lib/demo/
├── demoNotificationEngine.ts      # Main engine (refactored)
├── notificationTemplates.ts       # All 180+ templates (NEW)
├── notificationCharacters.ts      # Character definitions (NEW)
├── agentRegistry.ts               # Agent profiles (NEW)
├── demoSequence.ts                # Extended demo sequence (NEW)
├── demoConfig.ts                  # Timing config (updated)
└── notificationSelection.ts       # Selection logic (NEW)
```

### 4.3 Selection Algorithm

```typescript
function selectNotification(
  secondsSinceStart: number,
  recentCategories: string[],
  recentNotificationIds: string[]
): NotificationTemplate {
  // 1. Filter available templates
  const available = ALL_TEMPLATES.filter(t => 
    canUseNotification(t, secondsSinceStart, recentNotificationIds)
  )
  
  // 2. Check extended demo sequence
  const sequenced = getSequencedNotification(secondsSinceStart)
  if (sequenced && canUseNotification(sequenced, secondsSinceStart, recentNotificationIds)) {
    return sequenced
  }
  
  // 3. Phase-based selection
  if (secondsSinceStart < 30) {
    // Phase 1: Establish AI presence
    return selectWithAIPriority(available)
  } else if (secondsSinceStart < 150) {
    // Phase 2: Show variety
    return selectWithCategoryWeights(available, PHASE_2_WEIGHTS)
  } else {
    // Phase 3: Balanced with diversity
    return selectWithCategoryDiversity(available, recentCategories)
  }
}
```

### 4.4 Amount Formatting

```typescript
function formatAmount(value: number): string {
  if (value >= 1000) {
    // R1,200 format
    return `R${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  } else {
    // R450 format
    return `R${Math.round(value)}`
  }
}
```

---

## 5. Migration Strategy

### 5.1 Backward Compatibility

**Approach**: Maintain existing notification structure, enhance with new templates

**Compatibility Points**:
- ✅ Existing `NotificationItem` type supports all new templates
- ✅ Existing `NotificationKind` types can be reused
- ✅ Existing `ActorIdentity` types support characters
- ✅ Existing display components work with new templates

**No Breaking Changes**: All existing code continues to work

### 5.2 Rollout Plan

**Phase 1 (Week 1-2)**: Foundation
- Create template system
- Implement all templates
- No user-facing changes yet

**Phase 2 (Week 3-4)**: Logic
- Implement selection logic
- Implement character system
- Test in development

**Phase 3 (Week 5)**: Integration
- Integrate with demo engine
- Update sign-up notification
- Internal testing

**Phase 4 (Week 6)**: Testing & Refinement
- Comprehensive testing
- Fix issues
- Performance optimization

**Phase 5 (Week 7)**: Deployment
- Deploy to preview
- Monitor for issues
- Gather feedback
- Deploy to production

### 5.3 Feature Flags

**Option**: Add feature flag to toggle between v1 and v2

```typescript
const USE_V2_NOTIFICATIONS = process.env.NEXT_PUBLIC_V2_NOTIFICATIONS === 'true'

if (USE_V2_NOTIFICATIONS) {
  // Use new template system
} else {
  // Use old demoEvents array
}
```

**Recommendation**: ✅ **Yes, use feature flag** (see section 11.5)

Allows A/B testing, quick rollback, and gradual rollout.

---

## 6. Risk Assessment

### 6.1 Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Performance**: 180+ templates in memory | Medium | Lazy load templates, use efficient data structures |
| **Selection complexity**: Complex selection logic may be slow | Low | Cache filtered templates, optimize selection algorithm |
| **Template errors**: Typos or inconsistencies in 180+ templates | High | Automated validation, code review, test suite |
| **Character voice inconsistency**: Templates don't match character voice | Medium | Voice validation function, manual review |
| **Agent rotation bugs**: Same agent appears multiple times | Low | Robust agent tracking, test agent rotation |

### 6.2 UX Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Notification overload**: Too many notifications | High | Respect rate limiting, test timing carefully |
| **Character confusion**: Users don't understand $ama vs $ariel | Medium | Clear character definitions, consistent avatars |
| **Tone mismatch**: Character voice doesn't match brand | High | Copy review, brand alignment check |
| **Demo feels fake**: Too scripted or repetitive | Medium | Variety in selection, natural timing |

### 6.3 Implementation Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Scope creep**: 180+ templates is a lot of work | High | Phased implementation, prioritize high-impact templates first |
| **Maintenance burden**: Hard to update 180+ templates | Medium | Good organization, documentation, tooling |
| **Testing complexity**: Hard to test all combinations | Medium | Automated test suite, manual testing checklist |

---

## 7. Dependencies

### 7.1 Required Assets

- ✅ **$ama avatar**: `/assets/Brics-girl-blue.png` (exists)
- ✅ **$ariel avatar**: `/assets/avatar - profile (3).png` (confirmed, already used in inbox)
- ✅ **Agent avatars**: 8 agent avatars available
- ✅ **System avatar**: GoBankless admin avatar exists

### 7.2 Required Data

- ✅ **Agent locations**: Coordinates for 10 agents (can use existing demo agents)
- ✅ **City coordinates**: Map coordinates provided (see section 11.8)
- ✅ **User agent status**: Skip agent-you templates in demo mode; check user profile for authenticated mode

### 7.3 Code Dependencies

- ✅ **Notification store**: No changes needed
- ✅ **Activity store**: No changes needed
- ✅ **Map integration**: Existing `onMapPan` callback works
- ✅ **Card animations**: Existing `onCardAnimation` callback works
- ✅ **Agent role detection**: Skip in demo mode; check user profile for authenticated (see section 11.3)

---

## 8. Success Criteria

### 8.1 Functional Requirements

- [ ] All 180+ notification templates implemented
- [ ] Character voices consistent ($ama uses "I", Network uses "Network:")
- [ ] Agent names rotate (not always @thabo)
- [ ] Repeat prevention works (cooldowns respected)
- [ ] Amount variance applies to title/body
- [ ] Extended demo sequence plays (5+ minutes)
- [ ] Map integration works for cross-border notifications
- [ ] Auth requirements respected (competition/agent-you only when authenticated)
- [ ] Timing matches proposal (12-20s intervals, 3-5s initial delay)

### 8.2 Quality Requirements

- [ ] No typos or grammatical errors in templates
- [ ] Character voices match personality definitions
- [ ] Notifications feel natural, not scripted
- [ ] Variety in notification selection
- [ ] Performance: Selection completes in <10ms
- [ ] No console errors or warnings

### 8.3 User Experience Requirements

- [ ] Notifications create sense of living network
- [ ] AI presence established early (first 3 notifications)
- [ ] Cross-border magic demonstrated
- [ ] Agent activity feels real
- [ ] Network pulse creates FOMO and belonging
- [ ] Notifications don't feel overwhelming

---

## 9. Implementation Checklist

### Phase 1: Foundation
- [ ] Create `NotificationTemplate` type
- [ ] Create `notificationTemplates.ts` file
- [ ] Create `notificationCharacters.ts` file
- [ ] Create `agentRegistry.ts` file
- [ ] Implement all $ama templates (42 - includes 3 new failure/recovery templates)
- [ ] Implement all $ariel templates (17)
- [ ] Implement all agent templates (37 - includes 3 new competing templates)
- [ ] Implement all cross-border templates (20)
- [ ] Implement all network templates (30)
- [ ] Implement all user action templates (19)
- [ ] Implement all competition templates (17)
- [ ] Implement all agent-specific templates (20)
- [ ] Implement backing returns templates (3 new)

### Phase 2: Selection Logic
- [ ] Implement repeat prevention (cooldowns)
- [ ] Implement recent notification tracking
- [ ] Implement auth requirement checking
- [ ] Implement agent role checking
- [ ] Implement phase-based selection (0-30s, 30-150s, 150+s)
- [ ] Implement priority-based selection
- [ ] Implement category weight system
- [ ] Implement category diversity logic

### Phase 3: Character System
- [ ] Implement agent name substitution
- [ ] Implement agent rotation
- [ ] Implement character title formatting
- [ ] Implement voice consistency validation
- [ ] Test all character voices

### Phase 4: Sequencing
- [ ] Create extended demo sequence (fixed for first 2 minutes, then dynamic)
- [ ] Implement sequence step matching
- [ ] Implement sequence fallback to random
- [ ] Update timing config (12-20s intervals)

### Phase 5: Integration
- [ ] Refactor demo engine to use templates
- [ ] Integrate selection logic
- [ ] Integrate character system
- [ ] Integrate sequencing
- [ ] Update sign-up success notification
- [ ] Test map integration
- [ ] Test card animations

### Phase 6: Testing
- [ ] Create test suite
- [ ] Test template coverage
- [ ] Test character voices
- [ ] Test repeat prevention
- [ ] Test agent rotation
- [ ] Test amount variance
- [ ] Test timing
- [ ] Test sequencing
- [ ] Test auth requirements
- [ ] Manual browser testing
- [ ] Performance testing

---

## 10. Estimated Effort

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| **Phase 1: Foundation** | Create templates (185+), character system, agent registry | 50-60 hours |
| **Phase 2: Selection Logic** | Repeat prevention, intelligent selection | 15-20 hours |
| **Phase 3: Character System** | Voice formatting, agent rotation | 10-15 hours |
| **Phase 4: Sequencing** | Extended sequence (fixed + dynamic hybrid), timing adjustments | 8-10 hours |
| **Phase 5: Integration** | Refactor engine, integrate all systems | 15-20 hours |
| **Phase 6: Testing** | Test suite, manual testing, fixes | 20-25 hours |
| **Total** | | **118-150 hours** (~3 weeks for 1 developer) |

---

## 11. Refinements & Answers to Open Questions ✅

### 11.1 $ariel Avatar

**Answer**: ✅ **$ariel uses distinct avatar from $ama**

- **$ama**: `/assets/Brics-girl-blue.png` (sophisticated, portfolio-focused)
- **$ariel**: `/assets/avatar - profile (3).png` (bold, operations-focused, already used in inbox)

**Implementation**: Update character config to use correct avatar path.

---

### 11.2 Terminology: Backing vs Sponsorship

**Answer**: ✅ **Change all user-facing copy to "backing"**

| Current | Change To |
|---------|-----------|
| `kind: 'sponsorship'` (internal) | Keep internal kind, but all user-facing copy says "backing" |
| "Sponsorship activated" | "Now backing @thabo" |
| "You'll send R150 weekly..." | "R150/week committed. You earn when they move cash." |

**Implementation**: 
- Keep `kind: 'sponsorship'` internally (no breaking changes)
- All template titles/bodies use "backing" terminology
- Update existing templates that reference "sponsorship"

---

### 11.3 Agent Role Detection

**Answer**: ✅ **Skip agent-specific notifications in demo mode**

**Approach**:
```typescript
// For demo mode (unauthenticated): skip agent-you templates entirely
if (template.metadata.requiresAgentRole && !currentIsAuthed) {
  return false
}

// For authenticated mode: check user profile
if (template.metadata.requiresAgentRole && currentIsAuthed) {
  const user = useUserProfileStore.getState().profile
  const isAgent = user?.isAgent || user?.roles?.includes('agent') || false
  if (!isAgent) {
    return false
  }
}
```

**Note**: If no role system exists yet, add `isAgent: boolean` to user profile. Don't block v2.0 on this - just exclude `agent-you-*` templates from demo mode.

---

### 11.4 Notification Kinds — New vs Reuse

**Answer**: ✅ **Reuse existing kinds**

| Category | Reuse Kind |
|----------|------------|
| Agent check-ins | `payment_received` with `actor.type: 'member'` |
| Agent productivity | `payment_received` with `actor.type: 'member'` |
| Network pulse | `payment_received` with `actor.type: 'system', name: 'Network'` |
| Competition | `payment_received` with `actor.type: 'system'` |
| Agent-you | `payment_sent` or `payment_received` with `actor.type: 'user'` |

The `kind` is about UI treatment (icon, color). The `actor` and `title` carry the meaning.

---

### 11.5 Feature Flag

**Answer**: ✅ **Yes, use feature flag for safety**

```typescript
const USE_V2_NOTIFICATIONS = process.env.NEXT_PUBLIC_V2_NOTIFICATIONS === 'true'
```

**Benefits**:
- A/B testing
- Quick rollback if issues arise
- Gradual rollout

**Implementation**: Add to `.env.local` and check in demo engine.

---

### 11.6 Template Organization

**Answer**: ✅ **Confirmed: Split by category**

```
src/lib/demo/templates/
├── index.ts                  # Exports ALL_TEMPLATES
├── amaTemplates.ts           # 39 $ama
├── arielTemplates.ts         # 17 $ariel
├── agentTemplates.ts         # 34 agent activity
├── crossBorderTemplates.ts   # 20 cross-border
├── networkTemplates.ts       # 30 network pulse
├── userActionTemplates.ts    # 19 user actions
├── competitionTemplates.ts   # 17 competition
└── agentYouTemplates.ts      # 20 agent-specific (auth only)
```

---

### 11.7 Amount Ranges

**Answer**: ✅ **Defined ranges for each category**

| Category | Min | Max | Notes |
|----------|-----|-----|-------|
| $ama protection | R150 | R400 | Smaller moves feel tactical |
| $ama opportunity | R150 | R300 | Similar range |
| $ariel large transfers | R20,000 | R200,000 | This is the "big money" AI |
| Agent productivity | R8,000 | R52,000 | Daily/weekly volumes |
| Cross-border incoming | R450 | R4,500 | Realistic remittance range |
| Cross-border outgoing | R280 | R4,500 | Same range |
| User payments | R200 | R1,500 | Smaller peer payments |
| User deposits | R500 | R5,000 | Cash deposits |
| Backing | R100 | R200/week | Micro-investment |
| Network volumes | R1M | R50M | Big numbers for FOMO |

**Implementation**: Use these ranges when creating base values for templates.

---

### 11.8 City Coordinates

**Answer**: ✅ **Coordinates provided for all cities**

| City | Country | Lat | Lng |
|------|---------|-----|-----|
| Johannesburg | South Africa | -26.2041 | 28.0473 |
| Durban | South Africa | -29.8587 | 31.0218 |
| Cape Town | South Africa | -33.9249 | 18.4241 |
| Pretoria | South Africa | -25.7479 | 28.2293 |
| Soweto | South Africa | -26.2485 | 27.8540 |
| Sandton | South Africa | -26.1076 | 28.0567 |
| Harare | Zimbabwe | -17.8292 | 31.0522 |
| Bulawayo | Zimbabwe | -20.1325 | 28.5851 |
| Mutare | Zimbabwe | -18.9707 | 32.6709 |
| Maputo | Mozambique | -25.9692 | 32.5732 |
| Beira | Mozambique | -19.8436 | 34.8389 |
| Inhambane | Mozambique | -23.8650 | 35.3833 |
| Lusaka | Zambia | -15.3875 | 28.3228 |
| Blantyre | Malawi | -15.7667 | 35.0168 |

**Implementation**: Use these coordinates in cross-border and agent templates.

---

### 11.9 Extended Sequence — Fixed vs Dynamic

**Answer**: ✅ **Hybrid approach**

- **First 2 minutes**: Fixed sequence (ensure narrative arc)
- **After 2 minutes**: Dynamic selection with intelligent weights

This gives a reliable "story" for new visitors while keeping variety for longer sessions.

**Implementation**: 
- Create fixed sequence for 0-120 seconds
- After 120 seconds, use dynamic selection with category weights

---

### 11.10 Performance — 180+ Templates in Memory

**Answer**: ✅ **Fine. 180 objects is trivial**

Each template is ~500 bytes. 180 templates = ~90KB. Modern devices handle this easily.

**If concerned**: Lazy load category files on first use, but honestly not worth the complexity.

**Implementation**: Load all templates at startup. No lazy loading needed.

---

## 12. Recommendations

### 12.1 Implementation Approach

**Recommendation**: Phased implementation with incremental testing

1. **Start with high-impact categories**: $ama (39 templates) and cross-border (20 templates) first
2. **Test early**: Get feedback on character voices before implementing all 180+ templates
3. **Iterate on selection logic**: Start simple, add complexity based on testing
4. **Use feature flag**: Allow easy rollback if issues arise

### 12.2 Template Organization

**Recommendation**: Split templates by category into separate files

```
src/lib/demo/templates/
├── amaTemplates.ts          # 39 $ama templates
├── arielTemplates.ts        # 17 $ariel templates
├── agentTemplates.ts        # 34 agent templates
├── crossBorderTemplates.ts  # 20 cross-border templates
├── networkTemplates.ts      # 30 network templates
├── userActionTemplates.ts   # 19 user action templates
├── competitionTemplates.ts   # 17 competition templates
└── agentYouTemplates.ts     # 20 agent-specific templates
```

**Benefits**:
- Easier to maintain
- Easier to review
- Can load categories on demand
- Clearer organization

### 12.3 Character Voice Validation

**Recommendation**: Automated validation + manual review

1. **Automated checks**: Pronoun usage, sentence length, character name prefix
2. **Manual review**: Tone, personality match, brand alignment
3. **Copy review**: Professional copywriter review all templates

### 12.4 Testing Strategy

**Recommendation**: Comprehensive test suite + extended manual testing

1. **Unit tests**: Template validation, selection logic, agent rotation
2. **Integration tests**: Demo engine with all systems
3. **Manual testing**: 10+ minute demo sessions, check for variety, timing, voice
4. **Performance tests**: Selection speed, memory usage

---

## 13. Next Steps (After Approval)

1. **Review this plan** with stakeholders
2. **Answer open questions** (especially agent role detection, $ariel avatar)
3. **Prioritize categories** (which to implement first)
4. **Set up project structure** (create files, set up types)
5. **Begin Phase 1** (template implementation)

---

## 14. Conclusion

This implementation plan provides a detailed roadmap for transforming the notification system from simple alerts into character-driven stories. The phased approach allows for incremental development, testing, and refinement while maintaining backward compatibility.

**Key Success Factors**:
- Character voice consistency
- Intelligent sequencing
- Variety and naturalness
- Performance and maintainability

**Estimated Timeline**: 3 weeks for full implementation (118-150 hours)

**Risk Level**: Medium (complexity is manageable, but 180+ templates require careful attention to detail)

---

---

## 15. Copy Refinements

### 15.1 $ama Voice Refinements

Some templates should be tightened for brevity:

| Original | Refined |
|----------|---------|
| "BTC is flat but ETH is moving. Staying defensive." | "BTC flat. ETH moving. Staying defensive." (shorter) |
| "Your portfolio drifted 4%. Rebalancing now." | "Portfolio drifted. Rebalancing." (even shorter) |
| "Zimbabwe agents yielding 14% this week. Shifting R200 there." | "Zimbabwe agents at 14% yield. Moving R200 there." |

$ama should feel like someone who doesn't waste words.

### 15.2 Network Voice Refinements

Network should feel observational, slightly awe-inspiring:

| Original | Refined |
|----------|---------|
| "Network: Harare corridor is busy. R2.4M moved since morning." | "Network: R2.4M through Harare since morning. Busy day." |
| "Network: 10,000 cross-border transfers this week. Record." | "Network: 10,000 cross-border transfers this week. New record." |
| "Network: Your area moved R120,000 today. Active zone." | "Network: R120,000 moved in your area today." |

### 15.3 Cross-Border Celebratory Refinements

These should feel rebellious, triumphant:

| Original | Refined |
|----------|---------|
| "Another border crossed. Banks hate this." | Keep — this is perfect |
| "R450 moved across an international border in 180 seconds. Welcome to the future." | "R450 crossed a border in 3 minutes. Banks take 3 days." |
| "No SWIFT. No fees. No waiting. Just money where it needs to be." | Keep — this is perfect |
| "Your grandmother's generation waited weeks. You waited 4 minutes." | Keep — this is great |

---

## 16. Additional Templates to Add

The proposal is missing a few notification types:

### 16.1 AI Failure/Recovery (New)

When something goes wrong but $ama handles it:

| ID | Preview |
|----|---------|
| ama-40 | **$ama**: "Transaction failed on first route. Rerouted. Done." |
| ama-41 | **$ama**: "Network hiccup. Your funds are safe. Retrying." |
| ama-42 | **$ama**: "Exchange rate spiked. Waited 30 seconds. Got you a better deal." |

**Total $ama templates**: 42 (was 39)

### 16.2 Agent Competing (New)

Hints of friendly competition between agents:

| ID | Preview |
|----|---------|
| agent-35 | **@lindiwe** just passed **@thabo** on the leaderboard. |
| agent-36 | Top 3 agents today: @grace, @lindiwe, @tendai. |
| agent-37 | **@sipho** is climbing fast. Up 40 spots this week. |

**Total agent templates**: 37 (was 34)

### 16.3 Backer Returns (Clearer)

Make the investment model clearer:

| ID | Preview |
|----|---------|
| backing-01 | Your agents moved R45,000 today. Your cut: R180. |
| backing-02 | **@thabo** generated R23 yield for you this shift. |
| backing-03 | Weekly backer report: R420 earned from 3 agents. |

**New category**: `backing_returns` (3 templates)

**Updated total**: **185+ notifications** (was 180+)

---

## 17. Revised Estimate

| Phase | Hours | Notes |
|-------|-------|-------|
| Templates (185+) | 50-60 | Bulk of the work is writing good copy |
| Selection logic | 15-20 | Not overly complex |
| Character system | 10-15 | Straightforward |
| Sequencing | 8-10 | Fixed + dynamic hybrid |
| Integration | 15-20 | Careful refactoring |
| Testing | 20-25 | Thorough testing is critical |
| **Total** | **118-150 hours** | ~3 weeks |

---

## 18. Final Checklist Before Execution

Before starting implementation:

- [ ] Confirm $ariel avatar path: `/assets/avatar - profile (3).png`
- [ ] Confirm agent avatars exist for all 10 agents
- [ ] Confirm city coordinates are accurate (provided in section 11.8)
- [ ] Review all copy for tone/voice consistency
- [ ] Set up feature flag in environment: `NEXT_PUBLIC_V2_NOTIFICATIONS=true`
- [ ] Create file structure (templates/ directory)
- [ ] Add `backing` terminology (replace all user-facing "sponsorship" copy)
- [ ] Add new templates (AI failure/recovery, agent competing, backer returns)

---

## 19. Priority Order (Approved)

**Implementation priority**:

1. **$ama templates** (42) - Most important for establishing AI
2. **Cross-border templates** (20) - The "wow" factor
3. **Network pulse** (30) - Creates FOMO
4. **Agent activity** (37) - Shows the network is alive
5. **User actions** (19) - Confirmation layer
6. **$ariel** (17) - Large transfers
7. **Competition** (17) - Gamification
8. **Agent-you** (20) - Auth-only, lower priority
9. **Backing returns** (3) - Investment model clarity

---

## 20. Approval Status

**✅ PLAN APPROVED WITH REFINEMENTS**

All open questions answered. Ready to proceed with implementation.

**Status**: Approved for execution. Proceed with Phase 1.


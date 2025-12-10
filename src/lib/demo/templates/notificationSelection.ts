/**
 * Notification System v2.0 - Selection Logic
 * Intelligent notification selection with cooldowns, diversity, and phase-based prioritization
 */

import type { NotificationTemplate } from './types'
import { ALL_TEMPLATES } from './index'
import { AGENT_REGISTRY, type AgentProfile } from './agentRegistry'

// ============================================================================
// State Tracking
// ============================================================================

let recentNotificationIds: string[] = [] // Last 20 notification IDs
let notificationCooldowns: Map<string, number> = new Map() // ID → timestamp when it can repeat
let recentCategories: string[] = [] // Last 5 categories used
let recentAgentIds: string[] = [] // Last 3 agents used
let demoStartTime: number = 0 // When demo started

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format amount for display
 * - Under 1000: "R450"
 * - 1000+: "R1,200" (with comma)
 * - 1M+: "R2.4M"
 */
export function formatAmount(value: number): string {
  if (value >= 1000000) {
    const millions = value / 1000000
    return `R${millions.toFixed(1)}M`
  } else if (value >= 1000) {
    return `R${value.toLocaleString('en-ZA')}`
  } else {
    return `R${value.toFixed(0)}`
  }
}

/**
 * Get seconds since demo started
 */
function getSecondsSinceStart(): number {
  if (demoStartTime === 0) {
    return 0
  }
  return (Date.now() - demoStartTime) / 1000
}

/**
 * Select template by priority (higher priority = more likely)
 */
function selectByPriority(templates: NotificationTemplate[]): NotificationTemplate {
  if (templates.length === 0) {
    throw new Error('No templates available for selection')
  }

  // Calculate total weight (sum of priorities)
  const totalWeight = templates.reduce((sum, t) => sum + (t.metadata.priority || 5), 0)

  // Random selection weighted by priority
  let random = Math.random() * totalWeight
  for (const template of templates) {
    const weight = template.metadata.priority || 5
    random -= weight
    if (random <= 0) {
      return template
    }
  }

  // Fallback to last template
  return templates[templates.length - 1]
}

/**
 * Select template with category diversity (avoid same category 3x in a row)
 */
function selectWithCategoryDiversity(
  templates: NotificationTemplate[],
  recentCategories: string[]
): NotificationTemplate {
  if (templates.length === 0) {
    throw new Error('No templates available for selection')
  }

  // Get last 3 categories
  const last3Categories = recentCategories.slice(-3)

  // Separate templates into: recent categories vs others
  const recentCategoryTemplates: NotificationTemplate[] = []
  const otherTemplates: NotificationTemplate[] = []

  for (const template of templates) {
    if (last3Categories.includes(template.category)) {
      recentCategoryTemplates.push(template)
    } else {
      otherTemplates.push(template)
    }
  }

  // Prefer templates from other categories (80% chance)
  if (otherTemplates.length > 0 && Math.random() < 0.8) {
    return selectByPriority(otherTemplates)
  }

  // Fallback to recent category templates or all templates
  const candidates = recentCategoryTemplates.length > 0 ? recentCategoryTemplates : templates
  return selectByPriority(candidates)
}

/**
 * Select template by category weights
 */
function selectByCategoryWeights(
  templates: NotificationTemplate[],
  categoryWeights: Record<string, number>
): NotificationTemplate {
  if (templates.length === 0) {
    throw new Error('No templates available for selection')
  }

  // Group templates by category
  const byCategory: Record<string, NotificationTemplate[]> = {}
  for (const template of templates) {
    const category = template.category
    if (!byCategory[category]) {
      byCategory[category] = []
    }
    byCategory[category].push(template)
  }

  // Calculate total weight
  let totalWeight = 0
  for (const [category, weight] of Object.entries(categoryWeights)) {
    // Match category prefix (e.g., "ai_" matches "ai_protection")
    const matchingCategories = Object.keys(byCategory).filter(c => c.startsWith(category))
    if (matchingCategories.length > 0) {
      totalWeight += weight
    }
  }

  if (totalWeight === 0) {
    // No matching categories, fallback to random
    return selectByPriority(templates)
  }

  // Random selection weighted by category
  let random = Math.random() * totalWeight
  for (const [category, weight] of Object.entries(categoryWeights)) {
    const matchingCategories = Object.keys(byCategory).filter(c => c.startsWith(category))
    if (matchingCategories.length > 0) {
      random -= weight
      if (random <= 0) {
        // Select from this category
        const categoryTemplates: NotificationTemplate[] = []
        for (const cat of matchingCategories) {
          categoryTemplates.push(...byCategory[cat])
        }
        return selectByPriority(categoryTemplates)
      }
    }
  }

  // Fallback
  return selectByPriority(templates)
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Check if a template can be used
 */
function canUseNotification(template: NotificationTemplate, isAuthed: boolean): boolean {
  // Check cooldown
  const cooldownMs = (template.metadata.cooldown || 3) * 60 * 1000
  const lastUsed = notificationCooldowns.get(template.id) || 0
  if (Date.now() - lastUsed < cooldownMs) {
    return false
  }

  // Check if recently used (within last 20)
  if (recentNotificationIds.includes(template.id)) {
    return false
  }

  // Check auth requirements
  if (template.metadata.requiresAuth && !isAuthed) {
    return false
  }

  // Check agent role requirements (skip for now in demo mode)
  if (template.metadata.requiresAgentRole) {
    // For demo mode, skip agent-you templates
    if (!isAuthed) {
      return false
    }
    // TODO: Check if user is actually an agent when authenticated
    // For now, skip these templates
    return false
  }

  return true
}

/**
 * Main selection function with phase-based logic
 */
function selectNotification(isAuthed: boolean): NotificationTemplate {
  const secondsSinceStart = getSecondsSinceStart()

  // Filter available templates
  const availableTemplates = ALL_TEMPLATES.filter(t => canUseNotification(t, isAuthed))

  if (availableTemplates.length === 0) {
    // No available templates, reset cooldowns and try again
    console.warn('[NotificationSelection] No available templates, resetting cooldowns')
    notificationCooldowns.clear()
    const retryTemplates = ALL_TEMPLATES.filter(t => {
      if (t.metadata.requiresAuth && !isAuthed) return false
      if (t.metadata.requiresAgentRole) return false
      return true
    })
    if (retryTemplates.length > 0) {
      return selectByPriority(retryTemplates)
    }
    // Last resort: return first template
    return ALL_TEMPLATES[0]
  }

  // Phase 1: First 30 seconds (establish AI presence)
  if (secondsSinceStart < 30) {
    // 50% chance of $ama
    if (Math.random() < 0.5) {
      const amaTemplates = availableTemplates.filter(
        t => t.metadata.character === 'ama'
      )
      if (amaTemplates.length > 0) {
        return selectByPriority(amaTemplates)
      }
    }
    // Otherwise, select from all available
    return selectByPriority(availableTemplates)
  }

  // Phase 2: Next 2 minutes (30-150 seconds) - Weighted mix
  if (secondsSinceStart < 150) {
    const categoryWeights: Record<string, number> = {
      // AI (30% total)
      ai_protection: 0.10,
      ai_recovery: 0.05,
      ai_opportunity: 0.05,
      ai_performance: 0.03,
      ai_rebalancing: 0.02,
      ai_commentary: 0.03,
      ai_failure_recovery: 0.02,
      // $ariel (5%)
      large_transfer: 0.03,
      agent_coordination: 0.01,
      routing_decision: 0.01,
      // Cross-border (25%)
      cross_border_incoming: 0.10,
      cross_border_outgoing: 0.08,
      cross_border_multi_hop: 0.04,
      cross_border_celebratory: 0.03,
      // Agent (25%)
      agent_checkin: 0.08,
      agent_productivity: 0.07,
      agent_milestone: 0.05,
      agent_shift_end: 0.03,
      backing_update: 0.02,
      // Network (15%)
      network_corridor: 0.04,
      network_milestone: 0.03,
      network_local: 0.03,
      network_economy: 0.03,
      network_time: 0.02
    }
    return selectByCategoryWeights(availableTemplates, categoryWeights)
  }

  // Phase 3: Extended demo (150+ seconds) - Balanced with category diversity
  return selectWithCategoryDiversity(availableTemplates, recentCategories)
}

/**
 * Apply agent substitution to template
 */
function applyAgentSubstitution(template: NotificationTemplate): NotificationTemplate {
  // Check if template needs agent substitution
  if (!template.metadata.agentName) {
    return template
  }

  // Get available agents (not in recent list)
  const availableAgents = AGENT_REGISTRY.filter(
    agent => !recentAgentIds.includes(agent.id)
  )

  if (availableAgents.length === 0) {
    // All agents used recently, reset and use any agent
    recentAgentIds = []
    const randomAgent = AGENT_REGISTRY[Math.floor(Math.random() * AGENT_REGISTRY.length)]
    return substituteAgentInTemplate(template, randomAgent)
  }

  // Select random agent from available
  const selectedAgent = availableAgents[Math.floor(Math.random() * availableAgents.length)]

  // Track agent
  recentAgentIds.push(selectedAgent.id)
  if (recentAgentIds.length > 3) {
    recentAgentIds.shift() // Keep last 3
  }

  return substituteAgentInTemplate(template, selectedAgent)
}

/**
 * Substitute agent details in template
 */
function substituteAgentInTemplate(
  template: NotificationTemplate,
  agent: AgentProfile
): NotificationTemplate {
  // Create a copy of the template
  const substituted: NotificationTemplate = {
    ...template,
    title: template.title.replace(/@\w+/g, agent.handle),
    body: template.body?.replace(/@\w+/g, agent.handle),
    action: template.action?.replace(/@\w+/g, agent.handle),
    reason: template.reason?.replace(/@\w+/g, agent.handle),
    actor: {
      type: 'member',
      name: agent.handle,
      avatar: agent.avatar
    },
    map: {
      lat: agent.lat,
      lng: agent.lng
    }
  }

  return substituted
}

/**
 * Apply ±10% amount variance to template
 */
function applyAmountVariance(template: NotificationTemplate): NotificationTemplate {
  if (!template.amount) {
    return template
  }

  // Calculate variance (±10%)
  const variance = 0.1
  const randomFactor = 1 + (Math.random() * 2 - 1) * variance // 0.9 to 1.1
  const variedAmount = Math.round(template.amount.baseValue * randomFactor)

  // Update amount value
  const updatedTemplate: NotificationTemplate = {
    ...template,
    amount: {
      ...template.amount,
      baseValue: variedAmount,
      // Keep direction, currency unchanged
    }
  }

  // Replace amount in title/body text
  const originalAmount = template.amount.baseValue
  const formattedOriginal = formatAmount(originalAmount)
  const formattedVaried = formatAmount(variedAmount)

  // Replace in title
  if (updatedTemplate.title.includes(formattedOriginal)) {
    updatedTemplate.title = updatedTemplate.title.replace(
      formattedOriginal,
      formattedVaried
    )
  } else {
    // Try to find and replace any R amount pattern
    updatedTemplate.title = updatedTemplate.title.replace(
      /R[\d,]+(\.\d+)?(M)?/g,
      formattedVaried
    )
  }

  // Replace in body
  if (updatedTemplate.body) {
    if (updatedTemplate.body.includes(formattedOriginal)) {
      updatedTemplate.body = updatedTemplate.body.replace(
        formattedOriginal,
        formattedVaried
      )
    } else {
      updatedTemplate.body = updatedTemplate.body.replace(
        /R[\d,]+(\.\d+)?(M)?/g,
        formattedVaried
      )
    }
  }

  // Replace in action
  if (updatedTemplate.action) {
    if (updatedTemplate.action.includes(formattedOriginal)) {
      updatedTemplate.action = updatedTemplate.action.replace(
        formattedOriginal,
        formattedVaried
      )
    } else {
      updatedTemplate.action = updatedTemplate.action.replace(
        /R[\d,]+(\.\d+)?(M)?/g,
        formattedVaried
      )
    }
  }

  // Replace in reason
  if (updatedTemplate.reason) {
    if (updatedTemplate.reason.includes(formattedOriginal)) {
      updatedTemplate.reason = updatedTemplate.reason.replace(
        formattedOriginal,
        formattedVaried
      )
    } else {
      updatedTemplate.reason = updatedTemplate.reason.replace(
        /R[\d,]+(\.\d+)?(M)?/g,
        formattedVaried
      )
    }
  }

  return updatedTemplate
}

/**
 * Mark notification as used (tracking)
 */
function markNotificationUsed(template: NotificationTemplate): void {
  // Add to recent IDs (keep last 20)
  recentNotificationIds.push(template.id)
  if (recentNotificationIds.length > 20) {
    recentNotificationIds.shift()
  }

  // Set cooldown timestamp
  const cooldownMinutes = template.metadata.cooldown || 3
  const cooldownMs = cooldownMinutes * 60 * 1000
  notificationCooldowns.set(template.id, Date.now() + cooldownMs)

  // Add category to recent categories (keep last 5)
  recentCategories.push(template.category)
  if (recentCategories.length > 5) {
    recentCategories.shift()
  }
}

/**
 * Reset demo state (call when demo starts)
 */
export function resetDemoState(): void {
  recentNotificationIds = []
  notificationCooldowns.clear()
  recentCategories = []
  recentAgentIds = []
  demoStartTime = Date.now()
}

// ============================================================================
// Integration Point
// ============================================================================

/**
 * Get next demo notification (main entry point)
 */
export function getNextDemoNotification(isAuthed: boolean): NotificationTemplate {
  let template = selectNotification(isAuthed)
  template = applyAgentSubstitution(template)
  template = applyAmountVariance(template)
  markNotificationUsed(template)
  return template
}

// ============================================================================
// Testing
// ============================================================================

/**
 * Test selection logic (for development)
 */
export function testSelectionLogic(): void {
  resetDemoState()
  console.log('Testing notification selection...')
  console.log('='.repeat(60))

  for (let i = 0; i < 20; i++) {
    const template = getNextDemoNotification(false)
    const character = template.metadata.character || 'unknown'
    const category = template.category
    const amount = template.amount
      ? formatAmount(template.amount.baseValue)
      : 'N/A'
    console.log(
      `${i + 1}. [${character}] [${category}] ${template.title} (${amount})`
    )
  }

  console.log('='.repeat(60))
  console.log('Test complete')
  console.log(`Recent categories: ${recentCategories.join(', ')}`)
  console.log(`Recent agents: ${recentAgentIds.join(', ')}`)
  console.log(`Recent notification IDs: ${recentNotificationIds.length} tracked`)
}


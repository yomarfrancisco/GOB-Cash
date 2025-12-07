/**
 * Notification System v2.0 - Template Index
 * Exports all notification templates for use in demo engine
 */

import { AMA_TEMPLATES } from './amaTemplates'
import { ARIEL_TEMPLATES } from './arielTemplates'
import { AGENT_TEMPLATES } from './agentTemplates'
import { CROSS_BORDER_TEMPLATES } from './crossBorderTemplates'
import { NETWORK_TEMPLATES } from './networkTemplates'
import { USER_ACTION_TEMPLATES } from './userActionTemplates'
import { COMPETITION_TEMPLATES } from './competitionTemplates'
import { AGENT_YOU_TEMPLATES } from './agentYouTemplates'
import { BACKING_TEMPLATES } from './backingTemplates'
import type { NotificationTemplate } from './types'

/**
 * All notification templates (185+)
 * Organized by category for easy filtering and selection
 */
export const ALL_TEMPLATES: NotificationTemplate[] = [
  ...AMA_TEMPLATES, // 42 templates
  ...ARIEL_TEMPLATES, // 17 templates
  ...AGENT_TEMPLATES, // 37 templates
  ...CROSS_BORDER_TEMPLATES, // 20 templates
  ...NETWORK_TEMPLATES, // 30 templates
  ...USER_ACTION_TEMPLATES, // 19 templates
  ...COMPETITION_TEMPLATES, // 17 templates
  ...AGENT_YOU_TEMPLATES, // 20 templates
  ...BACKING_TEMPLATES // TBD templates
]

// Re-export types and utilities
export type { NotificationTemplate, NotificationCategory } from './types'
export { CHARACTERS } from './characters'
export { AGENT_REGISTRY, CITY_COORDINATES } from './agentRegistry'


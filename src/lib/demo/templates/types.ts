/**
 * Notification System v2.0 - Type Definitions
 * Character-based notification templates with intelligent sequencing
 */

import type { NotificationKind, ActorIdentity } from '@/store/notifications'

export type NotificationCategory =
  | 'ai_protection'
  | 'ai_recovery'
  | 'ai_opportunity'
  | 'ai_performance'
  | 'ai_rebalancing'
  | 'ai_commentary'
  | 'ai_failure_recovery'
  | 'large_transfer'
  | 'agent_coordination'
  | 'routing_decision'
  | 'status_update'
  | 'agent_checkin'
  | 'agent_productivity'
  | 'agent_milestone'
  | 'agent_shift_end'
  | 'agent_competing'
  | 'backing_update'
  | 'backing_returns'
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

export type NotificationTemplate = {
  id: string // e.g., "ama-01", "agent-01", "xborder-01"
  category: NotificationCategory
  kind: NotificationKind
  title: string // Character name + message (e.g., "$ama: Pulled R250...")
  body?: string // Optional additional detail
  action?: string // For AI trades: what happened
  reason?: string // For AI trades: why it happened
  amount?: {
    currency: 'ZAR' | 'USDT'
    baseValue: number // Base amount before variance
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
    agentName?: string // For agent-specific notifications (placeholder for substitution)
    requiresAuth?: boolean // Only show when authenticated
    requiresAgentRole?: boolean // Only show if user is an agent
    priority?: number // 1-10, higher = more important
    cooldown?: number // Minutes before this can repeat
  }
}


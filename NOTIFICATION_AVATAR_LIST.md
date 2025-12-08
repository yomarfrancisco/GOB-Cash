# Avatar Images Used in Dropdown Notifications

This document lists all avatar image assets and their paths used in dropdown notifications across the application.

## Default Avatar Paths (from `identityResolver.ts`)

### 1. AI Manager Avatar
- **Path**: `/assets/Brics-girl-blue.png`
- **Used for**: `actor.type === 'ai_manager'`
- **Component**: `TopNotifications.tsx` (dropdown notifications)
- **Description**: Default avatar for AI portfolio manager notifications

### 2. System/Co-op/Admin Avatar
- **Path**: `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png`
- **Used for**: 
  - `actor.type === 'system'`
  - `actor.type === 'co_op'`
  - Fallback when no actor is provided
  - User profile fallback (when user has no avatar)
- **Components**: 
  - `TopNotifications.tsx` (dropdown notifications)
  - `NotificationsList.tsx` (activity list)
- **Description**: High-quality GoBankless logo (pink + white) - default system/co-op avatar

### 3. Member Default Avatar
- **Path**: `/assets/avatar_agent5.png`
- **Used for**: `actor.type === 'member'` (when no explicit avatar is provided)
- **Component**: `TopNotifications.tsx` (dropdown notifications)
- **Description**: Default fallback for member/agent notifications

## Agent Photo Avatars (Used in Demo Notifications)

These avatars are explicitly set in notification templates for member/agent actors:

### Agent Avatar Set 1-8
- **Path**: `/assets/avatar_agent1.png`
- **Path**: `/assets/avatar_agent2.png`
- **Path**: `/assets/avatar_agent3.png`
- **Path**: `/assets/avatar_agent4.png`
- **Path**: `/assets/avatar_agent5.png` (also used as member default)
- **Path**: `/assets/avatar_agent6.png`
- **Path**: `/assets/avatar_agent7.png`
- **Path**: `/assets/avatar_agent8.png`
- **Used in**: 
  - `src/lib/demo/templates/agentTemplates.ts` (agent activity notifications)
  - `src/lib/demo/templates/crossBorderTemplates.ts` (cross-border payment notifications)
  - `src/lib/demo/demoNotificationEngine.ts` (demo notifications)
  - `src/lib/demo/templates/agentRegistry.ts` (agent registry)
- **Description**: Photo avatars for human agents/members in notifications

## Generic Profile Avatar (Initial Overlay System)

### Base Avatar for Initials
- **Path**: `/assets/avatar-profile.png`
- **Used in**: `Avatar.tsx` component
- **Description**: Base image used when no avatar URL is provided. Displays user's initial letter overlay on top.
- **Note**: This is used by the `Avatar` component, which may be used in notifications when `actor.avatar` is not explicitly set and the actor type doesn't match default cases.

## Avatar Resolution Priority

When a notification is created, avatars are resolved in this order:

1. **Explicit avatar** - If `actor.avatar` is provided, use it directly
2. **Identity-based defaults** - Based on `actor.type`:
   - `ai_manager` → `/assets/Brics-girl-blue.png`
   - `system` → `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png`
   - `co_op` → `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png`
   - `member` → `/assets/avatar_agent5.png` (fallback)
   - `user` → User's profile avatar or system default
3. **Fallback** → `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png`

## Components Using These Avatars

### TopNotifications.tsx (Dropdown Notifications)
- Uses `resolveAvatarForActor()` from `identityResolver.ts`
- Displays avatars in the top notification dropdown
- Size: 38x38 pixels

### NotificationsList.tsx (Activity List)
- Uses `GOB_AVATAR_PATH` constant: `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png`
- Falls back to `item.actor.avatarUrl` if provided
- Size: 38x38 pixels

## Summary Table

| Avatar Path | Type | Used For | Default For |
|------------|------|----------|-------------|
| `/assets/Brics-girl-blue.png` | AI Manager | AI portfolio manager | `ai_manager` type |
| `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png` | System/Admin | System, Co-op, Admin | `system`, `co_op`, fallback |
| `/assets/avatar_agent5.png` | Member | Agents/Members | `member` type (default) |
| `/assets/avatar_agent1.png` | Member | Agent photos | Explicit in templates |
| `/assets/avatar_agent2.png` | Member | Agent photos | Explicit in templates |
| `/assets/avatar_agent3.png` | Member | Agent photos | Explicit in templates |
| `/assets/avatar_agent4.png` | Member | Agent photos | Explicit in templates |
| `/assets/avatar_agent6.png` | Member | Agent photos | Explicit in templates |
| `/assets/avatar_agent7.png` | Member | Agent photos | Explicit in templates |
| `/assets/avatar_agent8.png` | Member | Agent photos | Explicit in templates |
| `/assets/avatar-profile.png` | Generic | Initial overlay base | Avatar component fallback |

## Files Referenced

- **Avatar Resolution**: `src/lib/notifications/identityResolver.ts`
- **Dropdown Notifications**: `src/components/notifications/TopNotifications.tsx`
- **Activity List**: `src/components/notifications/NotificationsList.tsx`
- **Avatar Component**: `src/components/Avatar.tsx`
- **Demo Templates**: `src/lib/demo/templates/agentTemplates.ts`, `crossBorderTemplates.ts`
- **Demo Engine**: `src/lib/demo/demoNotificationEngine.ts`


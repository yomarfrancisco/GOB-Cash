# Notification System Upgrade: Four-Identity Model
## Delta Mapping & Architecture Plan

**Status:** Planning Phase (No Code Changes)
**Date:** 2024
**Objective:** Upgrade from 2-identity (`ai` | `user`) to 5-identity (`user`, `ai_manager`, `co_op`, `member`, `system`) notification system

---

## 1. Current → New Identity Mapping

### 1.1 Notification Kind → Identity Mapping

| Current Kind | Current Actor | New Identity | Rationale |
|-------------|---------------|--------------|-----------|
| `payment_sent` | `user` | `user` | User-initiated payment |
| `payment_received` | `user` | `user` | User received payment (from another user) |
| `payment_received` (deposit) | `user` | `system` | System-processed deposit |
| `request_sent` | `user` | `user` | User-initiated request |
| `payment_failed` | `user` | `system` | System error/failure |
| `refund` | `user` | `system` | System-processed refund |
| `ai_trade` | `ai` | `ai_manager` | AI manager executing trades |
| `mode-change` | `user` | `user` | User toggled wallet mode |
| `transfer` | `user` | `user` | User-initiated internal transfer |

### 1.2 Identity Definitions

- **`user`**: The current app user (self-initiated actions)
- **`ai_manager`**: AI/autonomous system managing portfolio (replaces `ai`)
- **`co_op`**: Cooperative organization (group actions, co-op events)
- **`member`**: Another GoBankless user (peer-to-peer interactions)
- **`system`**: System-level events (errors, refunds, deposits, infrastructure)

---

## 2. New Notification Kinds Required

### 2.1 Co-op Events
```typescript
'co_op_joined'           // User joined a co-op
'co_op_payment'          // Payment to/from co-op
'co_op_contribution'     // Contribution to co-op fund
'co_op_distribution'     // Distribution from co-op fund
'co_op_announcement'     // Co-op-wide announcement
'co_op_goal_reached'     // Co-op savings goal achieved
```

### 2.2 Member Events
```typescript
'member_payment_sent'    // Payment sent to another member
'member_payment_received' // Payment received from another member
'member_request'         // Payment request from/to member
'member_joined'           // Member joined your network
'member_activity'        // Member activity (e.g., shared portfolio update)
```

### 2.3 AI Explanations
```typescript
'ai_explanation'         // AI manager explaining a decision (ephemeral)
'ai_suggestion'          // AI manager suggesting an action
'ai_alert'               // AI manager alerting to market conditions
'ai_learning'            // AI manager learned from user behavior
```

### 2.4 Map-Based Events
```typescript
'map_dealer_nearby'      // Dealer/branch within proximity
'map_route_calculated'   // Route to dealer calculated
'map_location_shared'    // Location shared with member/co-op
'map_checkin'            // User checked in at location
```

### 2.5 Portfolio Updates
```typescript
'portfolio_rebalanced'  // Portfolio automatically rebalanced
'portfolio_goal_reached' // Portfolio goal achieved
'portfolio_alert'        // Portfolio threshold crossed
'portfolio_insight'      // Portfolio performance insight
```

### 2.6 Social Interactions
```typescript
'social_follow'          // User followed by member
'social_mention'         // Mentioned by member
'social_share'           // Portfolio/activity shared
'social_comment'         // Comment on activity
```

### 2.7 Complete New NotificationKind Type
```typescript
export type NotificationKind =
  // Existing (migrated)
  | 'payment_sent'
  | 'payment_received'
  | 'request_sent'
  | 'payment_failed'
  | 'refund'
  | 'ai_trade'           // Keep for backward compat, map to ai_manager
  | 'mode-change'
  | 'transfer'
  // New Co-op
  | 'co_op_joined'
  | 'co_op_payment'
  | 'co_op_contribution'
  | 'co_op_distribution'
  | 'co_op_announcement'
  | 'co_op_goal_reached'
  // New Member
  | 'member_payment_sent'
  | 'member_payment_received'
  | 'member_request'
  | 'member_joined'
  | 'member_activity'
  // New AI
  | 'ai_explanation'
  | 'ai_suggestion'
  | 'ai_alert'
  | 'ai_learning'
  // New Map
  | 'map_dealer_nearby'
  | 'map_route_calculated'
  | 'map_location_shared'
  | 'map_checkin'
  // New Portfolio
  | 'portfolio_rebalanced'
  | 'portfolio_goal_reached'
  | 'portfolio_alert'
  | 'portfolio_insight'
  // New Social
  | 'social_follow'
  | 'social_mention'
  | 'social_share'
  | 'social_comment'
```

---

## 3. Components Requiring Updates

### 3.1 Core Store & Types
**File:** `src/store/notifications.ts`
- **Changes:**
  - Update `NotificationKind` type (add 24 new kinds)
  - Expand `actor` type from `{ type: 'ai' | 'user', avatarUrl? }` to:
    ```typescript
    actor?: {
      type: 'user' | 'ai_manager' | 'co_op' | 'member' | 'system'
      id?: string              // NEW: Unique identifier
      avatar?: string          // NEW: Renamed from avatarUrl, more explicit
      name?: string            // NEW: Display name
      handle?: string          // NEW: @handle for members
    }
    ```
  - Add `event` metadata:
    ```typescript
    event?: {
      origin: 'user_action' | 'ai_triggered' | 'system_event' | 'co_op_event' | 'member_action'
      metadata?: Record<string, any>  // Flexible metadata
    }
    ```
  - Add `map` coordinates:
    ```typescript
    map?: {
      lat: number
      lng: number
      markerId?: string        // Reference to map marker
    }
    ```
  - Add `ephemeral` flag for AI explanations:
    ```typescript
    ephemeral?: boolean        // Auto-dismiss after short time, don't persist
    ```
  - Migration helper: `migrateLegacyNotification()` to convert old `ai` → `ai_manager`

### 3.2 Activity Store
**File:** `src/store/activity.ts`
- **Changes:**
  - Update `ActivityItem.actor` to match new structure:
    ```typescript
    actor: {
      type: 'user' | 'ai_manager' | 'co_op' | 'member' | 'system' | 'counterparty'
      id?: string
      avatar?: string
      name?: string
      handle?: string
    }
    ```
  - Add `event` and `map` fields (same as notifications)
  - Migration: Update persistence key to `activity-store-v2` (or migrate existing data)

### 3.3 Display Component
**File:** `src/components/notifications/TopNotifications.tsx`
- **Changes:**
  - Update avatar resolution logic:
    ```typescript
    // Current: notification.actor?.type === 'ai' ? GOB_AVATAR_PATH : ...
    // New: Identity-based avatar resolution
    const getAvatarUrl = (actor) => {
      if (!actor) return GOB_AVATAR_PATH
      if (actor.avatar) return actor.avatar
      switch (actor.type) {
        case 'ai_manager': return '/assets/ai-manager-avatar.png'
        case 'co_op': return '/assets/co-op-badge.png'
        case 'member': return actor.avatar || '/assets/default-member.png'
        case 'system': return '/assets/system-icon.png'
        case 'user': return actor.avatar || GOB_AVATAR_PATH
      }
    }
    ```
  - Add identity badge rendering (co-op badge, member indicator)
  - Handle ephemeral notifications (shorter auto-dismiss, different styling)
  - Add map notification routing (tap → navigate to map with coordinates)

### 3.4 Components Emitting Notifications

#### 3.4.1 Success Sheet
**File:** `src/components/SuccessSheet.tsx`
- **Changes:**
  - Update `pushNotification` calls to use new identity:
    - `payment_sent` → `actor: { type: 'user' }`
    - `transfer` → `actor: { type: 'user' }`
    - `payment_received` (deposit) → `actor: { type: 'system' }`

#### 3.4.2 AI Action Cycle
**File:** `src/lib/animations/useAiActionCycle.ts`
- **Changes:**
  - Update `ai_trade` notifications:
    - `actor: { type: 'ai_manager' }` (was `'ai'`)
    - Add `event: { origin: 'ai_triggered' }`
    - Consider adding `ai_explanation` notifications for major trades

#### 3.4.3 Wallet Mode
**File:** `src/state/walletMode.tsx`
- **Changes:**
  - `mode-change` → `actor: { type: 'user' }` (already correct)

#### 3.4.4 Share Profile Sheet
**File:** `src/components/ShareProfileSheet.tsx`
- **Changes:**
  - Copy success → `actor: { type: 'user' }`
  - Errors → `actor: { type: 'system' }`

#### 3.4.5 Crypto Deposit Address Sheet
**File:** `src/components/CryptoDepositAddressSheet.tsx`
- **Changes:**
  - Copy success → `actor: { type: 'user' }`
  - Errors → `actor: { type: 'system' }`

#### 3.4.6 Profile Edit Sheet
**File:** `src/components/ProfileEditSheet.tsx`
- **Changes:**
  - All errors → `actor: { type: 'system' }`

### 3.5 New Components to Create

#### 3.5.1 Co-op Notification Badge
**File:** `src/components/notifications/CoOpBadge.tsx` (NEW)
- **Purpose:** Visual indicator for co-op notifications
- **Props:**
  ```typescript
  {
    coOpId: string
    coOpName: string
    size?: 'small' | 'medium' | 'large'
  }
  ```
- **UI:** Badge/icon overlay on notification avatar

#### 3.5.2 Member Avatar Bubble
**File:** `src/components/notifications/MemberAvatar.tsx` (NEW)
- **Purpose:** Display member avatars with online status, handle
- **Props:**
  ```typescript
  {
    memberId: string
    avatar?: string
    handle?: string
    isOnline?: boolean
  }
  ```

#### 3.5.3 AI Explanation Sheet
**File:** `src/components/notifications/AIExplanationSheet.tsx` (NEW)
- **Purpose:** Ephemeral bottom sheet for AI explanations
- **Behavior:**
  - Auto-opens when `ai_explanation` notification received
  - Auto-dismisses after 5-8 seconds
  - Can be manually dismissed
  - Shows AI reasoning, charts, context
- **Props:**
  ```typescript
  {
    notification: NotificationItem
    onDismiss: () => void
  }
  ```

#### 3.5.4 Map Notification Router
**File:** `src/components/notifications/MapNotificationRouter.tsx` (NEW)
- **Purpose:** Handle map-based notification routing
- **Behavior:**
  - Intercepts notifications with `map` coordinates
  - Routes to map view with marker highlighted
  - Can trigger map animations/panning

#### 3.5.5 Multi-Source Notification Queue
**File:** `src/components/notifications/NotificationQueue.tsx` (NEW)
- **Purpose:** Manage priority and routing for different notification sources
- **Features:**
  - Priority queue (system > co-op > ai_manager > member > user)
  - Deduplication (same event from multiple sources)
  - Rate limiting (prevent notification spam)
  - Grouping (multiple member notifications → "3 new member activities")

---

## 4. New Data Structures

### 4.1 Enhanced Actor Structure
```typescript
type ActorIdentity = 
  | { type: 'user'; id?: string; avatar?: string; name?: string }
  | { type: 'ai_manager'; id?: 'default'; avatar?: string; name?: string }
  | { type: 'co_op'; id: string; avatar?: string; name: string }
  | { type: 'member'; id: string; avatar?: string; name?: string; handle: string }
  | { type: 'system'; id?: 'default'; avatar?: string; name?: string }
```

### 4.2 Event Metadata
```typescript
type EventOrigin = 
  | 'user_action'      // User-initiated (button click, form submit)
  | 'ai_triggered'     // AI manager autonomous action
  | 'system_event'     // System-level event (deposit, refund, error)
  | 'co_op_event'      // Co-op organization event
  | 'member_action'    // Another member's action

type EventMetadata = {
  origin: EventOrigin
  metadata?: {
    source?: string           // e.g., 'deposit_api', 'ai_rebalance_engine'
    correlationId?: string    // Link related events
    userId?: string           // For member actions
    coOpId?: string           // For co-op events
    [key: string]: any        // Flexible extension
  }
}
```

### 4.3 Map Coordinates
```typescript
type MapCoordinates = {
  lat: number
  lng: number
  markerId?: string           // Reference to existing marker
  zoom?: number              // Suggested zoom level
  routeTo?: {                // Optional route calculation
    lat: number
    lng: number
  }
}
```

### 4.4 Complete NotificationItem Type
```typescript
export type NotificationItem = {
  id: string
  kind: NotificationKind
  title: string
  body?: string
  action?: string
  reason?: string
  amount?: {
    currency: 'ZAR' | 'USDT'
    value: number
  }
  direction?: 'up' | 'down'
  
  // Enhanced actor
  actor?: ActorIdentity
  
  // New fields
  event?: {
    origin: EventOrigin
    metadata?: Record<string, any>
  }
  map?: MapCoordinates
  ephemeral?: boolean        // Auto-dismiss, don't persist to activity
  
  timestamp: number
  routeOnTap?: string
}
```

---

## 5. New UI/UX Components Required

### 5.1 Co-op Avatar Badge
- **Location:** Overlay on notification avatar
- **Design:** Circular badge with co-op logo/icon
- **Size:** 16x16px overlay on 38x38px avatar
- **File:** `src/components/notifications/CoOpBadge.tsx`
- **CSS:** `src/styles/notifications.css` (add `.co-op-badge`)

### 5.2 Member Avatar Notification Bubble
- **Location:** Notification avatar area
- **Design:** 
  - Member avatar (circular, 38x38px)
  - Online status indicator (green dot)
  - Handle display below avatar or in notification body
- **File:** `src/components/notifications/MemberAvatar.tsx`
- **CSS:** `src/styles/notifications.css` (add `.member-avatar`, `.online-indicator`)

### 5.3 AI Ephemeral Explanation Sheet
- **Location:** Bottom sheet (similar to ActionSheet)
- **Design:**
  - Full-width bottom sheet
  - AI avatar + explanation text
  - Optional: Charts, graphs, reasoning breakdown
  - Auto-dismiss timer (5-8 seconds)
  - Manual dismiss button
- **File:** `src/components/notifications/AIExplanationSheet.tsx`
- **CSS:** `src/styles/ai-explanation-sheet.css` (NEW)
- **Behavior:**
  - Opens automatically when `ai_explanation` notification received
  - Overrides normal notification display
  - Doesn't appear in TopNotifications queue
  - Persists to activity store (optional, based on user preference)

### 5.4 Map-Motion Trigger
- **Location:** Map component integration
- **Design:**
  - When notification with `map` coordinates received
  - Pan map to coordinates
  - Highlight marker (if `markerId` provided)
  - Optional: Draw route (if `routeTo` provided)
- **File:** `src/components/MapboxMap.tsx` (enhance existing)
- **Integration:** `src/components/notifications/MapNotificationRouter.tsx`

### 5.5 Multi-Source Notification Routing
- **Location:** Notification queue manager
- **Design:**
  - Priority-based display order
  - Grouping logic (multiple member notifications → summary)
  - Deduplication (same event, different sources)
  - Rate limiting (max 3 notifications per 10 seconds)
- **File:** `src/components/notifications/NotificationQueue.tsx`
- **Integration:** Wraps `TopNotifications` component

---

## 6. Recommended Architecture Plan

### 6.1 Implementation Phases

#### Phase 1: Foundation (Backward Compatible)
**Goal:** Add new types without breaking existing code

1. **Update Type Definitions**
   - Add new `NotificationKind` values (keep existing)
   - Expand `actor` type (make new fields optional)
   - Add `event`, `map`, `ephemeral` fields (all optional)
   - Create migration helper: `migrateLegacyNotification()`

2. **Identity Resolution Helper**
   - Create `src/lib/notifications/identityResolver.ts`
   - Function: `resolveActorIdentity(actor: LegacyActor): ActorIdentity`
   - Maps `'ai'` → `'ai_manager'`
   - Maps `'user'` → `'user'` with defaults

3. **Update Store (Non-Breaking)**
   - Modify `pushNotification` to accept both old and new formats
   - Auto-migrate legacy notifications on push
   - Keep backward compatibility for 2-3 releases

#### Phase 2: Display Updates
**Goal:** Render new identities correctly

1. **Update TopNotifications**
   - Add identity-based avatar resolution
   - Add co-op badge rendering
   - Add member avatar rendering
   - Handle ephemeral notifications (shorter timer, different style)

2. **Create New UI Components**
   - `CoOpBadge.tsx`
   - `MemberAvatar.tsx`
   - Update CSS for new components

#### Phase 3: New Notification Kinds
**Goal:** Add support for new event types

1. **Co-op Notifications**
   - Add co-op store/context (if not exists)
   - Emit `co_op_*` notifications from co-op actions
   - Test co-op badge display

2. **Member Notifications**
   - Add member store/context (if not exists)
   - Emit `member_*` notifications from member interactions
   - Test member avatar display

3. **AI Explanations**
   - Create `AIExplanationSheet.tsx`
   - Integrate with AI action cycle
   - Test ephemeral display

4. **Map Notifications**
   - Enhance `MapboxMap.tsx` to accept notification coordinates
   - Create `MapNotificationRouter.tsx`
   - Test map panning/zooming on notification tap

#### Phase 4: Advanced Features
**Goal:** Multi-source routing, priority, grouping

1. **Notification Queue Manager**
   - Create `NotificationQueue.tsx`
   - Implement priority logic
   - Implement grouping logic
   - Implement rate limiting

2. **Activity Store Migration**
   - Update `ActivityItem` type
   - Migrate existing activity data (if needed)
   - Update persistence key

3. **Testing & Polish**
   - Test all notification kinds
   - Test backward compatibility
   - Test migration paths
   - Performance testing (notification queue size)

### 6.2 Backward Compatibility Strategy

#### 6.2.1 Legacy Actor Support
```typescript
// Migration helper
function migrateLegacyActor(actor?: LegacyActor): ActorIdentity {
  if (!actor) return { type: 'user' }
  
  if (actor.type === 'ai') {
    return {
      type: 'ai_manager',
      id: 'default',
      avatar: actor.avatarUrl || '/assets/ai-manager-avatar.png',
      name: 'AI Manager'
    }
  }
  
  if (actor.type === 'user') {
    return {
      type: 'user',
      avatar: actor.avatarUrl,
      name: 'You'
    }
  }
  
  return { type: 'user' } // Fallback
}
```

#### 6.2.2 Store Compatibility
- `pushNotification` accepts both old and new formats
- Auto-migrates on push
- Old notifications in queue remain functional
- Activity store migration is optional (can run on read)

#### 6.2.3 Display Compatibility
- `TopNotifications` handles both old and new actor types
- Falls back to default avatars if new fields missing
- Graceful degradation if new components not loaded

### 6.3 Injection Points

#### 6.3.1 Identity Logic Injection
**Location:** `src/lib/notifications/identityResolver.ts` (NEW)

```typescript
// Centralized identity resolution
export function resolveNotificationIdentity(
  notification: Partial<NotificationItem>
): ActorIdentity {
  // 1. Use new actor if present
  if (notification.actor && 'type' in notification.actor) {
    return notification.actor as ActorIdentity
  }
  
  // 2. Migrate legacy actor
  if (notification.actor && 'type' in notification.actor) {
    return migrateLegacyActor(notification.actor as LegacyActor)
  }
  
  // 3. Infer from notification kind
  return inferIdentityFromKind(notification.kind)
}

function inferIdentityFromKind(kind?: NotificationKind): ActorIdentity {
  switch (kind) {
    case 'ai_trade':
    case 'ai_explanation':
    case 'ai_suggestion':
    case 'ai_alert':
    case 'ai_learning':
      return { type: 'ai_manager', id: 'default' }
    case 'payment_failed':
    case 'refund':
      return { type: 'system' }
    default:
      return { type: 'user' }
  }
}
```

#### 6.3.2 Notification Kind Expansion
**Location:** `src/store/notifications.ts`

- Add new kinds to union type
- Update `getNotificationDetail()` if needed for new kinds
- Add kind-specific formatting helpers (optional)

#### 6.3.3 Component Updates
- **Gradual Migration:** Update components one at a time
- **Feature Flags:** Use feature flags for new notification types
- **A/B Testing:** Test new UI components with subset of users

### 6.4 Risks & Breaking Changes

#### 6.4.1 High Risk
1. **Activity Store Migration**
   - **Risk:** Existing activity data may not display correctly
   - **Mitigation:** 
     - Keep old `ActivityItem` type alongside new
     - Migrate on read (lazy migration)
     - Provide migration script for users

2. **Notification Queue Overflow**
   - **Risk:** Too many notifications overwhelm UI
   - **Mitigation:**
     - Implement rate limiting
     - Implement grouping
     - Increase `MAX_VISIBLE` if needed
     - Add "View all" button

3. **Avatar Loading Failures**
   - **Risk:** Missing avatars break UI
   - **Mitigation:**
     - Fallback to default avatars
     - Lazy loading with error handling
     - Placeholder while loading

#### 6.4.2 Medium Risk
1. **TypeScript Type Errors**
   - **Risk:** Components using old types break
   - **Mitigation:**
     - Gradual type migration
     - Use `Partial<>` types during transition
     - Provide type helpers

2. **Performance Degradation**
   - **Risk:** More complex notification logic slows app
   - **Mitigation:**
     - Profile notification rendering
     - Memoize expensive computations
     - Lazy load notification components

3. **Backward Compatibility Gaps**
   - **Risk:** Old notifications don't display correctly
   - **Mitigation:**
     - Comprehensive migration testing
     - Fallback rendering paths
     - User feedback collection

#### 6.4.3 Low Risk
1. **CSS Styling Conflicts**
   - **Risk:** New components conflict with existing styles
   - **Mitigation:**
     - Use CSS modules
     - Namespace new classes
     - Test on multiple devices

2. **Map Integration Complexity**
   - **Risk:** Map notifications don't route correctly
   - **Mitigation:**
     - Isolated map notification router
     - Fallback to activity page
     - Error boundaries

### 6.5 Testing Strategy

#### 6.5.1 Unit Tests
- Identity resolution functions
- Migration helpers
- Notification formatting
- Priority/grouping logic

#### 6.5.2 Integration Tests
- Notification store → Activity store sync
- TopNotifications rendering with all identity types
- Map notification routing
- AI explanation sheet display

#### 6.5.3 E2E Tests
- Full notification flow (emit → display → tap → navigate)
- Backward compatibility (old notifications still work)
- Migration path (old data → new format)

### 6.6 Rollout Plan

1. **Week 1-2:** Phase 1 (Foundation)
   - Type definitions
   - Migration helpers
   - Store updates (backward compatible)

2. **Week 3-4:** Phase 2 (Display)
   - UI component updates
   - New badge/avatar components
   - CSS updates

3. **Week 5-6:** Phase 3 (New Kinds)
   - Co-op notifications
   - Member notifications
   - AI explanations
   - Map notifications

4. **Week 7-8:** Phase 4 (Advanced)
   - Queue manager
   - Priority/grouping
   - Performance optimization
   - Testing & bug fixes

5. **Week 9:** Release
   - Feature flag enabled
   - Monitor for issues
   - Collect user feedback

---

## 7. File Structure Summary

### 7.1 New Files to Create
```
src/lib/notifications/
  ├── identityResolver.ts          # Identity resolution & migration
  ├── priorityQueue.ts              # Notification priority logic
  └── grouping.ts                   # Notification grouping logic

src/components/notifications/
  ├── CoOpBadge.tsx                 # Co-op badge overlay
  ├── MemberAvatar.tsx              # Member avatar with status
  ├── AIExplanationSheet.tsx        # Ephemeral AI explanation
  ├── MapNotificationRouter.tsx    # Map routing handler
  └── NotificationQueue.tsx        # Multi-source queue manager

src/styles/
  ├── co-op-badge.css               # Co-op badge styles
  ├── member-avatar.css             # Member avatar styles
  └── ai-explanation-sheet.css       # AI explanation sheet styles
```

### 7.2 Files to Modify
```
src/store/notifications.ts          # Type expansion, migration
src/store/activity.ts               # Type expansion, migration
src/components/notifications/TopNotifications.tsx  # Identity rendering
src/lib/animations/useAiActionCycle.ts  # AI identity update
src/components/SuccessSheet.tsx    # Identity updates
src/components/ShareProfileSheet.tsx    # Identity updates
src/components/CryptoDepositAddressSheet.tsx  # Identity updates
src/components/ProfileEditSheet.tsx     # Identity updates
src/state/walletMode.tsx            # Identity updates (if needed)
src/components/MapboxMap.tsx         # Map notification integration
```

### 7.3 Migration Scripts (Optional)
```
scripts/
  ├── migrate-notifications.ts     # Migrate old notifications
  └── migrate-activity.ts           # Migrate activity store
```

---

## 8. Success Criteria

✅ All existing notifications continue to work
✅ New identity types render correctly
✅ Co-op badges display on co-op notifications
✅ Member avatars display on member notifications
✅ AI explanations show in ephemeral sheet
✅ Map notifications route to map view
✅ Notification priority/grouping works
✅ Backward compatibility maintained
✅ Performance acceptable (< 100ms notification render)
✅ No breaking changes for existing users

---

## 9. Open Questions

1. **Co-op Store:** Does a co-op store/context already exist? If not, create one?
2. **Member Store:** Does a member/user network store exist? If not, create one?
3. **Avatar Storage:** Where are member/co-op avatars stored? (CDN, local, API)
4. **Ephemeral Persistence:** Should ephemeral notifications persist to activity? (User preference?)
5. **Notification Limits:** Should we limit notifications per identity type? (e.g., max 2 AI per hour)
6. **Offline Support:** How should notifications work offline? (Queue locally, sync on reconnect)
7. **Push Notifications:** Should we integrate with browser push API for background notifications?

---

**End of Delta Mapping Document**


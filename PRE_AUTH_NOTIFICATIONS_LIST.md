# Pre-Authenticated State Notifications

**Purpose**: Complete inventory of all notification types and variations that can appear when the user is **not authenticated** (pre-sign-in demo mode).

**Source**: `src/lib/demo/demoNotificationEngine.ts`  
**Condition**: Only runs when `NEXT_PUBLIC_DEMO_MODE === 'true'` AND `isAuthed === false`

---

## Notification Types (Base Kinds)

The system supports **10 base notification kinds**:

1. `payment_sent` - Payment sent by user
2. `payment_received` - Payment received by user
3. `request_sent` - Payment request sent
4. `payment_failed` - Payment failed
5. `refund` - Refund received
6. `ai_trade` - AI manager adjustment/trade
7. `mode-change` - Wallet mode change
8. `transfer` - Internal transfer between cards
9. `sponsorship` - Recurring sponsorship activated
10. (Note: Some kinds may exist but not be used in demo mode)

---

## Pre-Authenticated Demo Notifications

The demo notification engine generates the following notification templates when the user is **not authenticated**:

### 1. AI Manager Events (Smart: AI Defending Purchasing Power)

#### 1.1 AI Reduced Market Risk
- **Kind**: `ai_trade`
- **Title**: `"AI reduced market risk"`
- **Action**: `"Shifted R250 to stable assets."`
- **Reason**: `"Fragility increased in crypto markets; preserving purchasing power."`
- **Amount**: R250 (negative, direction: down)
- **Actor**: `{ type: 'ai_manager' }`
- **Route on tap**: `/transactions`
- **Variations**: Amount varies ±10% (R225-R275)

#### 1.2 AI Increased Defensive Position
- **Kind**: `ai_trade`
- **Title**: `"AI increased defensive position"`
- **Action**: `"Moved R180 to cash buffer."`
- **Reason**: `"Short-term volatility detected in ZAR/MZN corridor."`
- **Amount**: R180 (negative, direction: down)
- **Actor**: `{ type: 'ai_manager' }`
- **Variations**: Amount varies ±10% (R162-R198)

#### 1.3 AI Restored Growth Exposure
- **Kind**: `ai_trade`
- **Title**: `"AI restored growth exposure"`
- **Action**: `"Redeployed R150 from cash buffer."`
- **Reason**: `"Market stabilized; restoring balanced allocation."`
- **Amount**: R150 (positive, direction: up)
- **Actor**: `{ type: 'ai_manager' }`
- **Variations**: Amount varies ±10% (R135-R165)

#### 1.4 ACD Engine Alert
- **Kind**: `ai_trade`
- **Title**: `"ACD engine alert"`
- **Action**: `"Protected R320 of purchasing power."`
- **Reason**: `"Fragility spike detected; shifted to defensive assets."`
- **Amount**: R320 (negative, direction: down)
- **Actor**: `{ type: 'ai_manager' }`
- **Variations**: Amount varies ±10% (R288-R352)

**AI Trade Notes**:
- AI events are prioritized in the first 8 seconds (60% chance) to establish "AI is working" narrative
- AI trades trigger card animations (`onCardAnimation('ai_trade')`)
- Large AI trades (amount threshold) trigger FAB highlight

---

### 2. Social: Cross-Border Payments and Remittances

#### 2.1 Cross-Border Transfer Received
- **Kind**: `payment_received`
- **Title**: `"Cross-border transfer received"`
- **Body**: `"You received R450 from Mozambique."`
- **Amount**: R450 (positive, direction: up)
- **Actor**: 
  ```typescript
  {
    type: 'member',
    id: 'demo-member-1',
    name: 'Member',
    handle: '@member1',
    avatar: '/assets/avatar_agent5.png'
  }
  ```
- **Map**: `{ lat: -25.9692, lng: 32.5732, markerId: 'member-moz' }` (Maputo, Mozambique)
- **Variations**: Amount varies ±10% (R405-R495)
- **Map Behavior**: Triggers map pan to Maputo coordinates

#### 2.2 Payment Sent Across Border
- **Kind**: `payment_sent`
- **Title**: `"Payment sent across border"`
- **Body**: `"You sent R280 to Zimbabwe. Payment complete."`
- **Amount**: R280 (negative, direction: down)
- **Actor**: `{ type: 'user' }`
- **Variations**: Amount varies ±10% (R252-R308)

#### 2.3 Payment Received from Member
- **Kind**: `payment_received`
- **Title**: `"You received R320"`
- **Body**: `"Payment from @member2 received."`
- **Amount**: R320 (positive, direction: up)
- **Actor**:
  ```typescript
  {
    type: 'member',
    id: 'demo-member-2',
    name: 'Member',
    handle: '@member2',
    avatar: '/assets/avatar_agent6.png'
  }
  ```
- **Variations**: Amount varies ±10% (R288-R352)

#### 2.4 Sponsorship Activated
- **Kind**: `sponsorship`
- **Title**: `"Sponsorship activated"`
- **Body**: `"You'll send R150 weekly to @member3. First payment processed."`
- **Amount**: R150 (negative, direction: down)
- **Actor**: `{ type: 'user' }`
- **Variations**: Amount varies ±10% (R135-R165)

---

### 3. Bank: Deposits, Withdrawals, Transfers

#### 3.1 Cash Deposit Secured
- **Kind**: `payment_received`
- **Title**: `"Cash deposit secured"`
- **Body**: `"Your cash deposit of R500 has been received at GoBankless HQ."`
- **Amount**: R500 (positive, direction: up)
- **Actor**: `{ type: 'system', name: 'GoBankless' }`
- **Variations**: Amount varies ±10% (R450-R550)

#### 3.2 Card Top-Up Completed (MZN)
- **Kind**: `transfer`
- **Title**: `"Card top-up completed"`
- **Body**: `"You moved R300 into your MZN card."`
- **Amount**: R300 (negative, direction: down)
- **Actor**: `{ type: 'user' }`
- **Variations**: Amount varies ±10% (R270-R330)

#### 3.3 Card Top-Up Completed (ZAR)
- **Kind**: `transfer`
- **Title**: `"Transfer completed"`
- **Body**: `"You topped up your ZAR card with R200."`
- **Amount**: R200 (negative, direction: down)
- **Actor**: `{ type: 'user' }`
- **Variations**: Amount varies ±10% (R180-R220)

#### 3.4 Transfer to Crypto Card
- **Kind**: `transfer`
- **Title**: `"Transfer completed"`
- **Body**: `"You moved R180 into your Crypto Card."`
- **Amount**: R180 (negative, direction: down)
- **Actor**: `{ type: 'user' }`
- **Variations**: Amount varies ±10% (R162-R198)

---

### 4. Social Proximity (Anonymous, Privacy-Respecting)

#### 4.1 Community Activity
- **Kind**: `payment_received`
- **Title**: `"Community activity"`
- **Body**: `"Someone nearby just made a cross-border transfer."`
- **Actor**: `{ type: 'system', name: 'GoBankless' }`
- **No amount** (informational only)

#### 4.2 Local Activity
- **Kind**: `payment_received`
- **Title**: `"Local activity"`
- **Body**: `"Users around you have sent R1,200 today."`
- **Actor**: `{ type: 'system', name: 'GoBankless' }`
- **No amount** (informational only)

---

## Notification Generation Behavior

### Timing & Frequency

**Configuration** (from `demoConfig.ts`):
- **Initial Delay**: Configurable (typically 2-5 seconds after page load)
- **Interval**: Random between `INTERVAL_MIN_MS` and `INTERVAL_MAX_MS` (typically 8-15 seconds)
- **Rate Limiting**: Maximum notifications per time window (prevents spam)

**Prioritization**:
- **First 8 seconds**: 60% chance of AI events (establishes "AI is working" narrative)
- **After 8 seconds**: Random selection from all event types

**Amount Randomization**:
- All amounts vary by ±10% each time they're generated
- Formula: `originalAmount * (0.9 + random() * 0.2)`

### Special Behaviors

**Map Panning**:
- Notifications with `map` coordinates trigger map pan to that location
- Example: "Cross-border transfer received" from Mozambique pans map to Maputo

**Card Animations**:
- AI trade notifications trigger card animation (`onCardAnimation('ai_trade')`)
- Visual feedback on wallet cards when AI adjustments occur

**FAB Highlight**:
- Large AI trades (above threshold) trigger FAB (Floating Action Button) highlight
- Shows reason and amount in FAB tooltip

---

## Notification Structure

Each notification has the following structure:

```typescript
{
  kind: NotificationKind,           // Base type (see list above)
  title: string,                     // Main heading (bold)
  body?: string,                     // Detail line (optional, non-bold)
  action?: string,                   // Action description (e.g., "Shifted R250...")
  reason?: string,                   // Reason/explanation (e.g., "Fragility increased...")
  amount?: {                         // Optional amount
    currency: 'ZAR' | 'USDT',
    value: number                    // Positive = inflow, Negative = outflow
  },
  direction?: 'up' | 'down',        // Visual indicator (inflow/outflow)
  actor?: ActorIdentity,             // Who performed the action
  map?: {                            // Optional map coordinates
    lat: number,
    lng: number,
    markerId?: string
  },
  routeOnTap?: string,              // Optional route (e.g., '/transactions')
  timestamp: number,                 // Auto-generated
  id: string                         // Auto-generated UUID
}
```

---

## Actor Types

**ActorIdentity** can be:
- `{ type: 'user' }` - The current user
- `{ type: 'ai_manager' }` - AI portfolio manager
- `{ type: 'member' }` - Community member (with handle, avatar, name)
- `{ type: 'system' }` - System/GoBankless (with name)
- `{ type: 'co_op' }` - Co-operative (legacy, rarely used)

---

## Summary Statistics

**Total Notification Templates in Pre-Auth State**: **16**

**By Category**:
- **AI Manager Events**: 4 templates
- **Social Payments**: 4 templates
- **Bank Operations**: 4 templates
- **Social Proximity**: 2 templates

**By Notification Kind**:
- `ai_trade`: 4
- `payment_received`: 5 (includes social proximity)
- `payment_sent`: 1
- `transfer`: 3
- `sponsorship`: 1
- `payment_failed`: 0 (not used in demo)
- `request_sent`: 0 (not used in demo)
- `refund`: 0 (not used in demo)
- `mode-change`: 0 (not used in demo)

---

## Additional Notifications (Post-Auth, but Part of Sign-Up Flow)

**Note**: The following notification appears during the sign-up process but **after** authentication is complete, so it's technically not "pre-authenticated" but is part of the unauthenticated user journey:

### Sign-Up Success Notification
- **Kind**: `payment_sent` (reused, not ideal)
- **Title**: `"Your GoBankless account has been created."`
- **Actor**: `{ type: 'system', id: 'system', name: 'System' }`
- **Trigger**: After user completes phone sign-up (enters password and submits)
- **Location**: `src/components/PhoneSignupSheet.tsx`
- **Timing**: Appears immediately after sign-up form submission, before returning to home page

**Note**: This notification appears after `completeAuth()` is called, so the user is technically authenticated at this point. However, it's part of the sign-up flow that starts in the unauthenticated state.

---

## Notes

1. **Demo Mode Only**: Demo notifications only appear when:
   - `NEXT_PUBLIC_DEMO_MODE === 'true'`
   - User is **not authenticated** (`isAuthed === false`)

2. **Stops on Auth**: Demo notification engine stops immediately when user authenticates

3. **Rate Limited**: Notifications are rate-limited to prevent overwhelming the user

4. **Random Selection**: Notifications are randomly selected from the pool, with AI events prioritized early

5. **Amount Variance**: All amounts vary by ±10% to add realism

6. **Map Integration**: Some notifications trigger map panning to show geographic context

7. **Card Animations**: AI trades trigger visual card animations for feedback

8. **Sign-Up Success**: The account creation notification appears after authentication completes, but is part of the sign-up flow

---

**End of Documentation**


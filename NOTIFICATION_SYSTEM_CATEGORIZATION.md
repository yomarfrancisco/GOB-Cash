# Notification System: Categories, Jobs-to-be-Done, and Origins

**Purpose**: Complete categorization of all notification types in the GoBankless system, organized by category with their intended purpose (job-to-be-done) and origin (who/what triggers them).

**Source**: `src/store/notifications.ts`, `src/lib/demo/demoNotificationEngine.ts`, and various components

---

## Notification Categories

The notification system is organized into **5 main categories**:

1. **AI/Smart Protection** - AI portfolio manager actions
2. **Social/Peer-to-Peer** - User-to-user interactions
3. **Bank Operations** - Deposits, withdrawals, transfers
4. **System/Infrastructure** - System-level events and errors
5. **User Actions** - User-initiated confirmations

---

## 1. AI/Smart Protection Notifications

**Category Purpose**: Communicate AI portfolio manager's autonomous actions to protect and optimize user's purchasing power.

### 1.1 `ai_trade` - AI Portfolio Adjustments

**Job-to-be-Done**: 
- Inform user that AI has autonomously adjusted their portfolio allocation
- Build trust that AI is actively protecting their funds
- Explain the reasoning behind AI decisions (fragility detection, volatility response)
- Provide transparency on fund movements

**Origin**: 
- **Actor**: `ai_manager` (autonomous AI system)
- **Trigger**: AI fragility detection engine, market volatility analysis, risk assessment algorithms
- **Frequency**: Real-time when market conditions trigger protection thresholds

**Examples**:
- "AI reduced market risk" - Shifted funds to stable assets due to crypto volatility
- "AI moved funds to safety" - Moved to cash reserves during ZAR/MZN volatility
- "AI rebalanced for growth" - Restored yield allocation when market stabilized
- "AI protection triggered" - Protected funds from market drop

**Special Behaviors**:
- Triggers card animations (`onCardAnimation('ai_trade')`)
- Large amounts trigger FAB highlight
- Can include `routeOnTap: '/transactions'` for navigation
- Uses `action` + `reason` format (not just `body`)

---

## 2. Social/Peer-to-Peer Notifications

**Category Purpose**: Facilitate social banking - payments, remittances, and community interactions between users.

### 2.1 `payment_sent` - Outgoing Payments

**Job-to-be-Done**:
- Confirm successful payment completion
- Provide payment details (amount, recipient)
- Enable user to track their outgoing transactions
- Build confidence in payment system

**Origin**:
- **Actor**: `user` (self-initiated)
- **Trigger**: User completes payment flow (Pay/Request button, third-party profile, etc.)
- **Context**: Can be local payment, cross-border payment, or sponsorship activation

**Examples**:
- "Cross-border payment sent" - "You sent R280 to Zimbabwe. Payment complete."
- "Payment sent" - Generic payment confirmation
- "Now backing @thabo" - Recurring sponsorship activated

### 2.2 `payment_received` - Incoming Payments

**Job-to-be-Done**:
- Alert user to incoming funds
- Identify sender (member, agent, or system)
- Provide amount and context
- Enable quick access to transaction details

**Origin**:
- **Actor**: `member` (another user), `system` (for deposits), or `ai_manager` (for agent availability)
- **Trigger**: 
  - Another user sends payment to current user
  - System processes cash deposit
  - Cross-border transfer received
  - Agent becomes available (special case)

**Examples**:
- "Payment received" - "R320 from @member2"
- "Cross-border transfer received" - "You received R450 from Mozambique."
- "Cash deposit secured" - "Your R500 cash deposit is confirmed."
- "🟢 Ama" - "@handle is now available as a cash agent near you"

**Special Behaviors**:
- Can include `map` coordinates for cross-border payments (triggers map pan)
- Member payments include actor details (handle, avatar, name)

### 2.3 `request_sent` - Payment Requests

**Job-to-be-Done**:
- Confirm payment request was sent to recipient
- Track request status (pending, fulfilled, expired)
- Provide context for cash-in/out agent flows

**Origin**:
- **Actor**: `user` (self-initiated)
- **Trigger**: User initiates payment request flow
- **Context**: Often part of cash deposit/withdrawal agent coordination

**Examples**:
- "You requested R{amount} from @{handle}"
- "Cash-in agent is heading your way"
- "Agent arrived. Confirm the PIN when depositing"
- "Cash is now in transit to HQ"

### 2.4 `sponsorship` - Recurring Backing/Investment

**Job-to-be-Done**:
- Confirm recurring sponsorship/backing activation
- Explain earning model ("You earn when they move cash")
- Track recurring commitment (weekly/monthly)

**Origin**:
- **Actor**: `user` (self-initiated)
- **Trigger**: User sets up recurring sponsorship from third-party profile
- **Context**: Micro-investment/backing model for agents

**Examples**:
- "Now backing @thabo" - "R150/week committed. You earn when they move cash."

---

## 3. Bank Operations Notifications

**Category Purpose**: Confirm banking operations - deposits, withdrawals, and internal transfers between cards/wallets.

### 3.1 `transfer` - Internal Card/Wallet Transfers

**Job-to-be-Done**:
- Confirm successful transfer between user's own cards/wallets
- Show which card was topped up or funded
- Provide amount and destination

**Origin**:
- **Actor**: `user` (self-initiated)
- **Trigger**: User moves funds between their own cards (ZAR, MZN, Crypto, etc.)
- **Context**: Internal portfolio rebalancing by user

**Examples**:
- "Card top-up completed" - "You moved R300 into your MZN card."
- "Transfer completed" - "You topped up your ZAR card with R200."
- "Transfer completed" - "You moved R180 into your Crypto Card."

### 3.2 `payment_received` (Bank Operations Context)

**Job-to-be-Done**:
- Confirm cash deposits received and secured
- Confirm card payment processing
- Provide deposit confirmation details

**Origin**:
- **Actor**: `system` (name: 'GoBankless')
- **Trigger**: 
  - Cash deposit arrives at GoBankless HQ
  - Card payment is processed and confirmed
  - Bank transfer completes

**Examples**:
- "Cash deposit secured" - "Your R500 cash deposit is confirmed."
- "Card payment confirmed" - "Your card payment of R{amount} has been processed."

---

## 4. System/Infrastructure Notifications

**Category Purpose**: Communicate system-level events, errors, and infrastructure status.

### 4.1 `payment_failed` - Transaction Failures

**Job-to-be-Done**:
- Alert user to failed transactions
- Explain failure reason when possible
- Guide user to retry or contact support
- Build trust through transparency on errors

**Origin**:
- **Actor**: `system` or `user` (depending on context)
- **Trigger**: 
  - Payment processing fails (network, validation, insufficient funds)
  - File operations fail (photo removal, etc.)
  - Copy operations fail

**Examples**:
- "Payment failed" - Generic payment failure
- "Remove failed" - "Could not remove photo. Please try again."
- "Failed to copy USDT address" - "Unable to copy address, please try again"

### 4.2 `refund` - Refund Processing

**Job-to-be-Done**:
- Notify user of refund received
- Explain refund reason
- Confirm refund amount

**Origin**:
- **Actor**: `system`
- **Trigger**: System processes refund (failed transaction, cancellation, etc.)

**Examples**:
- "Refund received" - Standard refund notification

### 4.3 `payment_sent` (System Context)

**Job-to-be-Done**:
- Confirm system-level actions completed
- Provide account status updates
- Welcome new users

**Origin**:
- **Actor**: `system`
- **Trigger**: 
  - Account creation successful
  - System operations complete

**Examples**:
- "You're in. Your wallet is ready." - Sign-up success notification

### 4.4 Social Proximity Notifications

**Job-to-be-Done**:
- Create sense of community activity
- Gamify local network engagement
- Maintain privacy (anonymous, aggregated)

**Origin**:
- **Actor**: `system` (name: 'GoBankless')
- **Trigger**: Demo engine generates community activity signals
- **Context**: Privacy-respecting, anonymized local activity

**Examples**:
- "Community activity" - "Someone nearby just made a cross-border transfer."
- "Local activity" - "Users around you have sent R1,200 today."

---

## 5. User Actions Notifications

**Category Purpose**: Confirm user-initiated actions and provide feedback.

### 5.1 `payment_sent` (User Action Context)

**Job-to-be-Done**:
- Confirm copy operations
- Provide immediate feedback on user actions
- Build confidence in UI interactions

**Origin**:
- **Actor**: `user` (self-initiated)
- **Trigger**: User copies address, link, or other data to clipboard

**Examples**:
- "Copied!" - "Payment link copied to clipboard"
- "USDT address copied" - "Base USDT address copied to clipboard"

### 5.2 `mode-change` - Wallet Mode Toggle

**Job-to-be-Done**:
- Confirm wallet mode change (e.g., savings vs. checking)
- Explain mode implications
- Track user preferences

**Origin**:
- **Actor**: `user` (self-initiated)
- **Trigger**: User toggles wallet mode setting

**Examples**:
- Mode change confirmations (specific examples not in current codebase)

---

## Actor Types and Origins Summary

| Actor Type | Description | Typical Origins |
|------------|-------------|-----------------|
| `user` | Current app user | Self-initiated actions (payments, transfers, copies, mode changes) |
| `ai_manager` | AI portfolio manager | Autonomous AI decisions (fragility detection, risk management) |
| `member` | Another GoBankless user | Peer-to-peer payments, cross-border transfers |
| `system` | System/GoBankless infrastructure | Deposits, refunds, errors, account creation, community activity |
| `co_op` | Cooperative organization | Group actions, co-op events (legacy/planned) |

---

## Notification Kind → Category Mapping

| Notification Kind | Primary Category | Secondary Category | Typical Actor |
|------------------|------------------|-------------------|---------------|
| `ai_trade` | AI/Smart Protection | - | `ai_manager` |
| `payment_sent` | Social/Peer-to-Peer | User Actions, System | `user`, `system` |
| `payment_received` | Social/Peer-to-Peer | Bank Operations | `member`, `system`, `ai_manager` |
| `request_sent` | Social/Peer-to-Peer | - | `user` |
| `sponsorship` | Social/Peer-to-Peer | - | `user` |
| `transfer` | Bank Operations | - | `user` |
| `payment_failed` | System/Infrastructure | - | `system`, `user` |
| `refund` | System/Infrastructure | - | `system` |
| `mode-change` | User Actions | - | `user` |

---

## Special Notification Behaviors

### Map Integration
- **Cross-border payments** can include `map` coordinates
- Triggers map pan to location when notification appears
- Used for: Cross-border transfers, agent availability

### Card Animations
- **AI trades** trigger card animations (`onCardAnimation('ai_trade')`)
- Visual feedback for portfolio adjustments

### FAB Highlight
- **Large AI trades** trigger FAB (Floating Action Button) highlight
- Draws attention to significant AI actions

### Navigation
- **Route on tap**: Some notifications include `routeOnTap` for deep linking
- Example: AI trades → `/transactions` page

### Amount Variance (Demo Mode)
- Demo notifications randomize amounts by ±10%
- Creates more realistic variation in demo experience

---

## Notification Flow Patterns

### 1. User-Initiated Flow
```
User Action → System Processing → Success/Failure Notification
Example: Payment sent → Processing → "Payment sent" or "Payment failed"
```

### 2. AI-Initiated Flow
```
Market Event → AI Analysis → AI Action → Notification
Example: Volatility detected → AI shifts funds → "AI moved funds to safety"
```

### 3. Peer-to-Peer Flow
```
User A sends payment → System processes → User B receives notification
Example: "@member1 sends R450" → "Payment received: R450 from @member1"
```

### 4. System-Initiated Flow
```
System Event → Processing → Status Notification
Example: Cash deposit arrives → System confirms → "Cash deposit secured"
```

---

## Notification Priority and Timing

### Demo Mode Prioritization
- **First 8 seconds**: 60% chance of AI events (establishes "AI is working" narrative)
- **After 8 seconds**: Balanced distribution across all event types

### Rate Limiting
- Configurable per auth state (authenticated vs. unauthenticated)
- Prevents notification spam
- Respects user experience thresholds

---

## Future Considerations

### Planned Notification Types (from upgrade docs)
- `co_op_joined` - User joined a co-op
- `co_op_payment` - Payment to/from co-op
- `co_op_contribution` - Contribution to co-op fund
- `co_op_distribution` - Distribution from co-op fund
- `member_payment_sent` - Payment sent to another member
- `member_payment_received` - Payment received from another member

### Notification Enhancement Opportunities
- Rich media (images, avatars)
- Action buttons (approve, decline, view details)
- Grouped notifications (multiple events in one)
- Notification preferences/settings
- Push notifications (mobile)

---

## Summary

The GoBankless notification system serves **5 primary jobs**:

1. **AI Transparency** - Keep users informed about autonomous portfolio protection
2. **Social Banking** - Facilitate peer-to-peer payments and community engagement
3. **Bank Operations** - Confirm deposits, withdrawals, and transfers
4. **System Reliability** - Communicate errors, refunds, and system status
5. **User Feedback** - Confirm actions and provide immediate UI feedback

Each notification category has distinct origins (user, AI, system, members) and serves specific user needs in the smart, social, cross-border banking experience.


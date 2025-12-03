# Notification Types Inventory

Complete list of all notification types used in the GOB-Cash app, including wording and intent.

## Notification Kind Types

Defined in `src/store/notifications.ts`:

```typescript
export type NotificationKind =
  | 'payment_sent'
  | 'payment_received'
  | 'request_sent'
  | 'payment_failed'
  | 'refund'
  | 'ai_trade'
  | 'mode-change'
  | 'transfer'
```

---

## 1. `payment_sent`

**Intent:** Confirms a payment or action was successfully sent/completed by the user.

### Examples:

| Title | Body | Context | Actor |
|-------|------|---------|-------|
| `Payment sent` | `You sent R{amount} to {recipient}.` | SuccessSheet after payment | `user` |
| `You sent R120 to Nomsa` | `Payment complete.` | Dev helper example | `user` |
| `You paid R120 to @thando` | `You paid R120 to @thando for materials.` | Demo notification | `user` |
| `You supported the co-op` | `You sent R150 to the co-op wallet.` | Demo notification | `user` |
| `Copied!` | `Payment link copied to clipboard` | ShareProfileSheet copy action | `user` |
| `Copied!` | `{COIN} address copied` | CryptoDepositAddressSheet copy | `user` |
| `USDT address copied` | `Base USDT address copied to clipboard` | CardStackCard long-press copy | `user` |
| `Your GoBankless account has been created.` | *(none)* | PhoneSignupSheet success | `system` |

---

## 2. `payment_received`

**Intent:** Notifies user of incoming funds or contributions.

### Examples:

| Title | Body | Context | Actor |
|-------|------|---------|-------|
| `Payment received` | `sender@email.com sent you R{amount} for "[reference]"` | Dev helper example | `user` |
| `Deposit received at HQ` | `Your cash deposit of R{amount} has been received and secured at GoBankless HQ.` | SuccessSheet (deposit kind) | `system` |
| `Card payment confirmed` | `Your card payment of R{amount} has been processed.` | SuccessSheet (card kind) | `system` |
| `Co-op contribution` | `3 members added R270 to the shared wallet.` | Demo notification | `co_op` |
| `Co-op crossed R12,500` | `Your community reached R12,500 toward its goal.` | Demo notification | `co_op` |
| `Co-op reached R10,000` | `New contribution added to the shared pool.` | Dev helper example | `co_op` |
| `Naledi added R200` | `Naledi added R200 from Johannesburg.` | Demo notification | `member` |
| `Thabo added R150` | `Thabo added R150 to the co-op from Cape Town.` | Demo notification | `member` |
| `Sarah added R180` | `Sarah added R180 from Durban.` | Demo notification | `member` |
| `Amanda topped up R50` | `Member nearby just contributed.` | Dev helper example | `member` |

---

## 3. `request_sent`

**Intent:** Indicates a payment request was sent or a cash-in agent flow state change.

### Examples:

| Title | Body | Context | Actor |
|-------|------|---------|-------|
| `Request sent` | `You requested R{amount} from recipient@email.com for '[reference]'.` | Dev helper example | `user` |
| `Cash-in agent on the way` | `$kerryy is on the way to collect your cash.` | CashMapPopup (MATCHED_EN_ROUTE) | `system` |
| `Dealer has arrived` | `Meet $kerryy and deposit your cash. Ask them to confirm PIN 0747.` | CashMapPopup (ARRIVED) | `system` |
| `Cash in transit to HQ` | `Your deposit is on its way to GoBankless HQ.` | CashMapPopup (IN_TRANSIT_TO_HQ) | `system` |

---

## 4. `payment_failed`

**Intent:** Indicates an error or failure in a user action or system process.

### Examples:

| Title | Body | Context | Actor |
|-------|------|---------|-------|
| `Payment failed` | `Your payment could not be processed and has been fully refunded.` | Dev helper example | `user` |
| `Temporary network issue` | `We retried a trade due to a network hiccup.` | Demo notification | `system` |
| `Network issue` | `We'll retry your payment in a moment.` | Dev helper example | `system` |
| `Remove failed` | `Could not remove photo. Please try again.` | ProfileEditSheet (avatar removal) | `user` |
| `Remove failed` | `Could not remove backdrop. Please try again.` | ProfileEditSheet (backdrop removal) | `user` |
| `Image too large` | `Maximum file size is 5MB. Please choose a smaller image.` | ProfileEditSheet (file validation) | `user` |
| `Invalid file type` | `Please use JPEG, PNG, WebP, or HEIC format.` | ProfileEditSheet (file validation) | `user` |
| `Upload failed` | `Could not update photo. Please try again.` | ProfileEditSheet (avatar upload) | `user` |
| `Upload failed` | `Could not update backdrop. Please try again.` | ProfileEditSheet (backdrop upload) | `user` |
| `Error` | `Failed to generate QR code` | ShareProfileSheet / CryptoDepositAddressSheet | `system` |
| `Error` | `Failed to copy link` | ShareProfileSheet copy failure | `system` |
| `Error` | `Failed to copy address` | CryptoDepositAddressSheet copy failure | `system` |
| `Failed to copy USDT address` | `Unable to copy address, please try again` | CardStackCard long-press copy failure | `user` |

---

## 5. `refund`

**Intent:** Notifies user of a refund issued to their account.

### Examples:

| Title | Body | Context | Actor |
|-------|------|---------|-------|
| `Refund issued` | `We refunded R{amount} to your card • Ref: 9X3K…` | Dev helper example | `user` |

---

## 6. `ai_trade`

**Intent:** Notifies user of AI manager portfolio rebalancing actions.

### Examples:

| Title | Body | Action | Reason | Context | Actor |
|-------|------|--------|--------|---------|-------|
| `AI trade executed` | *(none)* | `Rebalanced: sold 1.86 PEPE, bought 0.04 ETH.` | `Reason: short-term volatility spike in PEPE; shifting risk to ETH's steadier trend.` | Dev helper example | `ai_manager` |
| `AI trade executed` | *(none)* | `Reduced ETH exposure by 0.5%.` | `Reason: CPI print hotter than forecast; raising cash buffer.` | Dev helper example | `ai_manager` |
| `AI trade executed` | *(none)* | `Added 2.4 PEPE after retracement.` | `Reason: sentiment reversed from RSI 28 to neutral; capturing rebound zone.` | Dev helper example | `ai_manager` |
| `AI trade executed` | *(none)* | `Rebalanced: bought 12 PEPE (R120).` | `Reason: portfolio rebalancing to maintain target allocation.` | Dev helper example | `ai_manager` |
| `AI trade executed` | *(none)* | `Rebalanced 10.11 PEPE → ETH (R183.09).` | `Keeping your co-op portfolio aligned with current trends.` | Demo notification | `ai_manager` |
| `AI manager reduced risk` | *(none)* | `Shifted R250 from PEPE to cash.` | `Short-term volatility detected; raising cash buffer.` | Demo notification | `ai_manager` |
| `AI trade executed` | *(none)* | `Bought 5.2 PEPE (R94.20).` | `Market conditions favor this adjustment.` | Demo notification | `ai_manager` |
| `AI manager preparing` | `Setting up your community wallet...` | *(none)* | *(none)* | Demo notification | `ai_manager` |
| `AI manager rebalanced your portfolio` | `Shifted R250 from PEPE to USDT.` | *(none)* | *(none)* | Dev helper example | `ai_manager` |
| `AI trade executed` | *(none)* | `Rebalanced: {actionVerb} {delta} {assetName} (R{amount}).` | `Market shift detected; protecting group savings.` | useAiActionCycle (dynamic) | `ai_manager` |

**Note:** AI trade notifications use `action` and `reason` fields instead of `body` for structured display.

---

## 7. `mode-change`

**Intent:** Notifies user when wallet mode switches between manual and autonomous.

### Examples:

| Title | Body | Context | Actor |
|-------|------|---------|-------|
| `Manual mode enabled` | `Cards will only animate when you interact.` | walletMode.tsx (manual) | `user` |
| `Autonomous mode enabled` | `Cards may animate automatically.` | walletMode.tsx (autonomous) | `user` |

---

## 8. `transfer`

**Intent:** Confirms a transfer between wallets/cards was completed.

### Examples:

| Title | Body | Context | Actor |
|-------|------|---------|-------|
| `Transfer completed` | `You transferred R{amount} to {recipient}.` | SuccessSheet (transfer flowType) | `user` |
| `You topped up R300` | `You topped up R300 into your MZN card.` | Demo notification | `user` |

---

## Actor Types

Notifications can have different actors (who performed the action):

1. **`user`** - The current user
2. **`ai_manager`** - AI portfolio manager (legacy: `ai`)
3. **`co_op`** - GoBankless Co-op entity
4. **`member`** - Another member/user in the network
5. **`system`** - System/automated notifications

---

## Notification Structure

```typescript
{
  id: string // UUID
  kind: NotificationKind
  title: string // Main notification title
  body?: string // Optional detail text
  action?: string // For AI trades: what happened
  reason?: string // For AI trades: why it happened
  amount?: {
    currency: 'ZAR' | 'USDT'
    value: number // positive for inflow, negative for outflow
  }
  direction?: 'up' | 'down' // inflow/outflow
  actor?: ActorIdentity
  map?: {
    lat: number
    lng: number
    markerId?: string
  }
  timestamp: number // ms since epoch
  routeOnTap?: string // Deep link route
}
```

---

## Notes

- **Demo Mode:** Many notifications are generated by `src/lib/demo/demoNotificationEngine.ts` when `NEXT_PUBLIC_DEMO_MODE === 'true'`
- **Dev Helpers:** Additional test notifications available via `window.debugNotify()`, `window.debugAiExamples()`, etc. (see `src/lib/notifications/devHelpers.ts`)
- **Activity Store:** All notifications are also added to the activity store for historical tracking
- **Max Queue:** Notification store keeps max 10 notifications in queue (oldest removed when limit reached)


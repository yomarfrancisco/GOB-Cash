# Profile Page > Inbox > Ama — Investment Manager Conversation Flow

## Overview

This document describes the end-to-end flow and implementation of the **Profile Page → Inbox → Ama — Investment Manager** conversation feature. This is a financial inbox system that allows users to interact with Ama, an AI Investment Manager (also referred to as "Stokvel Treasurer" in some parts of the codebase), through a chat-like interface.

---

## User Journey & Flow

### 1. Entry Point: Profile Page

**Location:** `src/app/profile/page.tsx`

**Entry Mechanism:**
- User navigates to `/profile` page
- In the profile actions section (lines 328-349), there is an **"Inbox"** button
- Clicking this button triggers `openInbox()` from the `useFinancialInboxStore` Zustand store

**Code Reference:**
```typescript
// Line 49: Store hook
const { openInbox, closeInbox, isInboxOpen } = useFinancialInboxStore()

// Lines 340-348: Inbox button
<button
  className="btn profile-inbox"
  onClick={() => {
    guardAuthed(() => {
      openInbox()
    })
  }}
>
  Inbox
</button>
```

**Key Behavior:**
- The button is auth-gated via `guardAuthed()` hook
- Only authenticated users can access the inbox
- The `FinancialInboxSheet` component is rendered at the bottom of the profile page (line 635)

---

### 2. Inbox List View

**Component:** `src/components/Inbox/FinancialInboxSheet.tsx`

**View Mode:** `inboxViewMode === 'inbox'` (default state)

**UI Structure:**
1. **ActionSheet Container** (lines 90-96)
   - Uses the `ActionSheet` component with `size="tall"`
   - Title: "Inbox"
   - Controlled by `isInboxOpen` state

2. **Subtitle** (line 101)
   - Text: "Connect with verified cash agents and community members"
   - Centered, light gray text

3. **Search Bar** (lines 105-117)
   - Placeholder: "Search cash agents"
   - Gray background (`#e5e5ea`), rounded corners
   - Currently non-functional (static UI)

4. **Agent/Thread List** (lines 120-156)
   - Scrollable list of conversation threads
   - **Static demo data** (lines 29-75):
     - **Ama — Investment Manager** (id: `'ama'`)
     - Other demo agents: `$kerry`, `$simi_love`, `$ariel`, `$dana`
   - Each row displays:
     - Avatar (64x64px circular image)
     - Name/title
     - Preview text
     - Timestamp
     - Unread indicator (blue dot) if applicable

**Ama Thread Display:**
- **Name:** "Ama — Investment Manager"
- **Avatar:** `/assets/Brics-girl-blue.png`
- **Preview:** "Welcome! I can help you join a group or find a trusted cash agent."
- **Time:** "16:09"
- **Unread:** `true` (shows blue dot)

**Click Handler** (lines 77-84):
```typescript
const handleRowClick = (id: string) => {
  if (id === 'ama') {
    openChatSheet('portfolio-manager')
  }
  // Other rows are static for now
}
```

**State Management:**
- Clicking Ama's row calls `openChatSheet('portfolio-manager')`
- This sets:
  - `activeThreadId = 'portfolio-manager'`
  - `inboxViewMode = 'chat'`
- The sheet remains open but switches to chat view

---

### 3. Chat View (Ama Conversation)

**Component:** `src/components/Inbox/FinancialInboxSheet.tsx` (lines 162-228)

**View Mode:** `inboxViewMode === 'chat'`

**UI Structure:**

#### Header Row (lines 165-185)
- **Back Button:** Returns to inbox list (`goBackToInbox()`)
- **Avatar:** 38x38px circular image (`/assets/Brics-girl-blue.png`)
- **Name:** "Ama — Investment Manager"
- **Close Button:** Provided by ActionSheet component (top-right)

#### Divider (line 188)
- Light gray horizontal line (`#E8E8ED`)
- Separates header from message area

#### Message Area (lines 191-210)
- **Scrollable container** for messages
- **Initial Message Display:**
  - Avatar: 31x31px circular image (same BRICS girl avatar)
  - Message Bubble:
    - Background: `#F3F3F9` (light gray)
    - Border radius: 16px (fully rounded)
    - Padding: 16px 20px
    - Text: "Hi, I'm Ama, your Investment Manager 👋   I can help you make your first deposit, find a cash agent, or convert cash to crypto.   What would you like to do first?"
  - Timestamp: "14:09"
  - Positioned on the left (AI message)

**Note:** The chat view currently shows a **hardcoded initial message** in the component (line 205). This is different from the state-managed messages in `useFinancialInboxStore`.

#### Input Bar (lines 213-227)
- **Attachment Button:** Paperclip icon (non-functional)
- **Text Input:**
  - Placeholder: "Add a message"
  - Background: `#E6E6EB` (light gray)
  - Border radius: 24px (pill-shaped)
  - Currently non-functional (no submit handler)

---

## State Management

### Zustand Store: `useFinancialInboxStore`

**Location:** `src/state/financialInbox.ts`

**Key State Properties:**

1. **Threads Array** (lines 60-70)
   - Contains conversation threads
   - Initial thread for Ama:
     ```typescript
     {
       id: 'portfolio-manager',
       title: 'Ama — Stokvel Treasurer',
       subtitle: 'Welcome! I can help you join or start a Stokvel.',
       avatarUrl: '/assets/Brics-girl-blue.png',
       unreadCount: 1,
       lastMessageAt: '16:09',
       kind: 'portfolio_manager',
     }
     ```

2. **Messages by Thread ID** (lines 71-73)
   - `messagesByThreadId` is a Record mapping thread IDs to message arrays
   - Initial message for Ama:
     ```typescript
     {
       id: nanoid(),
       threadId: 'portfolio-manager',
       from: 'ai',
       text: 'Hi, I\'m Ama, your Stokvel Treasurer 👋   I can help you make your first deposit, join a Stokvel, or start a new group with friends.   What would you like to do first?',
       createdAt: '14:09',
     }
     ```

3. **View Mode** (line 76)
   - `inboxViewMode: 'inbox' | 'chat'`
   - Controls which view is displayed in the sheet

4. **Active Thread** (line 74)
   - `activeThreadId: ThreadId | null`
   - Currently selected conversation thread

**Key Actions:**

1. **`openInbox()`** (lines 107-112)
   - Sets `isInboxOpen = true`
   - Resets `inboxViewMode = 'inbox'`

2. **`openChatSheet(threadId)`** (lines 122-127)
   - Sets `activeThreadId = threadId`
   - Sets `inboxViewMode = 'chat'`
   - Keeps sheet open

3. **`goBackToInbox()`** (lines 129-133)
   - Sets `inboxViewMode = 'inbox'`
   - Keeps sheet open (doesn't close it)

4. **`sendMessage(threadId, from, text)`** (lines 139-173)
   - Creates new message with `nanoid()` ID
   - Adds message to thread's message array
   - Updates thread subtitle (truncated to 60 chars)
   - Updates thread timestamp
   - Increments `unreadCount` if message is from AI

5. **`ensurePortfolioManagerThread()`** (lines 78-105)
   - Ensures Ama's thread exists in the store
   - Creates thread and initial message if missing
   - Used for initialization/cleanup

---

## Data Structure

### Thread Type
```typescript
type Thread = {
  id: ThreadId                    // 'portfolio-manager' for Ama
  title: string                   // 'Ama — Stokvel Treasurer'
  subtitle: string                // Preview text shown in inbox list
  avatarUrl: string               // '/assets/Brics-girl-blue.png'
  unreadCount: number             // Number of unread messages
  lastMessageAt: string           // '14:09' or ISO timestamp
  kind: 'portfolio_manager' | 'peer'
}
```

### ChatMessage Type
```typescript
type ChatMessage = {
  id: string                      // Generated with nanoid()
  threadId: ThreadId              // 'portfolio-manager'
  from: 'user' | 'ai'             // Message sender
  text: string                    // Message content
  createdAt: string               // '14:09' format or ISO
}
```

---

## UI/UX Behavior

### Visual Design

**Inbox List View:**
- **Layout:** Full-height sheet with scrollable list
- **Row Height:** ~88px per conversation
- **Avatar Size:** 64x64px circular
- **Typography:**
  - Title: 16px, font-weight 600, black
  - Preview: 14px, font-weight 400, 50% opacity black
  - Time: 14px, font-weight 400, `#8e8e93`
- **Unread Indicator:** 8px blue dot (`#007AFF`)
- **Divider:** 1px `#e5e5ea` between rows

**Chat View:**
- **Header:**
  - Back button: 24x24px icon
  - Avatar: 38x38px circular
  - Name: 15px, font-weight 400
- **Message Bubble:**
  - Background: `#F3F3F9`
  - Border radius: 16px
  - Padding: 16px 20px
  - Text: 15px, line-height 1.4
  - Max width: `calc(100% - 39px)` (accounting for avatar + gap)
- **Input Bar:**
  - Background: `#E6E6EB` (input field)
  - Border radius: 24px (pill-shaped)
  - Padding: 12px 16px

### Interaction Patterns

1. **Opening Inbox:**
   - Sheet slides up from bottom
   - Always starts in "inbox" view mode
   - Shows list of conversations

2. **Selecting Ama Thread:**
   - Click on "Ama — Investment Manager" row
   - Sheet transitions to "chat" view
   - Header shows back button, avatar, and name
   - Message area displays initial message

3. **Returning to Inbox:**
   - Click back button in chat header
   - Sheet transitions back to "inbox" view
   - Sheet remains open (doesn't close)

4. **Closing Inbox:**
   - Click close button (X) in ActionSheet header
   - Or click outside sheet (if ActionSheet supports it)
   - Resets `inboxViewMode` to 'inbox'

### Current Limitations

1. **Static Demo Data:**
   - Inbox list shows hardcoded agent list (not from store)
   - Only Ama's thread is functional
   - Other agents are static UI elements

2. **Hardcoded Initial Message:**
   - Chat view shows hardcoded message in component
   - Doesn't use `messagesByThreadId` from store
   - Message text differs between store and component:
     - Store: "Stokvel Treasurer"
     - Component: "Investment Manager"

3. **Non-Functional Input:**
   - Input bar has no submit handler
   - No message sending functionality in chat view
   - `DirectMessage` component exists but isn't used

4. **Inconsistent Naming:**
   - Store uses "Stokvel Treasurer"
   - Component uses "Investment Manager"
   - Both refer to the same entity (Ama)

---

## Component Architecture

### Component Hierarchy

```
ProfilePage (src/app/profile/page.tsx)
└── FinancialInboxSheet (src/components/Inbox/FinancialInboxSheet.tsx)
    ├── ActionSheet (src/components/ActionSheet.tsx)
    ├── Inbox List View (conditional render)
    │   ├── Search Bar
    │   └── Agent List (static data)
    └── Chat View (conditional render)
        ├── Header (back button + avatar + name)
        ├── Message Area (hardcoded initial message)
        └── Input Bar (non-functional)
```

### Unused Components

1. **`DirectMessage.tsx`** (`src/components/Inbox/DirectMessage.tsx`)
   - Full-featured chat component with message rendering
   - Supports user/AI message differentiation
   - Has functional input with submit handler
   - **Not currently used** in `FinancialInboxSheet`

2. **`InboxList.tsx`** (`src/components/Inbox/InboxList.tsx`)
   - Renders threads from store
   - Supports thread sorting (portfolio_manager first)
   - **Not currently used** in `FinancialInboxSheet`

---

## Styling

### CSS Modules

1. **`FinancialInboxListSheet.module.css`**
   - Styles for inbox list view
   - Search bar, conversation list, inbox rows
   - Unread indicators, avatars, typography

2. **`FinancialInboxChatSheet.module.css`**
   - Styles for chat view
   - Header row, message bubbles, input bar
   - Timestamps, avatars, dividers

### Key Design Tokens

- **Colors:**
  - Background: `#fff` (white)
  - Divider: `#E8E8ED` / `#e5e5ea` (light gray)
  - Message bubble: `#F3F3F9` (very light gray)
  - Input background: `#E6E6EB` (light gray)
  - Text: `#000` (black)
  - Secondary text: `#8e8e93` (gray)
  - Unread dot: `#007AFF` (iOS blue)

- **Spacing:**
  - Horizontal padding: 20px-24px
  - Vertical padding: 12px-16px
  - Gap between elements: 8px-12px

- **Typography:**
  - Title: 16px, weight 600
  - Body: 15px, weight 400
  - Preview: 14px, weight 400
  - Timestamp: 12px, weight 400

---

## Future Improvements

### Recommended Enhancements

1. **Unify Message Display:**
   - Use `DirectMessage` component or similar
   - Render messages from `messagesByThreadId` store
   - Remove hardcoded message in `FinancialInboxSheet`

2. **Implement Message Sending:**
   - Add submit handler to input bar
   - Use `sendMessage()` action from store
   - Add AI response logic (currently stubbed in `DirectMessage`)

3. **Consolidate Naming:**
   - Decide on single name: "Investment Manager" or "Stokvel Treasurer"
   - Update store and components to match

4. **Use Store for Inbox List:**
   - Replace static agent list with threads from store
   - Use `InboxList` component or similar
   - Support dynamic thread creation

5. **Add Message Persistence:**
   - Store messages in localStorage or backend
   - Restore messages on page reload
   - Support message history

6. **Implement Search:**
   - Add search functionality to search bar
   - Filter threads by name/preview text
   - Highlight search matches

---

## Key Files Reference

### Core Components
- `src/app/profile/page.tsx` - Profile page with inbox entry point
- `src/components/Inbox/FinancialInboxSheet.tsx` - Main inbox/chat sheet component
- `src/components/Inbox/DirectMessage.tsx` - Full chat component (unused)
- `src/components/Inbox/InboxList.tsx` - Thread list component (unused)

### State Management
- `src/state/financialInbox.ts` - Zustand store for inbox state

### Styling
- `src/components/Inbox/FinancialInboxListSheet.module.css` - Inbox list styles
- `src/components/Inbox/FinancialInboxChatSheet.module.css` - Chat view styles
- `src/components/Inbox/DirectMessage.module.css` - DirectMessage styles (unused)
- `src/components/Inbox/InboxList.module.css` - InboxList styles (unused)

### Shared Components
- `src/components/ActionSheet.tsx` - Base sheet component

---

## Summary

The **Profile > Inbox > Ama — Investment Manager** conversation flow is a partially implemented chat interface that allows users to view and interact with Ama, an AI Investment Manager. The system uses Zustand for state management and a unified ActionSheet component that switches between inbox list and chat views. Currently, the chat view shows a hardcoded initial message, and the input bar is non-functional. The underlying state management structure is in place, but the UI components need to be connected to fully utilize the message system.


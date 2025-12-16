# Inbox Default Messages Investigation Report

## 🔍 Investigation Summary

This report identifies the source of Inbox "starter messages" and proposes a minimal safe fix to change what new users see before onboarding.

---

## 1️⃣ Source of Initial Inbox Messages

### **Primary Source: Hard-coded in Zustand Store**

**File:** `src/state/financialInbox.ts`  
**Lines:** 100-108

```typescript
// Initial seed messages for Portfolio Manager
const initialPMMessages: ChatMessage[] = [
  {
    id: nanoid(),
    threadId: PORTFOLIO_MANAGER_THREAD_ID,
    from: 'ai',
    text: 'Hi, I\'m Ama, your Stokvel Treasurer 👋   I can help you make your first deposit, join a Stokvel, or start a new group with friends.   What would you like to do first?',
    createdAt: '14:09',
  },
]
```

**Conditions for appearance:**
- Message appears when `ensurePortfolioManagerThread()` is called
- Thread is created if it doesn't exist (lines 145-178)
- Messages are seeded if `messagesByThreadId[PORTFOLIO_MANAGER_THREAD_ID]` is empty (lines 170-177)
- **No conditions** - always seeded for all users

---

### **Initial Thread Definition**

**File:** `src/state/financialInbox.ts`  
**Lines:** 116-126

```typescript
// Initial threads
const initialThreads: Thread[] = [
  {
    id: PORTFOLIO_MANAGER_THREAD_ID,
    title: 'Ama — Stokvel Treasurer',
    subtitle: 'Welcome! I can help you join or start a Stokvel.',
    avatarUrl: '/assets/Brics-girl-blue.png',
    unreadCount: 1, // Mark as unread with blue dot
    lastMessageAt: '16:09',
    kind: 'portfolio_manager',
  },
]
```

**Conditions:**
- Thread is included in initial store state (line 129)
- Always present for all users
- No onboarding check

---

### **Secondary Source: Demo Intro Message**

**File:** `src/components/Inbox/FinancialInboxSheet.tsx`  
**Line:** 32

```typescript
const AMA_INTRO_TEXT = "GoB helps you invest, pay, and move cash. What would you like to do first?"
```

**Conditions:**
- Only shown when `isDemoIntro === true` (line 962)
- Used for landing page demo intro flow
- Different from the main inbox message

---

## 2️⃣ String Search Results

### Found Strings:

✅ **"Hi, I'm Ama"** → `src/state/financialInbox.ts:105`
✅ **"Stokvel Treasurer"** → `src/state/financialInbox.ts:105, 119, 153`
✅ **"Investment Manager"** → `src/components/DepositChatSheet.tsx:298`, `src/components/Inbox/ChatHeader.tsx:9`, `src/components/Inbox/FinancialInboxSheet.tsx:761, 925, 933`
✅ **"BabyCDO"** → Multiple files (separate chat system)
✅ **"What would you like to do first?"** → `src/state/financialInbox.ts:105`, `src/components/Inbox/FinancialInboxSheet.tsx:32, 86`
✅ **"Got it – I'll help you with that"** → `src/components/Inbox/FinancialInboxSheet.tsx:469`

### Not Found:
- `DEFAULT_MESSAGES`
- `WELCOME_MESSAGE`
- `SYSTEM_PROMPT`
- `SEED_CHAT`

---

## 3️⃣ Conversation/Thread Model

### **Data Storage:**

1. **Threads:** Stored in Zustand store (`useFinancialInboxStore`)
   - **Location:** `src/state/financialInbox.ts`
   - **Type:** `Thread[]` in memory
   - **Not persisted to Firestore** (for portfolio manager thread)

2. **Messages:** Stored in Zustand store (`messagesByThreadId`)
   - **Location:** `src/state/financialInbox.ts` line 64
   - **Type:** `Record<ThreadId, ChatMessage[]>`
   - **Portfolio Manager messages:** In-memory only
   - **Transaction messages:** Synced from Firestore via `subscribeToTransactionMessages()`

### **Thread Types:**

```typescript
kind: 'portfolio_manager' | 'peer' | 'transaction'
```

- **`portfolio_manager`:** Ama chat (hard-coded, in-memory)
- **`peer`:** User-to-user chats (future)
- **`transaction`:** Bank deposit/withdrawal chats (Firestore-backed)

### **Data Flow:**

```
1. User opens Inbox
   ↓
2. openInbox() called (line 180)
   ↓
3. ensurePortfolioManagerThread() called (if needed)
   ↓
4. Thread added to threads array if missing
   ↓
5. Messages seeded from initialPMMessages if thread has no messages
   ↓
6. FinancialInboxSheet renders messages from messagesByThreadId[threadId]
   ↓
7. Messages displayed in chat view
```

### **"Ama — Investment Manager" vs "Ama — Stokvel Treasurer":**

- **Inbox thread title:** "Ama — Stokvel Treasurer" (line 119)
- **Chat header:** "Ama — Investment Manager" (line 761, 925, 933)
- **These are UI labels only** - not separate profiles/threads
- The same thread ID (`portfolio-manager`) is used for both

---

## 4️⃣ Onboarding Gate Status

### **Current State: NO USER ONBOARDING FLAG EXISTS**

**Findings:**
- ❌ No `onboardingStep` field in `UserDocument`
- ❌ No `isOnboarded` field in `UserDocument`
- ❌ No `kycStatus` field in `UserDocument`
- ❌ No user onboarding store (only `useAgentOnboardingStore` exists for agents)

**Agent Onboarding (Separate System):**
- **File:** `src/state/agentOnboarding.ts`
- **Field:** `hasCompletedAgentOnboarding: boolean`
- **Purpose:** Only for agent users, not regular users
- **Not applicable** to inbox default messages

### **Proposed Minimal New Field:**

Add to `UserDocument` interface (`src/lib/userDoc.ts`):

```typescript
onboardingStatus?: 'new' | 'started' | 'complete'
```

**Default value:** `'new'` for new users  
**Update to:** `'complete'` after first meaningful action (e.g., first deposit, first transaction, or explicit onboarding completion)

**Alternative (simpler):** Use `createdAt` timestamp + check if user has any transactions/wallets with activity.

---

## 5️⃣ Proposed Fix (Minimal + Safe)

### **Option A: Conditional Message Based on Onboarding Status (Recommended)**

**Files to edit:**
1. `src/lib/userDoc.ts` - Add `onboardingStatus` field
2. `src/state/financialInbox.ts` - Make initial messages conditional
3. `src/store/userProfile.ts` - Add `onboardingStatus` to profile store
4. `src/components/Inbox/FinancialInboxSheet.tsx` - Handle empty state

**Exact changes:**

#### 1. Add onboardingStatus to UserDocument

```typescript
// src/lib/userDoc.ts line 53
onboardingStatus?: 'new' | 'started' | 'complete'
```

#### 2. Initialize in ensureUserDocument

```typescript
// src/lib/userDoc.ts line 465
onboardingStatus: 'new',
```

#### 3. Update financialInbox.ts to conditionally seed messages

```typescript
// src/state/financialInbox.ts
// Replace lines 100-108 with:

const getInitialPMMessages = (onboardingStatus?: string): ChatMessage[] => {
  // Pre-onboarding: show empty or neutral message
  if (onboardingStatus === 'new' || !onboardingStatus) {
    return [] // Empty - show empty state instead
    // OR return neutral message:
    // return [{
    //   id: nanoid(),
    //   threadId: PORTFOLIO_MANAGER_THREAD_ID,
    //   from: 'ai',
    //   text: 'Welcome to GoBankless! Complete your setup to get started.',
    //   createdAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    // }]
  }
  
  // Onboarded: show existing welcome message
  return [{
    id: nanoid(),
    threadId: PORTFOLIO_MANAGER_THREAD_ID,
    from: 'ai',
    text: 'Hi, I\'m Ama, your Stokvel Treasurer 👋   I can help you make your first deposit, join a Stokvel, or start a new group with friends.   What would you like to do first?',
    createdAt: '14:09',
  }]
}

// Update ensurePortfolioManagerThread to accept onboardingStatus
ensurePortfolioManagerThread: (onboardingStatus?: string) => {
  // ... existing code ...
  if (!state.messagesByThreadId[PORTFOLIO_MANAGER_THREAD_ID]) {
    set((state) => ({
      messagesByThreadId: {
        ...state.messagesByThreadId,
        [PORTFOLIO_MANAGER_THREAD_ID]: getInitialPMMessages(onboardingStatus),
      },
    }))
  }
}
```

#### 4. Update openInbox to pass onboardingStatus

```typescript
// src/components/Inbox/FinancialInboxSheet.tsx
// In useEffect or when opening inbox:
const { profile } = useUserProfileStore()
const onboardingStatus = (profile as any).onboardingStatus || 'new'
store.ensurePortfolioManagerThread(onboardingStatus)
```

#### 5. Handle empty state in FinancialInboxSheet

```typescript
// src/components/Inbox/FinancialInboxSheet.tsx
// Around line 940-1000, add empty state check:

{activeMessages.length === 0 ? (
  <div className={chatStyles.emptyState}>
    <p>No messages yet</p>
    <button onClick={handleGetStarted}>Get Started</button>
  </div>
) : (
  activeMessages.map((message, index) => {
    // ... existing message rendering
  })
)}
```

---

### **Option B: Simpler - Remove Seeding Entirely (Fastest)**

**Files to edit:**
1. `src/state/financialInbox.ts` - Remove initial message seeding

**Exact changes:**

```typescript
// src/state/financialInbox.ts
// Change line 131 from:
messagesByThreadId: {
  [PORTFOLIO_MANAGER_THREAD_ID]: initialPMMessages,
},

// To:
messagesByThreadId: {},

// And update ensurePortfolioManagerThread (line 170-177):
// Remove the message seeding logic entirely
// OR only seed if user has completed onboarding
```

**Pros:**
- Fastest to implement
- No new fields needed
- Clean empty state

**Cons:**
- No welcome message for anyone (unless we add conditional logic later)

---

### **Option C: Use Existing Auth State (No New Fields)**

**Files to edit:**
1. `src/state/financialInbox.ts` - Check if user has any transactions

**Logic:**
- If user has transaction threads → onboarded → show welcome message
- If no transaction threads → new user → show empty state or neutral message

**Implementation:**
```typescript
// In ensurePortfolioManagerThread:
const hasTransactions = state.threads.some(t => t.kind === 'transaction')
if (!state.messagesByThreadId[PORTFOLIO_MANAGER_THREAD_ID]) {
  const messages = hasTransactions 
    ? initialPMMessages 
    : [] // Empty for new users
  // ... seed messages
}
```

**Pros:**
- No schema changes
- Uses existing data
- Simple logic

**Cons:**
- Less explicit than dedicated onboarding flag
- May not catch all onboarding scenarios

---

## 6️⃣ Verification Checklist

After implementing the fix, verify:

- [ ] **New account (no onboarding):**
  - [ ] Inbox opens without pre-seeded "Ama" message
  - [ ] Shows empty state OR neutral welcome message
  - [ ] No "Stokvel Treasurer" thread with hard-coded message

- [ ] **Existing accounts:**
  - [ ] Unaffected (still see existing messages)
  - [ ] No duplicate messages on refresh
  - [ ] Thread persists correctly

- [ ] **Onboarded users:**
  - [ ] See full "Ama — Stokvel Treasurer" welcome message
  - [ ] Can interact with chat normally

- [ ] **No phantom threads:**
  - [ ] Thread only created when needed
  - [ ] No duplicate threads on multiple opens
  - [ ] Thread ID remains consistent

- [ ] **Edge cases:**
  - [ ] User signs out and back in (state resets correctly)
  - [ ] Multiple inbox opens (no duplicate seeding)
  - [ ] Browser refresh (state persists or resets appropriately)

---

## 📋 Recommended Approach

**Recommendation: Option C (Use Existing Auth State)**

**Rationale:**
1. **No schema changes** - fastest to implement
2. **Uses existing data** - transaction threads indicate user activity
3. **Minimal risk** - doesn't require Firestore migrations
4. **Easy to enhance later** - can add explicit onboarding flag in Phase 2

**Implementation Plan:**
1. Modify `ensurePortfolioManagerThread()` to check for transaction threads
2. Only seed `initialPMMessages` if user has transaction activity
3. Add empty state UI in `FinancialInboxSheet` for new users
4. Test with new account and existing account

**Estimated effort:** 30-60 minutes  
**Risk level:** Low  
**Breaking changes:** None

---

## 🔗 Related Files

- `src/state/financialInbox.ts` - Main inbox state (MUST EDIT)
- `src/components/Inbox/FinancialInboxSheet.tsx` - Inbox UI component (MUST EDIT)
- `src/lib/userDoc.ts` - User document schema (OPTIONAL - for Option A)
- `src/store/userProfile.ts` - Profile store (OPTIONAL - for Option A)
- `src/components/Inbox/InboxList.tsx` - Inbox list view
- `src/app/profile/page.tsx` - Profile page (opens inbox)

---

**Investigation Date:** 2024-12-16  
**Status:** ✅ Complete - Ready for implementation




# Notification Avatar Assets Inventory

**Purpose**: Complete inventory of all avatar assets available for use in demo notifications, including photo avatars, generic profile avatars with initial overlays, and system avatars.

**Location**: `public/assets/` and `public/generated-avatars/`

---

## Avatar Categories

The notification system has **4 main avatar categories**:

1. **Photo Agent Avatars** - Realistic photo avatars for members/agents
2. **Generic Profile Avatars** - Base avatar with initial letter overlay
3. **System Avatars** - AI manager, GoBankless admin, and system icons
4. **Generated Initial Avatars** - Letter-ring avatars for map markers

---

## 1. Photo Agent Avatars

**Purpose**: Realistic photo avatars for demo members, agents, and community users in notifications.

**Location**: `public/assets/`

### Agent Avatars (8 available)

| Asset Path | Description | Current Usage |
|------------|-------------|---------------|
| `/assets/avatar_agent1.png` | Agent photo avatar #1 | Key city avatars (Beira, Mozambique) |
| `/assets/avatar_agent2.png` | Agent photo avatar #2 | Key city avatars (Harare, Zimbabwe), dev helpers |
| `/assets/avatar_agent3.png` | Agent photo avatar #3 | Key city avatars (Lusaka, Zambia) |
| `/assets/avatar_agent4.png` | Agent photo avatar #4 | Key city avatars (Windhoek, Namibia), map footer |
| `/assets/avatar_agent5.png` | Agent photo avatar #5 | **Default member avatar**, demo notifications, map markers, key cities |
| `/assets/avatar_agent6.png` | Agent photo avatar #6 | Demo notifications, key cities (Dar es Salaam), dev helpers |
| `/assets/avatar_agent7.png` | Agent photo avatar #7 | Dev helpers (Thabo), agent list sheets |
| `/assets/avatar_agent8.png` | Agent photo avatar #8 | Dev helpers (Sarah), agent list sheets |

**Note**: `avatar_agent5.png` is the **default fallback** for members when no specific avatar is provided (see `identityResolver.ts`).

### Profile Avatars (5 available)

| Asset Path | Description | Current Usage |
|------------|-------------|---------------|
| `/assets/avatar - profile (1).png` | Profile photo #1 | Financial inbox, cash agent flows, map sending |
| `/assets/avatar - profile (2).png` | Profile photo #2 | Financial inbox, cash agent flows, map sending |
| `/assets/avatar - profile (3).png` | Profile photo #3 | Search sheet ($ariel), payment details, profile data |
| `/assets/avatar - profile (4).png` | Profile photo #4 | Financial inbox, cash agent flows |
| `/assets/avatar - profile.png` | Generic profile avatar | Avatar component default base (with initial overlay) |

**Note**: `avatar - profile.png` is used as the **base image** for the initial letter overlay system (see Avatar component).

---

## 2. Generic Profile Avatar with Initial Overlay

**Purpose**: Fallback avatar system that displays a user's initial letter over a generic profile image when no photo is available.

**Base Asset**: `/assets/avatar-profile.png`

**How It Works**:
- The `Avatar` component (`src/components/Avatar.tsx`) uses this base image
- When `avatarUrl` is not provided, it displays `avatar-profile.png` as the background
- An initial letter is overlaid on top, extracted from:
  - User's name (first character)
  - Email address (first character of local part)
  - Fallback: 'S' if neither is available

**Initial Generation Logic**:
```typescript
function getInitial(name?: string, email?: string): string {
  const fromName = (name ?? '').trim()
  if (fromName) return fromName[0]!.toUpperCase()
  
  const local = (email ?? '').split('@')[0] ?? ''
  if (local) return local[0]!.toUpperCase()
  
  return 'S' // fallback
}
```

**Visual Styling**:
- Initial letter is centered
- Font size: 48% of avatar size (proportional scaling)
- Color: `rgba(245, 245, 245, 0.96)` (light gray/white)
- Text shadow: `0 1px 3px rgba(0, 0, 0, 0.35)` for readability
- Positioned absolutely over the base image

**Usage in Notifications**:
- When a notification actor doesn't have an explicit `avatar` property
- The notification system can use this fallback for any actor type
- Particularly useful for `member` actors where no photo is available

---

## 3. System Avatars

**Purpose**: Avatars for system-level actors (AI manager, GoBankless admin, system notifications).

### AI Manager Avatar

| Asset Path | Description | Current Usage |
|------------|-------------|---------------|
| `/assets/Brics-girl-blue.png` | AI portfolio manager avatar | **Default AI manager avatar**, search sheet ($ama), financial inbox, chat orchestration |

**Usage**: All `ai_manager` actor notifications use this avatar by default (see `identityResolver.ts`).

### GoBankless Admin/System Avatar

| Asset Path | Description | Current Usage |
|------------|-------------|---------------|
| `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png` | High-quality GoBankless logo (pink + white) | **Default system/co-op avatar**, notifications list fallback |

**Usage**: 
- `system` actor notifications
- `co_op` actor notifications (currently uses same as system)
- Fallback for `user` actor when no profile avatar exists

**Note**: This is described as "high-quality GoB admin avatar" in the codebase.

---

## 4. Generated Initial Avatars (Letter-Ring System)

**Purpose**: Pre-generated letter-ring avatars for map markers and demo users without photos.

**Location**: `public/generated-avatars/initials-ring/`

### Available Initial Letters

The system uses **13 initial letters** in rotation:
- `A`, `C`, `E`, `G`, `I`, `K`, `M`, `O`, `Q`, `S`, `U`, `W`, `Y`

**Asset Pattern**: `/generated-avatars/initials-ring/avatar-{LETTER}.png`

**Examples**:
- `/generated-avatars/initials-ring/avatar-A.png`
- `/generated-avatars/initials-ring/avatar-C.png`
- `/generated-avatars/initials-ring/avatar-M.png`
- etc.

**Current Usage**:
- Key city avatars (Gaborone, Kinshasa)
- Demo initial avatars for map markers (80 avatars generated with weighted city distribution)
- Used when no photo avatar is available for a location-based demo user

**Generation Logic**:
- Letters are assigned cyclically based on avatar index
- Each letter corresponds to a pre-generated PNG file
- Files should exist in `public/generated-avatars/initials-ring/` directory

---

## Avatar Resolution Priority (for Notifications)

When a notification is created, the avatar is resolved in this order:

1. **Explicit avatar** - If `actor.avatar` is provided, use it
2. **Identity-based defaults** - Based on `actor.type`:
   - `ai_manager` → `/assets/Brics-girl-blue.png`
   - `system` → `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png`
   - `co_op` → `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png`
   - `member` → `/assets/avatar_agent5.png` (fallback)
   - `user` → User's profile avatar or system default
3. **Fallback** → `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png`

**Source**: `src/lib/notifications/identityResolver.ts`

---

## Recommended Avatar Usage for Demo Notifications

### AI Manager Notifications
- **Use**: `/assets/Brics-girl-blue.png` (default, already set)
- **Actor**: `{ type: 'ai_manager' }`

### Member/Peer Notifications
- **Photo avatars** (preferred): Use any of `avatar_agent1.png` through `avatar_agent8.png`
- **Profile avatars**: Use `avatar - profile (1-4).png` for variety
- **Generic with initial**: Use `avatar-profile.png` + initial overlay (automatic via Avatar component)
- **Actor**: `{ type: 'member', avatar: '/assets/avatar_agent5.png', ... }`

### Cross-Border Payment Notifications
- **Use**: Photo avatars (`avatar_agent5.png`, `avatar_agent6.png`, etc.)
- **Include**: Map coordinates for visual context
- **Actor**: `{ type: 'member', avatar: '/assets/avatar_agent5.png', map: { lat, lng } }`

### System Notifications
- **Use**: `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png` (default)
- **Actor**: `{ type: 'system', name: 'GoBankless' }`

### User Action Notifications
- **Use**: User's profile avatar (if available) or system default
- **Actor**: `{ type: 'user' }` (avatar resolved from user profile)

---

## Avatar Asset Summary Table

| Category | Count | Asset Paths | Primary Use |
|----------|-------|-------------|-------------|
| **Agent Photos** | 8 | `/assets/avatar_agent1.png` - `avatar_agent8.png` | Member/agent notifications |
| **Profile Photos** | 5 | `/assets/avatar - profile*.png` | Member notifications, cash flows |
| **Generic Base** | 1 | `/assets/avatar-profile.png` | Initial overlay system |
| **AI Manager** | 1 | `/assets/Brics-girl-blue.png` | AI trade notifications |
| **System/Admin** | 1 | `/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png` | System notifications |
| **Initial Letters** | 13 | `/generated-avatars/initials-ring/avatar-{LETTER}.png` | Map markers, fallbacks |

**Total Available**: 29 unique avatar assets (8 agent + 5 profile + 1 generic + 1 AI + 1 system + 13 initials)

---

## Initial Letter Overlay System

### How It Works

1. **Base Image**: `/assets/avatar-profile.png` (generic profile silhouette)
2. **Overlay**: Initial letter extracted from name or email
3. **Styling**: 
   - Centered, proportional font size
   - Light gray/white color with shadow
   - Positioned absolutely over base image

### When to Use

- **Member notifications** without explicit avatar
- **User notifications** without profile photo
- **Fallback** for any actor type when no photo is available

### Implementation

The `Avatar` component automatically handles this:
- If `avatarUrl` is provided → use photo
- If `avatarUrl` is missing → use `avatar-profile.png` + initial overlay

**Code Reference**: `src/components/Avatar.tsx` lines 16-83

---

## Demo Notification Avatar Examples

### Example 1: AI Manager Notification
```typescript
{
  kind: 'ai_trade',
  title: 'AI reduced market risk',
  actor: { type: 'ai_manager' } // Uses /assets/Brics-girl-blue.png
}
```

### Example 2: Member Payment with Photo
```typescript
{
  kind: 'payment_received',
  title: 'Payment received',
  actor: {
    type: 'member',
    name: 'Naledi',
    handle: '@naledi',
    avatar: '/assets/avatar_agent5.png' // Explicit photo
  }
}
```

### Example 3: Member Payment without Photo (uses default)
```typescript
{
  kind: 'payment_received',
  title: 'Payment received',
  actor: {
    type: 'member',
    name: 'Thabo',
    handle: '@thabo'
    // No avatar → uses /assets/avatar_agent5.png (member default)
  }
}
```

### Example 4: System Notification
```typescript
{
  kind: 'payment_received',
  title: 'Cash deposit secured',
  actor: { type: 'system', name: 'GoBankless' } // Uses /assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png
}
```

### Example 5: Cross-Border with Map
```typescript
{
  kind: 'payment_received',
  title: 'Cross-border transfer received',
  actor: {
    type: 'member',
    avatar: '/assets/avatar_agent6.png',
    map: { lat: -25.9692, lng: 32.5732 } // Maputo
  }
}
```

---

## Best Practices for Demo Notifications

1. **Vary avatar usage**: Rotate through different agent avatars (1-8) for variety
2. **Use photo avatars for members**: Prefer `avatar_agent*.png` over generic for realism
3. **Include map coordinates**: For cross-border payments, include `map` property with coordinates
4. **Set explicit avatars**: Always provide `avatar` property in actor for demo notifications
5. **Use system avatar for infrastructure**: Use system avatar for deposits, refunds, errors
6. **AI manager consistency**: Always use `Brics-girl-blue.png` for AI notifications

---

## Asset File Verification

To verify all assets exist, check:
- `public/assets/avatar_agent*.png` (8 files)
- `public/assets/avatar - profile*.png` (5 files)
- `public/assets/avatar-profile.png` (1 file)
- `public/assets/Brics-girl-blue.png` (1 file)
- `public/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png` (1 file)
- `public/generated-avatars/initials-ring/avatar-{LETTER}.png` (13 files for A, C, E, G, I, K, M, O, Q, S, U, W, Y)

---

## Summary

The GoBankless notification system has **29 unique avatar assets** available:

- **8 Agent Photo Avatars** - For realistic member/agent notifications
- **5 Profile Photo Avatars** - For variety in member notifications
- **1 Generic Profile Base** - For initial letter overlay system
- **1 AI Manager Avatar** - For AI trade notifications
- **1 System/Admin Avatar** - For system-level notifications
- **13 Initial Letter Avatars** - For map markers and fallbacks

The system automatically resolves avatars based on actor type, with explicit avatars taking priority. The initial letter overlay system provides a fallback when no photo is available, ensuring all notifications have a visual identity.


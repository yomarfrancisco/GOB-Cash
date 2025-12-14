# Directory Rendering Diagnosis Report

## A) Component Map

### Surface 1: Pre-auth Search (Signed Out)

**Entry Point:**
- Route: `/` (home page)
- Component: `src/app/page.tsx` → `BottomGlassBar` → Search icon button
- Opens: `SearchSheet` component via `useSearchSheet()` store

**Component:** `src/components/SearchSheet.tsx`

**Hook Chain:**
1. `usePublicDirectoryContactsForUI()` - Reads from `/directory` collection
2. Returns `RankedContact[]` with `source: 'gobankless-contact'`

**Data Source:**
- Firestore collection: `/directory`
- Document type: `DirectoryDoc`
- Fields available: `handle`, `displayName`, `phoneCountry` (ISO2), `isAgent`, `ownerUserId`, `trustGlobal`, `ghostQuality`
- **NO email or phoneNumber fields in DirectoryDoc**

**Subtitle Builder:**
- Function: `buildContactSubtitle()` in `src/lib/contacts/contactDescription.ts`
- Called via: `getContactTags()` → `tagsToMeta()` → `buildContactSubtitle()`
- Location in code: `SearchSheet.tsx:276`
- Auth context: `isAuthenticated: false`

**Fields Available in Runtime Object:**
```typescript
{
  id: "directory:$handle",
  name: string, // from displayName or handle
  email: undefined, // Always undefined pre-auth
  phone: string | undefined, // Inferred from phoneCountry (e.g., "+27" for ZA)
  photoUrl: undefined,
  source: "gobankless-contact",
  qualityScore: number,
  handle: string,
  subtitle: "", // Computed at render time
  metadata: {
    isAgent: boolean,
    phoneCountry: string | null, // ISO2 code
    ownerUserId: string | null
  }
}
```

**Notes:**
- Phone is inferred from `phoneCountry` (just prefix like "+27")
- Email is always `undefined`
- Subtitle computed at render time using `getContactTags()` with `phoneCountry` from metadata
- Falls back to "Cash corridor contact" if no region/corridor detected

---

### Surface 2: Post-auth Search (Signed In)

**Entry Point:**
- Same as pre-auth: `BottomGlassBar` → Search icon → `SearchSheet`

**Component:** `src/components/SearchSheet.tsx` (same component, different data path)

**Hook Chain:**
1. `usePublicDirectoryContactsForUI()` - Reads from `/directory` collection
2. `useEnrichedDirectoryContacts(publicDirectoryContacts)` - Fetches email/phone from `/users/{ownerUserId}` when signed in
3. Returns enriched `RankedContact[]`

**Data Source:**
- Primary: `/directory` collection (same as pre-auth)
- Secondary: `/users/{ownerUserId}` collection (fetched for contacts with `ownerUserId`)
- User document fields: `email`, `phoneNumber` (or `phoneE164`)

**Subtitle Builder:**
- Same as pre-auth: `buildContactSubtitle()` via `getContactTags()` → `tagsToMeta()`
- Location: `SearchSheet.tsx:276`
- Auth context: `isAuthenticated: true`

**Fields Available in Runtime Object:**
```typescript
{
  // Same as pre-auth, but enriched:
  email: string | undefined, // From /users/{ownerUserId}.email (if ownerUserId exists)
  phone: string | undefined, // From /users/{ownerUserId}.phoneNumber (if ownerUserId exists)
  // ... rest same as pre-auth
}
```

**Additional Rendering:**
- Location: `SearchSheet.tsx:278-307`
- Shows email/phone as second line subtitle when:
  - `isAuthed === true`
  - `contact.source === 'gobankless-contact'`
  - `contact.email || contact.phone` exists

**Notes:**
- Uses same directory data as pre-auth
- Enrichment happens in `useEnrichedDirectoryContacts` hook
- Only enriches contacts with `ownerUserId` in metadata
- Email/phone shown as second subtitle line (smaller font, opacity 0.7)

---

### Surface 3: Payment Details Sheet Directory List

**Entry Point:**
- Route: `/` (home page)
- Component: `src/app/page.tsx` → `BottomGlassBar` → "$" button → Amount entry → `PaymentDetailsSheet`

**Component:** `src/components/PaymentDetailsSheet.tsx`

**Hook Chain:**
1. `useUserContactsForUI(rankedContacts)` - Reads from `/users/{uid}/contacts` collection
2. Falls back to `rankedContacts` (from Zustand store) if Firestore empty
3. Returns `RankedContact[]` with `source: 'device'` or other

**Data Source:**
- Primary: `/users/{uid}/contacts` collection (user's personal contacts)
- Document type: `ContactDoc`
- Fields available: `contactId`, `displayName`, `handle`, `primaryEmail`, `primaryPhone`, `source`
- **HAS email and phoneNumber fields**

**Subtitle Builder:**
- Component: `ContactListWithIndex` → `ContactRow` component
- Function: `buildContactSubtitle()` via `getContactTags()` → `tagsToMeta()`
- Location: `src/components/contacts/ContactListWithIndex.tsx:42-53`
- Auth context: `isAuthenticated: isAuthed` (passed as prop)

**Fields Available in Runtime Object:**
```typescript
{
  id: string, // from contactId
  name: string, // from displayName or email/phone
  email: string | undefined, // from primaryEmail
  phone: string | undefined, // from primaryPhone
  photoUrl: undefined,
  source: "device" | "connections" | "otherContacts" | etc.,
  qualityScore: 0,
  handle: string,
  subtitle: string, // Pre-computed in useUserContactsForUI: "phone · email" or just one
  metadata: undefined // No metadata field
}
```

**Additional Rendering:**
- Location: `ContactListWithIndex.tsx:55-83`
- Shows email/phone as second line when:
  - `isAuthenticated === true`
  - `contact.source === 'gobankless-contact'`
  - `contact.email || contact.phone` exists
- **BUT**: Payment contacts have `source: 'device'`, not `'gobankless-contact'`, so this condition never matches!

**Notes:**
- Uses **different data source** than Search: `/users/{uid}/contacts` vs `/directory`
- Contacts have `source: 'device'` (from user's personal contacts), not `'gobankless-contact'`
- Subtitle is pre-computed in `useUserContactsForUI` as "phone · email" format
- `ContactListWithIndex` tries to show email/phone for directory contacts, but Payment contacts aren't directory contacts
- The "richer metadata" (SADC user, International user) comes from `getContactTags()` working with actual phone numbers from user contacts

---

## B) Field Inventory

### Pre-auth Search
- ✅ `email`: Always `undefined`
- ✅ `phone`: Inferred prefix from `phoneCountry` (e.g., "+27")
- ✅ `phoneCountry`: ISO2 code in `metadata.phoneCountry`
- ✅ `metadata`: `{ isAgent, phoneCountry, ownerUserId }`
- ✅ `tags`: Computed via `getContactTags()` using `phoneCountry`
- ✅ `isAgent`: In `metadata.isAgent`
- ✅ `corridor/region`: Inferred from `phoneCountry` via `getContactTags()`

### Post-auth Search
- ✅ `email`: From `/users/{ownerUserId}.email` (if `ownerUserId` exists)
- ✅ `phone`: From `/users/{ownerUserId}.phoneNumber` (if `ownerUserId` exists)
- ✅ `phoneCountry`: ISO2 code in `metadata.phoneCountry`
- ✅ `metadata`: `{ isAgent, phoneCountry, ownerUserId }`
- ✅ `tags`: Computed via `getContactTags()` using `phoneCountry` (preferred) or `phone`
- ✅ `isAgent`: In `metadata.isAgent`
- ✅ `corridor/region`: Inferred from `phoneCountry` or `phone` via `getContactTags()`

### Payment Details Sheet
- ✅ `email`: From `ContactDoc.primaryEmail`
- ✅ `phone`: From `ContactDoc.primaryPhone` (full phone number, not prefix)
- ❌ `phoneCountry`: Not available (no metadata field)
- ❌ `metadata`: Not present (undefined)
- ✅ `tags`: Computed via `getContactTags()` using `phone` (full number)
- ❌ `isAgent`: Not available (no metadata)
- ✅ `corridor/region`: Inferred from full `phone` number via `getContactTags()`

---

## C) What I Changed Previously

### Change 1: Updated `getContactTags()` to prefer `phoneCountry`

**File:** `src/lib/contacts/contactTags.ts`

**Code Change:**
```typescript
// BEFORE:
export const getContactTags = (contact: RankedContactMinimal): ContactTags => {
  const region = getRegionFromPhone(contact.phoneNumber)
  // ...
}

// AFTER:
export const getContactTags = (contact: RankedContactMinimal): ContactTags => {
  // Prefer phoneCountry (ISO2) over phoneNumber for region inference
  const region = contact.phoneCountry 
    ? getRegionFromCountryCode(contact.phoneCountry)
    : getRegionFromPhone(contact.phoneNumber)
  // ...
}
```

**Where Called:**
- `SearchSheet.tsx:249` - For Search sheet contacts
- `ContactListWithIndex.tsx:42` - For Payment Details contacts
- `usePublicDirectoryContacts.ts:144` - For logging pre-auth subtitles
- `rankContacts.ts:335` - For ranking local contacts

**Surfaces Affected:**
- ✅ Pre-auth Search (directory contacts with `phoneCountry`)
- ✅ Post-auth Search (directory contacts with `phoneCountry`)
- ✅ Payment Details (user contacts with full phone numbers, falls back to `getRegionFromPhone`)

**Surfaces NOT Affected:**
- None - this is a shared utility function

---

### Change 2: Updated `SearchSheet.tsx` to pass `phoneCountry`

**File:** `src/components/SearchSheet.tsx`

**Code Change:**
```typescript
// Line 247-258
const tags = getContactTags({
  handle: contact.handle,
  name: contact.name,
  phoneNumber: contact.phone,
  email: contact.email,
  sourceType: contact.source === 'connections' || contact.source === 'otherContacts' ? 'google_contact' : contact.source || null,
  // NEW: Pass phoneCountry from metadata
  phoneCountry: (contact.metadata as any)?.phoneCountry || null,
})
```

**Where Called:**
- `SearchSheet.tsx:247` - In `renderContactRow()` function

**Surfaces Affected:**
- ✅ Pre-auth Search
- ✅ Post-auth Search

**Surfaces NOT Affected:**
- ❌ Payment Details Sheet (uses `ContactListWithIndex` component)

---

### Change 3: Updated `ContactListWithIndex.tsx` to pass `phoneCountry`

**File:** `src/components/contacts/ContactListWithIndex.tsx`

**Code Change:**
```typescript
// Line 42-50
const tags = getContactTags({
  handle: contact.handle,
  name: contact.name,
  phoneNumber: contact.phone,
  email: contact.email,
  sourceType: contact.source === 'connections' || contact.source === 'otherContacts' ? 'google_contact' : contact.source || null,
  // NEW: Pass phoneCountry from metadata
  phoneCountry: (contact.metadata as any)?.phoneCountry || null,
})
```

**Where Called:**
- `ContactListWithIndex.tsx:42` - In `ContactRow` component

**Surfaces Affected:**
- ✅ Payment Details Sheet (uses this component)

**Surfaces NOT Affected:**
- ❌ Search Sheet (uses inline `renderContactRow()`)

---

### Change 4: Added email/phone display for signed-in users

**Files:**
- `src/components/SearchSheet.tsx:278-307`
- `src/components/contacts/ContactListWithIndex.tsx:55-83`

**Code Change:**
```typescript
// SearchSheet.tsx
const showContactDetails = isAuthed && contact.source === 'gobankless-contact' && (contact.email || contact.phone)
// ... renders second subtitle line with email/phone

// ContactListWithIndex.tsx
const showContactDetails = isAuthenticated && contact.source === 'gobankless-contact' && (contact.email || contact.phone)
// ... renders second subtitle line with email/phone
```

**Where Called:**
- `SearchSheet.tsx:278` - In `renderContactRow()` for Search
- `ContactListWithIndex.tsx:55` - In `ContactRow` for Payment Details

**Surfaces Affected:**
- ✅ Post-auth Search (directory contacts with `ownerUserId`)
- ⚠️ Payment Details (condition never matches because contacts have `source: 'device'`, not `'gobankless-contact'`)

**Surfaces NOT Affected:**
- ✅ Pre-auth Search (condition requires `isAuthed === true`)

---

### Change 5: Created `useEnrichedDirectoryContacts` hook

**File:** `src/hooks/useEnrichedDirectoryContacts.ts` (new file)

**Purpose:** Fetches email/phone from `/users/{ownerUserId}` for directory contacts when signed in

**Where Used:**
- `SearchSheet.tsx:80` - Enriches directory contacts for post-auth Search

**Surfaces Affected:**
- ✅ Post-auth Search only

**Surfaces NOT Affected:**
- ❌ Pre-auth Search (hook returns unenriched contacts when not signed in)
- ❌ Payment Details (uses different hook: `useUserContactsForUI`)

---

## D) Explain the Discrepancy

### Why Payment Details shows richer metadata than Search

**Root Cause:** Payment Details and Search use **completely different data sources**:

1. **Payment Details Sheet:**
   - Data source: `/users/{uid}/contacts` (user's personal contacts)
   - Contacts have full phone numbers (`primaryPhone` from ContactDoc)
   - `getContactTags()` receives full phone numbers (e.g., "+27123456789")
   - `getRegionFromPhone()` can accurately infer region from full number
   - Results in rich subtitles: "SADC cash corridor • South Africa • GMT+2"

2. **Search Sheet (both pre and post-auth):**
   - Data source: `/directory` collection (public directory)
   - Contacts have inferred phone prefixes (e.g., "+27" from `phoneCountry: "ZA"`)
   - `getContactTags()` receives `phoneCountry` (preferred) or prefix
   - Region inference works, but subtitles may be less specific
   - **However**, the real issue is that many directory contacts may not have `phoneCountry` set, causing fallback to generic "Cash corridor contact"

**Additional Factors:**

1. **Different subtitle computation:**
   - Payment: Uses `ContactListWithIndex` → `ContactRow` → `buildContactSubtitle()`
   - Search: Uses inline `renderContactRow()` → `buildContactSubtitle()`
   - Both use same function, but different data inputs

2. **Metadata availability:**
   - Payment contacts: No `metadata` field, but have full phone numbers
   - Directory contacts: Have `metadata.phoneCountry` but may be missing for many entries

3. **Source field mismatch:**
   - Payment contacts: `source: 'device'` (from user's contacts)
   - Directory contacts: `source: 'gobankless-contact'`
   - The email/phone display logic checks `source === 'gobankless-contact'`, so Payment contacts never show email/phone even though they have it

4. **Pre-computed vs runtime subtitles:**
   - Payment: Subtitle pre-computed in `useUserContactsForUI` as "phone · email"
   - Search: Subtitle computed at render time using `buildContactSubtitle()`

---

## E) Gap-Closing Approach (No Code)

### Problem Summary

1. **Data Source Fragmentation:**
   - Search uses `/directory` collection
   - Payment uses `/users/{uid}/contacts` collection
   - Different data shapes, different field availability

2. **Subtitle Logic Duplication:**
   - Search has inline `renderContactRow()` with subtitle logic
   - Payment uses `ContactListWithIndex` → `ContactRow` with similar but separate subtitle logic
   - Both call same `buildContactSubtitle()` but with different inputs

3. **Field Availability Mismatch:**
   - Directory contacts: Have `phoneCountry` but may lack email/phone
   - User contacts: Have email/phone but lack `phoneCountry` and `metadata`

4. **Conditional Rendering Issues:**
   - Email/phone display checks `source === 'gobankless-contact'`
   - Payment contacts have `source: 'device'`, so condition never matches
   - Even though Payment contacts have email/phone, they don't show it

### Proposed Solution

#### 1. Unified Contact Display Model

Create a single `ContactDisplayModel` type that normalizes both data sources:

```typescript
type ContactDisplayModel = {
  id: string
  handle: string
  name: string
  email?: string
  phone?: string
  phoneCountry?: string // ISO2
  isAgent: boolean
  source: 'directory' | 'user-contact' | 'device' | ...
  // ... other fields
}
```

#### 2. Shared Directory Row Component

Create `DirectoryContactRow` component that:
- Accepts `ContactDisplayModel`
- Handles all subtitle computation internally
- Shows email/phone based on auth state (not source field)
- Used by both Search and Payment Details

#### 3. Unified Data Mapping Layer

Create mapping functions:
- `mapDirectoryDocToDisplayModel(doc: DirectoryDoc, enriched?: { email?, phone? }): ContactDisplayModel`
- `mapContactDocToDisplayModel(doc: ContactDoc): ContactDisplayModel`
- Normalizes both sources to same shape

#### 4. Auth-Aware Field Projection

Instead of checking `source === 'gobankless-contact'`, check:
- `isAuthenticated && (contact.email || contact.phone)`
- This works for both directory and user contacts

#### 5. Single Subtitle Builder Path

Ensure both surfaces use:
- Same `getContactTags()` call (already done)
- Same `buildContactSubtitle()` call (already done)
- Same field availability (needs normalization)

### Implementation Steps (Conceptual)

1. **Create `ContactDisplayModel` type** - Normalized contact shape
2. **Create mapping functions** - Convert DirectoryDoc and ContactDoc to DisplayModel
3. **Create `DirectoryContactRow` component** - Shared renderer
4. **Update SearchSheet** - Use `DirectoryContactRow` instead of inline render
5. **Update ContactListWithIndex** - Use `DirectoryContactRow` instead of `ContactRow`
6. **Update email/phone display logic** - Check auth + field availability, not source
7. **Ensure directory contacts have phoneCountry** - May need backend update or better inference

### Files to Modify

1. `src/types/contacts.ts` - Add `ContactDisplayModel` type
2. `src/lib/contacts/contactMapping.ts` - New file with mapping functions
3. `src/components/contacts/DirectoryContactRow.tsx` - New shared component
4. `src/components/SearchSheet.tsx` - Replace inline render with `DirectoryContactRow`
5. `src/components/contacts/ContactListWithIndex.tsx` - Replace `ContactRow` with `DirectoryContactRow`
6. `src/hooks/usePublicDirectoryContacts.ts` - Return normalized `ContactDisplayModel`
7. `src/hooks/useUserContactsForUI.ts` - Return normalized `ContactDisplayModel`

---

## Summary

**Current State:**
- Search (pre/post-auth): Uses `/directory`, shows descriptive subtitles, email/phone only for directory contacts with `ownerUserId` when signed in
- Payment Details: Uses `/users/{uid}/contacts`, shows "phone · email" subtitle, but email/phone display logic doesn't work because source check fails

**Key Discrepancy:**
- Payment shows richer metadata because it has full phone numbers from user contacts
- Search may show generic subtitles because many directory entries lack `phoneCountry`
- Email/phone display works in Search but not Payment due to source field mismatch

**Solution:**
- Unify data models and rendering components
- Use auth state + field availability for email/phone display, not source field
- Ensure consistent subtitle computation across all surfaces





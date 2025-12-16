# Profile Metrics Leakage Investigation Report

## 🔍 Problem Summary

A brand-new user account (no transactions, no ratings, no social graph) is displaying non-zero profile metrics:
- ⭐ **4.8 rating** (with 11.5K count)
- 👥 **8,122 backers**
- 🔁 **556 backing**

These values should default to **zero / null / empty state** for a new account.

---

## ✅ Root Causes Identified

### **1. Hard-Coded Values in Own Profile Page** ⚠️ PRIMARY ISSUE

**File:** `src/app/profile/page.tsx`  
**Lines:** 268-284

The `/profile` page (user's own profile) displays **hard-coded placeholder values** instead of fetching from Firestore or using profile store data.

```typescript
// Lines 268-284 - HARD-CODED VALUES
<div className="stats-row">
  <div className="stat">
    <div className="stat-top">
      <span className="stat-value">4.8</span>  // ❌ HARD-CODED
      <Image src="/assets/profile/star.svg" alt="" width={12} height={12} />
    </div>
    <div className="stat-sub">(11.5K)</div>  // ❌ HARD-CODED
  </div>
  <div className="stat-divider" />
  <div className="stat">
    <div className="stat-value">8,122</div>  // ❌ HARD-CODED
    <div className="stat-sub">Backers</div>
  </div>
  <div className="stat-divider" />
  <div className="stat">
    <div className="stat-value">556</div>  // ❌ HARD-CODED
    <div className="stat-sub">Backing</div>
  </div>
</div>
```

**Evidence:**
- The component uses `useUserProfileStore()` to get profile data (line 70)
- Profile data is used for name, email, avatar, handle (lines 251-260)
- **BUT** the metrics section completely ignores profile data and uses hard-coded values

---

### **2. Hard-Coded Values in ProfileEditSheet** ⚠️ SECONDARY ISSUE

**File:** `src/components/ProfileEditSheet.tsx`  
**Lines:** 681-684

The profile preview in the edit sheet also uses hard-coded values:

```typescript
<ProfilePreview
  // ... other props from profile store ...
  rating={4.8}           // ❌ HARD-CODED
  ratingCount="11.5K"    // ❌ HARD-CODED
  sponsors={8122}        // ❌ HARD-CODED
  sponsoring={556}       // ❌ HARD-CODED
  socialCredit={22.4}    // ❌ HARD-CODED
  verified={false}
/>
```

---

### **3. Demo/Stub Profile Data (NOT the issue for own profile)**

**File:** `src/lib/demo/profileData.ts`

Contains demo profiles with these exact values:
- `STUB_PROFILES['ama']`: rating: 4.8, sponsors: 8122, sponsoring: 556
- `STUB_PROFILES['ariel']`: rating: 4.8, sponsors: 8122, sponsoring: 556
- `STUB_PROFILES['samakoyo']`: rating: 4.8, sponsors: 8122, sponsoring: 556

**However:** This is used for viewing **OTHER users' profiles** (`/profile/[handle]`), not the current user's own profile (`/profile`).

**Evidence:**
- `getProfileByHandle()` returns stub data for unknown handles (lines 78-91)
- But it returns `sponsors: 0, sponsoring: 0` for unknown handles (lines 88-89)
- The own profile page (`/profile`) doesn't use `getProfileByHandle()` - it uses hard-coded values directly

---

### **4. Profile Store Missing Metrics Fields**

**File:** `src/store/userProfile.ts`  
**Interface:** `UserProfile` (lines 38-61)

The `UserProfile` interface does **NOT** include:
- `rating`
- `ratingCount`
- `sponsors` (backers)
- `sponsoring` (backing)
- `socialCredit`

**Current fields:**
- `fullName`, `userHandle`, `avatarUrl`, `backdropUrl`
- `email`, `instagramUrl`, `linkedinUrl`, `whatsappUrl`
- `description`, `socialGraphShareContacts`
- Address fields, linked cards/banks/wallets

**Impact:** Even if we wanted to fetch metrics from Firestore, there's no place to store them in the profile store.

---

### **5. No Firestore Query for Metrics**

**Investigation Results:**

1. **User Document Subscription** (`src/lib/userDoc.ts`):
   - `subscribeToCurrentUserDoc()` only syncs basic profile fields (fullName, email, avatarUrl, handle)
   - No metrics fields are fetched or synced

2. **Firestore Schema:**
   - No evidence of `rating`, `sponsors`, `sponsoring` fields in user documents
   - No separate collections for ratings or social graph metrics

3. **No Aggregation Logic:**
   - No code that counts backers from social graph
   - No code that calculates rating from transactions/reviews
   - No code that counts who the user is backing

---

## 📊 Data Flow Analysis

### Current Flow (Own Profile - `/profile`):

```
1. User logs in
   ↓
2. FirebaseAuthListener calls ensureUserDocument()
   ↓
3. subscribeToCurrentUserDoc() syncs basic profile to store
   ↓
4. ProfilePage component renders
   ↓
5. Uses profile from useUserProfileStore() for name/avatar/handle
   ↓
6. ❌ IGNORES profile store for metrics
   ↓
7. Displays hard-coded: 4.8, 8,122, 556
```

### Expected Flow (Should be):

```
1. User logs in
   ↓
2. Fetch user document from Firestore
   ↓
3. Fetch/calculate metrics:
   - rating: from ratings collection (aggregate)
   - sponsors: count from social graph (backers)
   - sponsoring: count from social graph (who user backs)
   ↓
4. Store in profile store OR component state
   ↓
5. Display real values (or 0 for new users)
```

---

## 🔎 Verification Checklist Results

### ✅ 1. Data Source Identified

**Source:** Hard-coded values in UI components
- `src/app/profile/page.tsx` lines 270, 277, 282
- `src/components/ProfileEditSheet.tsx` lines 681-684

**NOT from:**
- ❌ API response (no API calls found)
- ❌ Firestore (no queries found)
- ❌ Client-side mock/seed (demo data exists but not used for own profile)
- ❌ Cached global store (profile store doesn't have these fields)

### ✅ 2. User ID Scoping

**Issue:** Metrics are not scoped to user ID at all - they're hard-coded constants.

**Evidence:**
- Same values (4.8, 8,122, 556) appear for ALL users
- No user_id/uid used in metrics display
- No queries filtered by user

### ✅ 3. Fallback/Placeholder Logic Found

**Location:** `src/lib/demo/profileData.ts`

**Behavior:**
- `getProfileByHandle()` returns default profile for unknown handles
- Default includes `rating: 4.5, ratingCount: '1.2K'` (line 86)
- But `sponsors: 0, sponsoring: 0` (lines 88-89) - correctly zero
- **However:** This is only used for viewing OTHER users' profiles, not own profile

### ✅ 4. Environment-Based Behavior

**Check:** No environment flags found
- No `NEXT_PUBLIC_ENV === "demo"` checks
- No feature flags for demo mode
- Hard-coded values appear in production code

### ✅ 5. Database Initialization

**Check:** User document creation (`src/lib/userDoc.ts`)

**Findings:**
- `ensureUserDocument()` creates user doc with basic fields only
- No metrics fields initialized
- No default values for rating/sponsors/sponsoring

### ✅ 6. Cache Investigation

**Check:** No cache issues found
- No SWR/React Query usage for profile metrics
- No localStorage/IndexedDB caching
- Hard-coded values are rendered directly, not from cache

---

## 🎯 Conclusion

### Primary Issue:
**Hard-coded placeholder values in `/profile` page** - The metrics section displays static values (4.8, 8,122, 556) instead of:
1. Fetching real data from Firestore
2. Showing zeros for new users
3. Using profile store data

### Secondary Issue:
**Profile store missing metrics fields** - Even if we wanted to fetch metrics, there's no place to store them in the current `UserProfile` interface.

### Not an Issue:
- Demo profile data (`profileData.ts`) is correctly used only for viewing other users' profiles
- No cache contamination
- No environment-based demo mode

---

## 📝 Recommended Fix Strategy

1. **Add metrics fields to UserProfile interface:**
   ```typescript
   rating?: number
   ratingCount?: number
   sponsors?: number  // backers
   sponsoring?: number  // backing
   socialCredit?: number
   ```

2. **Update `/profile` page to use profile store:**
   ```typescript
   // Instead of hard-coded values:
   {profile.rating !== undefined ? (
     <span className="stat-value">{profile.rating.toFixed(1)}</span>
   ) : null}
   <div className="stat-value">{profile.sponsors?.toLocaleString() || '0'}</div>
   <div className="stat-value">{profile.sponsoring?.toLocaleString() || '0'}</div>
   ```

3. **Initialize metrics to 0 in Firestore:**
   - When creating new user document, set default values to 0
   - Or fetch/calculate from actual data sources (ratings collection, social graph)

4. **Update ProfileEditSheet:**
   - Use profile store values instead of hard-coded props

---

## 🔗 Related Files

- `src/app/profile/page.tsx` - Own profile page (HARD-CODED VALUES)
- `src/components/ProfileEditSheet.tsx` - Edit sheet preview (HARD-CODED VALUES)
- `src/lib/demo/profileData.ts` - Demo profiles (NOT used for own profile)
- `src/store/userProfile.ts` - Profile store (MISSING METRICS FIELDS)
- `src/lib/userDoc.ts` - User document sync (NO METRICS SYNC)

---

**Investigation Date:** 2024-12-16  
**Status:** ✅ Root cause identified - Ready for fix


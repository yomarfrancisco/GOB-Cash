# Phone Sign-Up Flow: Diagnosis & Firebase Integration Plan

## Executive Summary

This document describes the current phone sign-up flow, compares it to Google sign-up, identifies gaps, and proposes a Firebase integration solution to achieve equivalence (excluding social contacts).

---

## Part 1: Current Phone Sign-Up Flow (Step-by-Step)

### Flow Diagram

```
1. User lands on app (not authenticated)
   ↓
2. User triggers auth (e.g., clicks dollar button, profile icon)
   ↓
3. AuthEntrySheet opens (signup mode by default)
   ↓
4. User clicks "Sign up with phone number" button
   ↓
5. Button transforms into phone input field
   ↓
6. User enters phone number (e.g., "+27123456789")
   ↓
7. User submits phone number (Enter key or submit button)
   ↓
8. handlePhoneSubmit() calls openPhoneSignup()
   ↓
9. PhoneSignupSheet opens
   ↓
10. User enters password
    ↓
11. User submits password
    ↓
12. handleSubmit() executes:
    - Sets isSubmitting = true
    - Logs: "Sign up with phone: { password }"
    - Shows success notification ($ama welcome message)
    - Closes all auth sheets after 500ms
    ❌ USER IS NOT ACTUALLY AUTHENTICATED
    ❌ NO FIREBASE AUTH CALL
    ❌ NO USER DOCUMENT CREATED
    ❌ NO WALLETS SEEDED
```

### Current Implementation Details

#### Step 1-3: Auth Entry Sheet (`AuthEntrySheet.tsx`)

**Location**: `src/components/AuthEntrySheet.tsx`

**State Management**:
- `phoneNumber`: Local state for phone input
- `isPhoneSignupEditing`: Boolean to toggle between button and input
- `authMode`: 'signup' or 'loginEntry'

**Key Functions**:
```typescript
handlePhoneButtonClick() {
  // Transforms button into input field
  setIsPhoneSignupEditing(true)
  // Focuses input after render
}

handlePhoneSubmit(e) {
  // Validates phone number is not empty
  // Calls handlePhoneSignUpClick()
}

handlePhoneSignUpClick() {
  // Opens PhoneSignupSheet
  openPhoneSignup()
}
```

**Phone Number Capture**:
- Phone number is captured in local state (`phoneNumber`)
- **NOT stored in auth store**
- **NOT passed to PhoneSignupSheet**
- **LOST when component unmounts**

#### Step 9-12: Phone Sign-Up Sheet (`PhoneSignupSheet.tsx`)

**Location**: `src/components/PhoneSignupSheet.tsx`

**State Management**:
- `password`: Local state for password input
- `isSubmitting`: Loading state

**Key Functions**:
```typescript
handleSubmit(e) {
  // Current implementation:
  setIsSubmitting(true)
  console.log('Sign up with phone:', { password })
  // TODO: wire real sign-up later
  
  // Shows notification
  pushNotification({ ... })
  
  // Closes auth sheets (but user is NOT authenticated)
  setTimeout(() => {
    closeAllAuth()
    setIsSubmitting(false)
  }, 500)
}
```

**Critical Gaps**:
1. ❌ Phone number is NOT available in PhoneSignupSheet
2. ❌ No Firebase phone authentication
3. ❌ No user document creation
4. ❌ No wallet seeding
5. ❌ User is not actually authenticated
6. ❌ Password is collected but not used

---

## Part 2: Google Sign-Up Flow (For Comparison)

### Flow Diagram

```
1. User lands on app (not authenticated)
   ↓
2. User triggers auth
   ↓
3. AuthEntrySheet opens
   ↓
4. User clicks "Sign up with Google" button
   ↓
5. handleGoogleClick() calls signInWithGoogle()
   ↓
6. Firebase signInWithPopup() or signInWithRedirect()
   ↓
7. Google OAuth popup/redirect
   ↓
8. User authenticates with Google
   ↓
9. Firebase Auth state changes
   ↓
10. FirebaseAuthListener detects auth state change
    ↓
11. onAuthStateChanged callback fires
    ↓
12. setAuthState(true) updates Zustand store
    ↓
13. ensureUserDocument(user) is called:
    - Creates /users/{uid} document in Firestore
    - Sets email, displayName, photoURL from Google
    - Generates unique handle
    - Sets verificationStatus: 'email-verified'
    - Sets socialGraphShareContacts: true
    ↓
14. ensureDefaultWallets(user) is called:
    - Seeds 6 default wallets (cashZAR, cashMZN, cashZWD, btc, eth, earnings)
    ↓
15. Profile store is synced from user document
    ↓
16. Wallet store subscribes to wallet snapshots
    ↓
17. Auth sheets close automatically
    ↓
18. User is fully authenticated and ready
```

### Key Implementation Files

1. **`src/hooks/useFirebaseAuth.ts`**:
   - `signInWithGoogle()`: Initiates Firebase Google auth
   - Handles popup/redirect fallback
   - Shows success/error notifications

2. **`src/components/FirebaseAuthListener.tsx`**:
   - Listens to `onAuthStateChanged`
   - Calls `ensureUserDocument(user)` on sign-in
   - Subscribes to user document and wallets
   - Syncs profile store

3. **`src/lib/userDoc.ts`**:
   - `ensureUserDocument(user)`: Creates/updates user document
   - Generates unique handle
   - Seeds default wallets
   - Syncs profile store

4. **`src/lib/wallets.ts`**:
   - `ensureDefaultWallets(user)`: Seeds 6 default wallets

---

## Part 3: Gap Analysis

### Missing Components for Phone Sign-Up

| Component | Google Sign-Up | Phone Sign-Up | Status |
|-----------|---------------|---------------|--------|
| **Phone number storage** | N/A | ❌ Not stored | **MISSING** |
| **Firebase Phone Auth** | N/A | ❌ Not implemented | **MISSING** |
| **Password handling** | N/A | ❌ Collected but unused | **MISSING** |
| **User document creation** | ✅ Automatic | ❌ Not called | **MISSING** |
| **Wallet seeding** | ✅ Automatic | ❌ Not called | **MISSING** |
| **Profile store sync** | ✅ Automatic | ❌ Not called | **MISSING** |
| **Auth state management** | ✅ Automatic | ❌ Not updated | **MISSING** |
| **Verification status** | ✅ 'email-verified' | ❌ Not set | **MISSING** |
| **Handle generation** | ✅ Automatic | ❌ Not generated | **MISSING** |

### Data Flow Issues

1. **Phone Number Loss**:
   - Phone number is captured in `AuthEntrySheet` local state
   - Not stored in auth store (`authIdentifier` is for username/phone login, not signup)
   - Not passed to `PhoneSignupSheet`
   - **Solution**: Store phone number in auth store before opening PhoneSignupSheet

2. **No Firebase Integration**:
   - No Firebase Phone Authentication
   - No user creation in Firebase Auth
   - **Solution**: Implement Firebase Phone Auth with password

3. **No Post-Auth Flow**:
   - No user document creation
   - No wallet seeding
   - No profile sync
   - **Solution**: Reuse existing `ensureUserDocument()` and `ensureDefaultWallets()` after phone auth

---

## Part 4: Proposed Solution

### Architecture Overview

The solution follows the same pattern as Google sign-up but uses Firebase Phone Authentication instead of Google OAuth. The key difference is that phone sign-up requires:
1. Phone number verification (SMS code)
2. Password for account creation
3. User document creation with phone number (instead of email)

### Solution Components

#### 1. Store Phone Number in Auth Store

**File**: `src/store/auth.ts`

**Change**:
```typescript
interface AuthState {
  // ... existing fields
  phoneNumber: string | null // Add phone number for signup
}

// Add setter
setPhoneNumber: (phone: string) => void

// Update openPhoneSignup to store phone number
openPhoneSignup: (phoneNumber?: string) => void
```

**Usage in AuthEntrySheet**:
```typescript
handlePhoneSubmit(e) {
  const phone = phoneNumber.trim()
  if (phone.length === 0) return
  
  // Store phone number in auth store
  setPhoneNumber(phone)
  openPhoneSignup(phone)
}
```

#### 2. Implement Firebase Phone Authentication

**File**: `src/hooks/useFirebaseAuth.ts`

**New Function**:
```typescript
const signUpWithPhone = async (phoneNumber: string, password: string) => {
  // Step 1: Send SMS verification code
  // Step 2: Verify code (user enters code)
  // Step 3: Create account with phone + password
  // Step 4: FirebaseAuthListener will handle the rest (same as Google)
}
```

**Firebase Phone Auth Flow**:
1. `signInWithPhoneNumber(auth, phoneNumber)` - Sends SMS code
2. User enters verification code
3. `confirmationResult.confirm(code)` - Verifies code
4. If new user: Create account with `createUserWithEmailAndPassword()` using phone as email
5. If existing user: Sign in with `signInWithEmailAndPassword()`

**Note**: Firebase Phone Auth doesn't support password directly. We need to:
- Option A: Use Phone Auth for verification, then create email/password account
- Option B: Use Phone Auth + link to email/password credential
- Option C: Use custom auth with phone + password (requires backend)

**Recommended**: Option A (simpler, works with existing flow)

#### 3. Update PhoneSignupSheet to Use Firebase

**File**: `src/components/PhoneSignupSheet.tsx`

**Changes**:
```typescript
const { phoneNumber } = useAuthStore() // Get phone from store
const { signUpWithPhone } = useFirebaseAuth()

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  if (!phoneNumber || !password) return
  
  setIsSubmitting(true)
  
  try {
    // Step 1: Send SMS verification code
    await signUpWithPhone(phoneNumber, password)
    
    // Step 2: Show code input (new component or inline)
    // Step 3: Verify code
    // Step 4: FirebaseAuthListener handles the rest
    
    closeAllAuth()
  } catch (error) {
    // Show error notification
    setIsSubmitting(false)
  }
}
```

#### 4. Add SMS Code Verification Step

**New Component**: `src/components/PhoneVerificationSheet.tsx`

**Purpose**: Collect SMS verification code from user

**Flow**:
1. User enters 6-digit code
2. Code is verified with Firebase
3. If verified: Account is created, FirebaseAuthListener handles the rest
4. If invalid: Show error, allow retry

#### 5. Update User Document Schema

**File**: `src/lib/userDoc.ts`

**Change**: Add `phoneNumber` field to `UserDocument` interface

```typescript
export interface UserDocument {
  // ... existing fields
  phoneNumber?: string | null // Add phone number
  phoneVerified?: boolean // Add phone verification status
}
```

**Update `ensureUserDocument()`**:
```typescript
// For phone sign-up users:
const userDoc = {
  // ... existing fields
  phoneNumber: user.phoneNumber || null,
  phoneVerified: user.phoneNumber ? true : false,
  email: user.email || '', // May be empty for phone-only users
  emailVerified: false,
  verificationStatus: user.phoneNumber ? 'phone-verified' : 'unverified',
}
```

#### 6. Handle Generation for Phone Users

**File**: `src/lib/userDoc.ts`

**Change**: Update `generateUniqueHandle()` to work with phone numbers

```typescript
function generateUniqueHandle(
  fullName: string | null,
  email: string,
  phoneNumber?: string | null
): string {
  if (fullName) {
    // Use name-based handle (same as before)
  } else if (email) {
    // Use email-based handle (same as before)
  } else if (phoneNumber) {
    // Generate handle from phone: @user-XXXX (where XXXX is last 4 digits)
    const last4 = phoneNumber.slice(-4)
    const suffix = Math.floor(1000 + Math.random() * 9000)
    return `@user-${last4}-${suffix}`
  }
  
  // Fallback
  return `@user-${Math.floor(10000 + Math.random() * 90000)}`
}
```

---

## Part 5: Implementation Steps

### Phase 1: Store Phone Number

1. Update `src/store/auth.ts`:
   - Add `phoneNumber: string | null` to state
   - Add `setPhoneNumber()` setter
   - Update `openPhoneSignup()` to accept phone number

2. Update `src/components/AuthEntrySheet.tsx`:
   - Store phone number in auth store before opening PhoneSignupSheet

### Phase 2: Firebase Phone Auth Setup

1. Update `src/lib/firebase.ts`:
   - No changes needed (Firebase Auth supports phone auth by default)

2. Create `src/hooks/useFirebasePhoneAuth.ts`:
   - `sendPhoneVerificationCode(phoneNumber)`
   - `verifyPhoneCode(code)`
   - `signUpWithPhoneAndPassword(phoneNumber, password)`

### Phase 3: SMS Verification UI

1. Create `src/components/PhoneVerificationSheet.tsx`:
   - 6-digit code input
   - Resend code button
   - Error handling

2. Update `src/components/PhoneSignupSheet.tsx`:
   - Show verification sheet after password submission
   - Handle verification flow

### Phase 4: User Document Updates

1. Update `src/lib/userDoc.ts`:
   - Add `phoneNumber` and `phoneVerified` to `UserDocument`
   - Update `generateUniqueHandle()` for phone numbers
   - Update `ensureUserDocument()` to handle phone users

### Phase 5: Integration & Testing

1. Update `src/components/PhoneSignupSheet.tsx`:
   - Integrate Firebase phone auth
   - Handle success/error states
   - Close auth sheets on success

2. Test flow:
   - Phone number entry → Password entry → SMS code → Account creation
   - Verify user document is created
   - Verify wallets are seeded
   - Verify profile store is synced

---

## Part 6: Equivalence to Google Sign-Up

### What Will Be Equivalent

✅ **User Document Creation**: Same schema, same process  
✅ **Wallet Seeding**: Same 6 default wallets  
✅ **Profile Store Sync**: Same sync mechanism  
✅ **Auth State Management**: Same FirebaseAuthListener flow  
✅ **Handle Generation**: Similar logic (adapted for phone)  
✅ **Account Status**: Same 'active' status  
✅ **Trust Level**: Same initial 0 trust level  

### What Will Be Different

❌ **Social Contacts**: Phone sign-up won't have Google contacts (as expected)  
❌ **Email**: Phone users may not have email (or have phone@placeholder.com)  
❌ **Avatar**: Phone users won't have Google profile photo  
❌ **Display Name**: Phone users won't have Google display name  
❌ **Verification Status**: 'phone-verified' instead of 'email-verified'  

### Handling Differences

1. **Email**: Use `phoneNumber@phone.gobankless.local` as placeholder (not displayed to user)
2. **Display Name**: Prompt user to set display name after sign-up (optional onboarding step)
3. **Avatar**: Use default avatar (same as Google users without photo)
4. **Contacts**: Phone users can manually add contacts (no automatic sync)

---

## Part 7: Security Considerations

### Phone Number Validation

- Validate phone number format (E.164 format: +27123456789)
- Sanitize input (remove spaces, dashes, parentheses)
- Normalize to international format

### SMS Code Security

- Rate limit SMS code requests (prevent abuse)
- Expire codes after 5-10 minutes
- Limit retry attempts (3-5 max)
- Use Firebase's built-in rate limiting

### Password Requirements

- Minimum 8 characters
- Require at least one number
- Require at least one letter
- (Optional) Require special character

### Account Linking

- Prevent duplicate accounts (check if phone number already exists)
- Allow linking phone to existing Google account (future feature)
- Allow linking Google to existing phone account (future feature)

---

## Part 8: Error Handling

### Common Errors

1. **Invalid Phone Number**:
   - Show: "Please enter a valid phone number in international format (e.g., +27123456789)"

2. **SMS Code Not Received**:
   - Show: "Code not received? Tap 'Resend code'"
   - Allow resend after 60 seconds

3. **Invalid SMS Code**:
   - Show: "Invalid code. Please try again."
   - Allow 3-5 retries before requiring new code

4. **Phone Number Already Exists**:
   - Show: "This phone number is already registered. Sign in instead."
   - Link to login flow

5. **Network Error**:
   - Show: "Network error. Please check your connection and try again."
   - Allow retry

6. **Firebase Quota Exceeded**:
   - Show: "Too many requests. Please try again later."
   - Log error for monitoring

---

## Part 9: Testing Checklist

### Unit Tests

- [ ] Phone number validation
- [ ] Phone number normalization
- [ ] Handle generation from phone number
- [ ] User document creation with phone number

### Integration Tests

- [ ] Complete phone sign-up flow (phone → password → SMS → account)
- [ ] User document created with correct fields
- [ ] Wallets seeded correctly
- [ ] Profile store synced correctly
- [ ] Auth state updated correctly

### Edge Cases

- [ ] Phone number with country code
- [ ] Phone number without country code (add default)
- [ ] Invalid phone number format
- [ ] SMS code expiration
- [ ] SMS code retry limit
- [ ] Duplicate phone number
- [ ] Network failure during sign-up
- [ ] User closes app during SMS verification

---

## Part 10: Future Enhancements

### Phase 2 Features

1. **Phone Number Linking**:
   - Allow users to add phone number to existing Google account
   - Allow users to add Google account to existing phone account

2. **Display Name Onboarding**:
   - Prompt phone users to set display name after sign-up
   - Optional but recommended

3. **Profile Photo Upload**:
   - Allow phone users to upload profile photo
   - Same as Google users can change their photo

4. **Contact Import**:
   - Allow phone users to import contacts from device
   - Manual import (not automatic like Google)

---

## Conclusion

The phone sign-up flow is currently incomplete and not integrated with Firebase. The proposed solution follows the same architecture as Google sign-up, ensuring equivalence in user document creation, wallet seeding, and profile management. The main differences (no social contacts, no email/avatar from provider) are expected and can be handled gracefully.

**Next Steps**: Implement Phase 1 (store phone number) and Phase 2 (Firebase phone auth) as the foundation, then proceed with the remaining phases.


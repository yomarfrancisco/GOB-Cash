# SendDetailsSheet Height Diagnosis

## Issue
The SendDetailsSheet height is not increasing to match the keypad (85vh) despite adding `size="tall"` prop.

## Current CSS Structure

### ActionSheet Base Classes
1. **`.as-sheet`** (base class)
   - No `max-height` constraint
   - Uses flexbox column layout

2. **`.as-sheet-compact`** (default when no size prop)
   - `max-height: 65vh` ⚠️ **CONFLICT POTENTIAL**

3. **`.as-sheet-tall`** (when `size="tall"`)
   - `max-height: 85vh` ✅

4. **`.as-sheet.send-details.as-sheet-tall`** (specific rule we added)
   - `max-height: 85vh` ✅

### ActionSheet Body (`.as-body`)
- `padding: 0 24px`
- `overflow-y: auto`
- `flex: 1`
- **NO explicit height set** ⚠️ **POTENTIAL ISSUE**

### SendDetailsSheet Internal Structure
1. **`.send-details-sheet`** (root container inside `.as-body`)
   - `height: 100%` - depends on parent height
   - `min-height: 0`
   - `display: flex; flex-direction: column`

2. **`.send-details-header`**
   - `flex-shrink: 0` (fixed size)
   - `padding: var(--sheet-header-offset, 64px) 20px 16px 20px`

3. **`.send-details-fields`**
   - `flex: 1` (should grow to fill space)
   - `overflow-y: auto`

## Identified Conflicts

### Conflict #1: `.as-body` Height Constraint
**Problem:** `.as-body` has no explicit height, so `height: 100%` on `.send-details-sheet` may not work correctly.

**Evidence:**
- `.as-body` only has `flex: 1` but no `height: 100%` or `min-height: 0`
- Other sheets like `financialInboxSheet` and `handAuthSheet` have explicit `.as-body` height rules:
  ```css
  .as-sheet.financialInboxSheet .as-body {
    height: 100%;
  }
  ```

### Conflict #2: Default Compact Class
**Problem:** If `.as-sheet-compact` is being applied (even if `.as-sheet-tall` is also present), the `65vh` max-height might be taking precedence due to CSS specificity or order.

**Evidence:**
- `.as-sheet-compact` sets `max-height: 65vh`
- Both classes might be present: `as-sheet as-sheet-tall send-details`
- Need to verify class order and specificity

### Conflict #3: Missing `.as-body` Height for send-details
**Problem:** Unlike other tall sheets (financialInboxSheet, handAuthSheet), send-details doesn't have a rule to set `.as-body` height to 100%.

**Comparison:**
- ✅ `.as-sheet.financialInboxSheet .as-body { height: 100%; }`
- ✅ `.as-sheet.handAuthSheet .as-body { height: 100%; }`
- ❌ `.as-sheet.send-details .as-body { ... }` - **MISSING**

## Recommended Fixes

1. **Add explicit `.as-body` height for send-details:**
   ```css
   .as-sheet.send-details .as-body {
     height: 100%;
     display: flex;
     flex-direction: column;
   }
   ```

2. **Ensure `.as-sheet-tall` takes precedence:**
   - Verify class order in ActionSheet component
   - May need `!important` or higher specificity

3. **Check if `.as-sheet-compact` is being applied:**
   - If ActionSheet defaults to `compact`, ensure `size="tall"` properly removes it

## DOM Structure
```
.as-sheet.as-sheet-tall.send-details (max-height: 85vh)
  └── .as-body (no height constraint - ISSUE)
      └── .send-details-sheet (height: 100% - depends on parent)
          ├── .send-details-header (flex-shrink: 0)
          └── .send-details-fields (flex: 1)
```

## Root Cause Hypothesis
The `.as-body` wrapper doesn't have an explicit height, so when `.send-details-sheet` tries to use `height: 100%`, it has no reference height to calculate from. The sheet's `max-height: 85vh` is set, but the internal content isn't filling that space because the flex container (`.as-body`) isn't constrained.


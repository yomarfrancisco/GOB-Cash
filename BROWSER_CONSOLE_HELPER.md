# Browser Console Helper - setCoreAgentBalance

## Quick Access

**Paste this once to expose `setBalance()` globally:**

```javascript
// Expose setCoreAgentBalance globally
window.setBalance = async (amount) => {
  const { setCoreAgentBalance } = await import('/src/lib/transactions/clientFunctions.ts')
  return await setCoreAgentBalance({ amountZAR: amount })
}

console.log('✅ setBalance() is now available. Usage: await setBalance(10000)')
```

**Then just call:**
```javascript
await setBalance(10000)  // Sets balance to R10,000
```

## Direct Import (No Global)

**One-liner:**
```javascript
const { setCoreAgentBalance } = await import('/src/lib/transactions/clientFunctions.ts')
await setCoreAgentBalance({ amountZAR: 10000 })
```

## Function Location

- **File:** `src/lib/transactions/clientFunctions.ts`
- **Export:** `export async function setCoreAgentBalance(...)`
- **Cloud Function:** `setCoreAgentBalance` (us-central1)
- **Access:** Dynamic import from browser console


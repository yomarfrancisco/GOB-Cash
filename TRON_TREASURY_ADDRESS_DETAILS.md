# TRON Treasury Address Details

## Configuration Source

The TRON treasury address is configured in Firebase Functions config and can be retrieved in two ways:

### 1. Stored Address (from Firebase Config)
```javascript
functions.config().tron?.treasury_address
```

### 2. Derived Address (from Private Key)
```javascript
getTreasuryAddress() // Uses TronWeb.address.fromPrivateKey(privateKey)
```

## Current Configuration

**Source**: `firebase functions:config:get --project gobankless-dev`

```json
{
  "tron": {
    "treasury_address": "TQpKs8c2cLcnPUkTq5LftRftusSBkgEwQX",
    "treasury_private_key": "bb786544d6b28ce9cc552a1181eb1b3374a91d56891218eecd090b20fddc1666",
    "fullhost": "https://api.trongrid.io",
    "api_key": "9fe64b33-4a06-45d9-bc92-486a11599426",
    "usdt_contract": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    "master_seed": "square setup similar whip enable belt oxygen fury method paper upon planet"
  }
}
```

## Treasury Address

**Address**: `TQpKs8c2cLcnPUkTq5LftRftusSBkgEwQX`

**Network**: TRON Mainnet

**Derived From**: Private key `bb786544d6b28ce9cc552a1181eb1b3374a91d56891218eecd090b20fddc1666`

## Code Implementation

### `getTreasuryAddress()` Function
**File**: `functions/src/utils/tronUtils.ts:44-52`

```typescript
export function getTreasuryAddress(): string {
  const privateKey = functions.config().tron?.treasury_private_key
  if (!privateKey) {
    throw new Error('TRON_TREASURY_PRIVATE_KEY not configured')
  }

  // Use TronWeb's static address utility
  return (TronWeb as any).address.fromPrivateKey(privateKey)
}
```

### `getTronWeb()` Function
**File**: `functions/src/utils/tronUtils.ts:23-39`

```typescript
export function getTronWeb(): TronWeb {
  const privateKey = functions.config().tron?.treasury_private_key
  const fullHost = functions.config().tron?.fullhost || 'https://api.trongrid.io'
  const apiKey = functions.config().tron?.api_key

  if (!privateKey) {
    throw new Error('TRON_TREASURY_PRIVATE_KEY not configured')
  }

  const tronWeb = new TronWeb({
    fullHost,
    headers: apiKey ? { 'TRON-PRO-API-KEY': apiKey } : undefined,
    privateKey,
  })

  return tronWeb
}
```

## Usage

The treasury address is used for:

1. **USDT Balance Checks**: `getTreasuryUsdtBalance()` queries the USDT contract balance
2. **TRX Balance Checks**: `getTreasuryTrxBalance()` queries native TRX balance
3. **Withdrawals**: `tx_withdrawTronUSDT` sends USDT from this address to user addresses

## Verification

To verify the address matches the private key:

```javascript
const privateKey = "bb786544d6b28ce9cc552a1181eb1b3374a91d56891218eecd090b20fddc1666"
const derivedAddress = TronWeb.address.fromPrivateKey(privateKey)
// Should equal: "TQpKs8c2cLcnPUkTq5LftRftusSBkgEwQX"
```

## Security Notes

⚠️ **IMPORTANT**: 
- The private key is stored in Firebase Functions config (encrypted at rest)
- Never commit private keys to version control
- The private key should be kept secure and rotated periodically
- Access to Firebase Functions config should be restricted

## Related Functions

- `getTreasuryUsdtBalance()`: Gets USDT balance on-chain
- `getTreasuryTrxBalance()`: Gets TRX balance on-chain
- `getTronWeb()`: Initializes TronWeb instance with treasury credentials


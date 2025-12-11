# Firebase Cloud Functions

Backend Cloud Functions for GOBankless social graph computation.

## Overview

This functions package implements two Cloud Functions:

1. **onContactWrite** - Triggered when contacts are written to `/users/{userId}/contacts/{contactId}`
   - Creates/updates `graphEdges` entries
   - Updates `directory` entries with `inboundEdgeCount` and `avgContactCompleteness`

2. **recomputeGhostQuality** - Scheduled function (runs every 30 minutes)
   - Recomputes `ghostQuality` scores for all directory entries
   - Processes in batches to avoid timeouts

## Setup

### Prerequisites

- Node.js 20
- Firebase CLI installed globally: `npm install -g firebase-tools`
- Firebase project configured

### Installation

```bash
cd functions
npm install
```

## Development

### Build

From repo root:
```bash
pnpm functions:build
```

Or from functions directory:
```bash
cd functions
npm run build
```

### Local Testing (Optional)

To run functions locally with Firebase emulators:

```bash
pnpm functions:serve
```

Or:
```bash
cd functions
npm run serve
```

This will start the Firebase emulators. Note: You'll need to configure emulator settings in `firebase.json` if not already done.

## Deployment

### Deploy All Functions

From repo root:
```bash
pnpm functions:deploy
```

Or:
```bash
firebase deploy --only functions
```

### Deploy Specific Function

```bash
firebase deploy --only functions:onContactWrite
firebase deploy --only functions:recomputeGhostQuality
```

## Verification

After deployment, verify the functions are working:

### 1. Trigger Contact Sync

1. Sign in to the web app (no UI changes expected)
2. Open Search or Payment to trigger contact sync
3. The client will write contacts to `/users/{uid}/contacts/{contactId}`

### 2. Check Firestore Console

#### Graph Edges

1. Navigate to Firestore console
2. Open `graphEdges` collection
3. You should see new documents with:
   - `edgeId`: Format `{userId}::{handle}::contact::deviceContacts`
   - `fromUserId`: Your user ID
   - `toHandle`: Normalized handle (e.g., `$anya`)
   - `toUserId`: `null` (for unclaimed handles)
   - `edgeType`: `"contact"`
   - `source`: `"deviceContacts"`
   - `weight`: `1`
   - `isMutual`: `false` (will be computed later)

#### Directory Entries

1. Navigate to `directory` collection
2. Find entries for handles in your contacts
3. You should see:
   - `handle`: Normalized handle (e.g., `$anya`)
   - `inboundEdgeCount`: Number of users who have this contact (should be > 0)
   - `avgContactCompleteness`: 0-1 score based on contact data
   - `ghostQuality`: Will be updated after scheduled function runs (every 30 minutes)

### 3. Verify Scheduled Function

1. Wait up to 30 minutes for `recomputeGhostQuality` to run
2. Check Cloud Functions logs in Firebase Console:
   - Go to Functions → Logs
   - Look for `recomputeGhostQuality` execution logs
   - Should show: "Completed run" with `totalProcessed` and `totalUpdated` counts
3. Check directory entries - `ghostQuality` should be updated

### 4. Confirm No UI Changes

- Front-end should load and behave exactly as before
- Feature flags remain off (`GRAPH_EDGES_ENABLED` and `GHOST_QUALITY_ENABLED` are `false`)
- No new client-side Firestore reads/writes

## Function Details

### onContactWrite

**Trigger:** Firestore document write on `/users/{userId}/contacts/{contactId}`

**Behavior:**
- Derives handle from contact (handle → email → displayName → phone)
- Creates/updates graph edge in `graphEdges` collection
- Creates/updates directory entry with:
  - `inboundEdgeCount`: Incremented for new edges
  - `avgContactCompleteness`: Running average of contact completeness scores
  - `ghostQuality`: Set to 0 initially (updated by scheduled function)

**Idempotency:** Safe to re-run on the same contact

### recomputeGhostQuality

**Trigger:** Pub/Sub schedule (every 30 minutes)

**Behavior:**
- Scans `directory` collection in batches (300 docs per batch)
- Computes `ghostQuality` for each entry:
  ```
  normalizedInbound = min(1, inboundEdgeCount / 100)
  ghostQuality = (normalizedInbound * 0.6) + (avgContactCompleteness * 0.4)
  ```
- Updates directory documents with new `ghostQuality` scores

**Performance:**
- Processes up to 10,000 documents per run
- Uses pagination to avoid timeouts
- Logs progress for monitoring

## Schema Reference

### Graph Edge Document

```
/graphEdges/{edgeId}
{
  edgeId: string
  fromUserId: string
  toHandle: string
  toUserId: string | null
  edgeType: 'contact'
  source: 'deviceContacts' | 'gmail' | 'manual'
  weight: number (default: 1)
  isMutual: boolean (default: false)
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Directory Document

```
/directory/{handle}
{
  handle: string
  displayName: string | null
  ownerUserId: string | null
  inboundEdgeCount?: number
  avgContactCompleteness?: number (0-1)
  ghostQuality?: number (0-1)
  trustGlobal?: number | null
  isAgent?: boolean
  createdAt: Timestamp
  claimedAt?: Timestamp | null
  updatedAt: Timestamp
}
```

## Troubleshooting

### Functions Not Triggering

- Check Firebase Console → Functions → Logs for errors
- Verify Firestore rules allow writes (functions run with admin privileges)
- Check that contacts are being written to correct path: `/users/{uid}/contacts/{contactId}`

### Scheduled Function Not Running

- Check Cloud Scheduler in Firebase Console
- Verify function is deployed: `firebase functions:list`
- Check function logs for errors

### Performance Issues

- If timeouts occur, reduce `BATCH_SIZE` in `recomputeGhostQuality.ts`
- Consider sharding by handle prefix for very large directories
- Monitor function execution time in Firebase Console

## Notes

- Functions run with Firebase Admin privileges (bypass Firestore security rules)
- All writes target `graphEdges` and `directory` collections
- Client-side feature flags remain off - this is backend-only computation
- No UI changes were made - functions work transparently in the background


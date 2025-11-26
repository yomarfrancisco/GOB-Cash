# Avatar Visibility Diagnostics

## AVATAR DEFINITION

In `MapboxMap.tsx`, "avatar markers" are markers stored in `agentMarkersRef.current`.

### agentMarkersRef contains:
- ✅ **Pre-built demo agents** (Sarah, Thabo, João, Naledi) - added in demo agents effect (lines ~636-665)
- ✅ **City-based initial avatars** (letters A, C, E, etc. on Benjamin background) - added in demo agents effect (lines ~667-696)
- ✅ **Member/co-op markers** from `props.markers` - added in markers effect (lines ~474-578)
- ✅ **Dealer markers** from `props.markers` - added in markers effect (lines ~502-517)

### agentMarkersRef does NOT contain:
- ❌ **User marker** (stored in `userMarkerRef`, separate ref) - created in geolocation handler (lines ~227-261)
- ❌ **"You are here" bubble** (stored in `youAreHereMarkerRef`, separate ref) - created in geolocation handler (lines ~263-280)
- ❌ **Branch markers** (added directly to map, not tracked in agentMarkersRef) - created in map load handler (line ~214)

### Marker ID patterns:
- Demo agents: `demo-naledi`, `demo-joao`, `demo-thabo`, `demo-sarah`
- Initial avatars: `initial-{letter}-{cityId}-{index}` or `initial-{letter}-{cityId}-nearby-{index}`
- Member/co-op from props: Uses `m.id` from props
- Dealer from props: Uses `m.id` from props

## Debug Logging

The visibility effect (lines ~703-810) now includes comprehensive debug logging:

1. **Effect trigger**: Logs when effect runs and current state (isAuthed, variant, userLngLat)
2. **All marker IDs**: Logs all IDs in `agentMarkersRef.current`
3. **Avatar coordinates**: Logs which avatars were extracted (excluding user/bubble)
4. **Distances**: Logs computed distances from user to each avatar
5. **Nearest 5**: Logs which 5 IDs were selected as nearest
6. **Visibility toggle**: Logs for each marker whether it's visible or hidden
7. **Summary**: Logs total counts (visible, hidden, nearest 5)

## Expected Behavior

### Pre-sign-in (landing map):
- All avatars visible (no filtering)
- Effect returns early when `!isAuthed || variant === 'landing'`

### Post-sign-in (isAuthed === true, variant !== 'landing'):
- Only 5 nearest avatars visible
- User marker and "You are here" bubble always visible
- All other avatars hidden via `display: none`

## Sample Log Output

When running in post-sign-in mode, you should see console output like:

```
AVATAR_VISIBILITY: Effect triggered { isAuthed: true, variant: 'landing', hasUserLngLat: true, ... }
AVATAR_VISIBILITY: All avatar marker IDs in agentMarkersRef [ 'demo-naledi', 'demo-joao', 'initial-A-johannesburg-0', ... ]
AVATAR_VISIBILITY: Avatar coordinates extracted { totalAvatars: 84, avatarIds: [...] }
AVATAR_VISIBILITY: Distances computed [ { id: 'initial-A-johannesburg-0', dist: 1234 }, ... ]
AVATAR_VISIBILITY: Nearest 5 IDs [ 'initial-A-johannesburg-0', 'demo-naledi', ... ]
AVATAR_VISIBILITY: marker demo-naledi visible? true (nearest 5)
AVATAR_VISIBILITY: marker initial-A-johannesburg-0 visible? true (nearest 5)
AVATAR_VISIBILITY: marker initial-C-cape-town-1 visible? false (hidden - not in nearest 5)
...
AVATAR_VISIBILITY: Summary { totalMarkersInRef: 84, totalAvatars: 84, nearest5Count: 5, visibleCount: 5, hiddenCount: 79 }
```

## Potential Issues to Check

1. **Effect not running**: Check if `isAuthed` and `variant` conditions are met
2. **Markers not in agentMarkersRef**: Some markers might be added directly to map without being tracked
3. **User location not set**: If `userLngLat` is null, effect returns early
4. **Distance calculation**: Check if `distMeters` is working correctly
5. **Display style not applied**: Check if `getElement()` returns valid DOM element
6. **CSS override**: Some CSS might be overriding `display: none`

## Next Steps

After reviewing console logs:
1. Verify all expected avatars are in `agentMarkersRef`
2. Confirm the 5 nearest IDs match what should be visible
3. Check if visibility toggles are actually being applied
4. Identify any markers that are visible but shouldn't be


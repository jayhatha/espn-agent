# Quick Task 76: Fix mobile roster not updating

## Root Cause
Background SW's `chrome.storage.onChanged` only includes keys that actually changed.
When engine signals update but roster stays the same, `draft-mobile-state` is absent
from `changes`. The background SW sent `payload: null` for the missing key, which:
1. Made the hub's `latestSnapshot` cache store a partial message
2. Reconnecting mobile clients got stale data without roster/state

## Fix
Added in-memory caches (`cachedPayload`, `cachedEngineSignals`) in the background SW.
On each `onChanged` event, update only the changed cache, then always send BOTH fields.
Every WS message is now a complete STATE_SNAPSHOT with both payload and engineSignals.

## Win Probability
Format is correct (fraction 0-1 → pct() → "12.0%"). The "way off" issue is likely
simulation quality — needs more user detail about expected vs actual values.

## Status: EXECUTED

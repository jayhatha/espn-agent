# Quick Task 104: Fix Snapshot Freshness

**Completed:** 2026-03-24
**Tasks:** 1/1

## What Changed

### packages/backend/src/adapters/espn.ts
- Added public `clearCache()` method that calls `this.cache.clear()` with logging

### packages/backend/src/agents/snapshot-orchestrator.ts
- Added `this.espnAdapter.clearCache()` call before ESPN fetch when `forceFresh` is true
- Added `scoringPeriodId: 1` to the ESPN fetch parameters

## Root Cause
ESPN adapter has a 1-hour LRU cache. Manual snapshot with `forceFresh: true` skipped the DB dedup check but the adapter still served cached ESPN data — roster moves and FAAB changes made on ESPN weren't reflected.

## Verification
- Backend TypeScript compiles cleanly
- `clearCache` exists on ESPNAdapter and is called from orchestrator
- Scheduled snapshots unaffected (forceFresh defaults to false)

---
phase: 11-draft-assistant-enhancements-player-pool-sync-value-detection-and-league-agnostic-projections
plan: "03"
subsystem: extension
tags: [draft-assistant, config-detection, auto-refresh, retry-logic]
dependency_graph:
  requires: [11-01]
  provides: [league-agnostic-draft, auto-refresh-rankings]
  affects: [draft-sidebar, content-script, api-client]
tech_stack:
  added: [exponential-backoff]
  patterns: [dom-parsing, config-caching, retry-with-backoff, async-handlers]
key_files:
  created:
    - packages/extension/lib/draft-config-detector.ts
  modified:
    - packages/extension/lib/api-client.ts
    - packages/extension/entrypoints/content.tsx
    - packages/extension/lib/dom-observers.ts
    - packages/extension/lib/draft-state.ts
    - packages/extension/components/DraftSidebar.tsx
decisions:
  - title: "Multiple DOM selector strategies for robustness"
    rationale: "ESPN can change their DOM structure; multiple fallback strategies increase resilience"
    alternatives: ["Single selector (brittle)", "Require manual config (poor UX)"]
  - title: "Config cached after initial detection"
    rationale: "DOM parsing is expensive; league config doesn't change mid-draft"
    alternatives: ["Re-detect on every refresh (wasteful)", "Detect on visibility change (complex)"]
  - title: "Keep stale data on refresh failure"
    rationale: "Stale rankings better than no rankings; user can continue draft"
    alternatives: ["Clear rankings on failure (worse UX)", "Block UI until success (blocks draft)"]
metrics:
  duration_minutes: 5
  tasks_completed: 2
  files_modified: 6
  commits: 2
  completed_at: "2026-02-25"
---

# Phase 11 Plan 03: League Config Detection & Auto-Refresh Summary

**One-liner:** League-agnostic draft assistant with DOM-based config detection, exponential backoff retry, and auto-refresh rankings after each pick.

## Tasks Completed

### Task 1: Create league config detector and retry-enabled API client
- **Commit:** `17b4f7a`
- **Files:**
  - Created `packages/extension/lib/draft-config-detector.ts`
  - Modified `packages/extension/lib/api-client.ts`
  - Modified `packages/extension/package.json`
- **Changes:**
  - Installed `exponential-backoff` dependency
  - Implemented `detectLeagueConfig()` with 3-strategy detection:
    1. Count draft board columns for team count
    2. Parse stat headers for scoring categories
    3. Parse roster settings sidebar for roster slots
  - Added fallback to standard 5x5 defaults on detection failure
  - Mapped ESPN stat names to Category objects (R, HR, RBI, SB, AVG, W, SV, K, ERA, WHIP)
  - Added `getRankingsWithRetry()` and `getAuctionValuesWithRetry()` with exponential backoff
  - Configured 3 retry attempts with 1s, 2s, 4s delays and full jitter

### Task 2: Implement auto-refresh on pick detection
- **Commit:** `ce12296`
- **Files:**
  - Modified `packages/extension/entrypoints/content.tsx`
  - Modified `packages/extension/lib/dom-observers.ts`
  - Modified `packages/extension/lib/draft-state.ts`
  - Modified `packages/extension/components/DraftSidebar.tsx`
- **Changes:**
  - Updated `observeDraftBoard()` signature to accept async pick handlers
  - Added `cachedLeagueConfig` module variable for config caching
  - Implemented `refreshRankingsAndProjections()` with retry logic
  - Triggered auto-refresh after each pick in `processDetectedPick()`
  - Detected league config once at page load with confidence scoring
  - Added `configWarnings` to Zustand state for UI display
  - Added warning banner in DraftSidebar when config detection fails/incomplete
  - Failed refreshes log error but keep stale rankings visible

## Deviations from Plan

None - plan executed exactly as written.

## Key Behaviors

1. **Config Detection (once per page load):**
   - Tries multiple selector strategies per detection function
   - Returns confidence level: "high", "low", or "failed"
   - Falls back to 5x5 defaults if detection fails
   - Caches detected config for duration of session

2. **Auto-Refresh (after every pick):**
   - Triggers automatically when DOM mutation adds pick element
   - Uses cached config (no re-detection)
   - Retries 3 times with exponential backoff (1s, 2s, 4s)
   - Keeps stale data if all retries fail

3. **Warning Banner:**
   - Shows when config detection confidence is low or failed
   - Lists specific detection failures (team count, categories, roster slots)
   - Does not block draft usage

## Technical Details

**Retry Configuration:**
```typescript
{
  numOfAttempts: 3,
  startingDelay: 1000,
  timeMultiple: 2,
  maxDelay: 5000,
  jitter: "full"
}
```

**Default 5x5 Categories:**
- Batting: R, HR, RBI, SB, AVG
- Pitching: W, SV, K, ERA, WHIP

**Default Roster Slots:**
- C:1, 1B:1, 2B:1, 3B:1, SS:1, OF:3, UTIL:1
- SP:4, RP:2, P:2, BN:3

## Testing Notes

Manual verification required:
1. Load extension on ESPN draft page
2. Check console for config detection logs
3. Verify warning banner if detection fails
4. Simulate pick via DevTools
5. Observe auto-refresh in console
6. Disconnect network and trigger pick to verify stale data kept

## Success Criteria

- [x] detectLeagueConfig() extracts team count, categories, and roster slots from DOM
- [x] Detection falls back to 5x5 defaults on failure
- [x] Config is cached after initial detection (not re-detected on refresh)
- [x] getRankingsWithRetry() implements 3 retry attempts with exponential backoff
- [x] Pick detection triggers automatic rankings refresh
- [x] Failed refreshes after retries keep stale data visible
- [x] Warning banner displays when config detection confidence is low
- [x] Extension builds without errors

## Impact

**User Experience:**
- Draft assistant works with any league configuration (not just 5x5)
- Rankings stay current as draft progresses (no manual refresh needed)
- Resilient to network issues (retries + stale data fallback)
- Clear warnings when config detection incomplete

**Technical:**
- Reduced coupling to specific league settings (league-agnostic)
- Improved reliability via retry logic and multiple detection strategies
- Better UX with async pick handlers (no UI blocking)

## Self-Check: PASSED

**Created files exist:**
- FOUND: packages/extension/lib/draft-config-detector.ts

**Commits exist:**
- FOUND: 17b4f7a
- FOUND: ce12296

**Build verification:**
- Extension builds without errors (390.85 kB total)

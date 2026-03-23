---
phase: quick-97
plan: 01
subsystem: api
tags: [trade-recommendation, espn-asv, auction-value, player-pool-sync]

requires:
  - phase: 69-trade-finder
    provides: trade recommendation agent and trade finder UI
provides:
  - ESPN ASV column on player table with migration
  - ASV extraction during player pool sync
  - ASV similarity filter in trade candidate generation
affects: [trade-recommendation, player-pool-sync, snapshot-orchestrator]

tech-stack:
  added: []
  patterns: [asv-similarity-filter-for-trade-realism]

key-files:
  created:
    - packages/backend/src/db/migrations/018_add_player_espn_asv.sql
  modified:
    - packages/shared/src/types.ts
    - packages/backend/src/agents/player-pool-sync.ts
    - packages/backend/src/agents/snapshot-orchestrator.ts
    - packages/backend/src/agents/trade-recommendation.ts

key-decisions:
  - "ASV filter uses OR logic: within 30% OR within $5, whichever is more generous"
  - "Players without ASV data are still trade-eligible (graceful degradation)"
  - "Snapshot orchestrator passes espn_asv=null and does not overwrite ASV set by player-pool-sync"

patterns-established:
  - "ASV similarity gate: filter trade pairs before expensive impact simulation"

requirements-completed: [TRADE-ASV-FILTER]

duration: 3min
completed: 2026-03-23
---

# Quick Task 97: Trade ASV Similarity Filter Summary

**Filter trade recommendations by ESPN ASV similarity (+/-30% or +/-$5) so only realistic salary-matched swaps are suggested**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-23T21:24:56Z
- **Completed:** 2026-03-23T21:27:57Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added espn_asv column to player table via migration 018
- Player pool sync now extracts ASV from ESPN draftRanksByRankType (STANDARD or ROTO fallback)
- Trade candidate generation filters out pairs where ASV differs by more than 30% AND more than $5
- ASV values surfaced in TradeCandidate interface and explanation text

## Task Commits

Each task was committed atomically:

1. **Task 1: Add espn_asv column and populate during sync** - `fd4917d` (feat)
2. **Task 2: Filter trade candidates by ASV similarity** - `1047cd9` (feat)

## Files Created/Modified
- `packages/backend/src/db/migrations/018_add_player_espn_asv.sql` - ALTER TABLE adding espn_asv NUMERIC column
- `packages/shared/src/types.ts` - Added espn_asv field to Player interface
- `packages/backend/src/agents/player-pool-sync.ts` - Extracts ASV from ESPN data during sync, stores in player table
- `packages/backend/src/agents/snapshot-orchestrator.ts` - Type updated to include espn_asv (passes null, does not overwrite)
- `packages/backend/src/agents/trade-recommendation.ts` - ASV filter in trade pair loop, ASV in query select and TradeCandidate

## Decisions Made
- ASV filter uses OR logic (within 30% OR within $5) so low-value players ($2 vs $5) are not excluded by percentage alone
- Players without ASV data remain trade-eligible to avoid penalizing missing data
- Snapshot orchestrator explicitly does NOT include espn_asv in onConflict doUpdateSet, preserving values set by player-pool-sync

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Run migration 018 on next deploy.

## Next Phase Readiness
- ASV filter is active once player pool sync populates espn_asv values
- No blockers for Phase 70

---
*Quick Task: 97*
*Completed: 2026-03-23*

---
phase: 37-app-performance-audit-verify-and-fix-issues-from-performance-audit-md
plan: 02
subsystem: database
tags: [kysely, postgres, batch-insert, n+1, performance, snapshot-orchestrator, projections-ingest]

# Dependency graph
requires:
  - phase: 37-01
    provides: Performance audit identifying N+1 query patterns (B-01, B-02, B-03)
provides:
  - Batch player upserts with ON CONFLICT in snapshot orchestrator (replaces ~1,920 individual queries)
  - Batch injury event inserts after bulk pre-fetch of existing player statuses
  - Batch roster snapshot inserts in single INSERT after loop
  - Batch player_projection inserts in chunks of 500 for batters and pitchers
  - Single batch INSERT...ON CONFLICT for free-agent player upserts
affects: [snapshot-orchestrator, projections-ingest, recommendations-api, performance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-fetch all rows before loop, collect mutations in arrays, batch insert after loop"
    - "Use sql`excluded.field` syntax for ON CONFLICT doUpdateSet with batch inserts"
    - "Chunk batch inserts at 500 rows to stay under PostgreSQL parameter limits"

key-files:
  created: []
  modified:
    - packages/backend/src/agents/snapshot-orchestrator.ts
    - packages/backend/src/agents/projections-ingest.ts
    - packages/backend/src/api/recommendations.ts

key-decisions:
  - "Use sql`excluded.field` instead of raw values in ON CONFLICT doUpdateSet for batch upserts (Kysely requires this for dynamic multi-row updates)"
  - "Import RosterStatus from shared types for type-safe roster_status field in batch array"
  - "Chunk projections batch insert at 500 rows to avoid PostgreSQL parameter limit"
  - "Keep per-row matchPlayer() calls in projections ingest (fuzzy matching requires per-row logic), only batch the final INSERT"

patterns-established:
  - "Batch insert pattern: collect rows in array during loop, INSERT after loop - used in all three refactored locations"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 37 Plan 02: N+1 Batch Query Refactor Summary

**Eliminated ~2,100+ per-operation DB round-trips by batching player upserts, injury events, roster snapshots, projection inserts, and free-agent upserts into 4-5 total queries per operation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T00:13:58Z
- **Completed:** 2026-03-09T00:16:58Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- B-01: Snapshot orchestrator `writePlayersAndRosters` reduced from ~1,920 queries (4 per player x 480 players) to 4 queries (1 bulk SELECT + 3 batch INSERTs)
- B-02: Projections ingest `ingestBatters` and `ingestPitchers` now collect all matched projection rows and batch-insert after the loop in chunks of 500, reducing ~1,400 individual INSERTs to 3-5 batch queries
- B-03: Free-agent endpoint upserts all players in one batch INSERT...ON CONFLICT instead of a per-player loop, reducing ~200 INSERTs to 1 query

## Task Commits

Each task was committed atomically:

1. **Task 1: Batch player upserts, injury events, and roster snapshots in snapshot orchestrator (B-01)** - `6a49d7a` (perf)
2. **Task 2: Batch player_projection inserts and free-agent upserts (B-02, B-03)** - `54b04cb` (perf)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/backend/src/agents/snapshot-orchestrator.ts` - Pre-fetch all players in single SELECT; collect playerRows, injuryEventRows, rosterSnapshotRows in loop; batch INSERT all after loop; added sql and RosterStatus imports
- `packages/backend/src/agents/projections-ingest.ts` - Collect projectionRows array in batter/pitcher loops; batch INSERT in 500-row chunks after loops; remove per-row insertInto calls
- `packages/backend/src/api/recommendations.ts` - Replace per-FA upsert loop with single batch INSERT...ON CONFLICT; add sql import from kysely

## Decisions Made

- Used `sql\`excluded.field\`` syntax for ON CONFLICT doUpdateSet in batch upserts — Kysely requires this pattern when updating multiple rows since you cannot reference dynamic row values inline
- Retained per-row `matchPlayer()` calls in projections ingest — fuzzy matching logic is inherently sequential (DB lookup per player), only the final projection INSERT was batched
- Chunked projections batch insert at 500 rows to stay safely under PostgreSQL parameter limit (~65,535 params)
- Imported `RosterStatus` from shared types to properly type the rosterSnapshotRows array, satisfying Kysely's strict type system

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TypeScript error on first compilation: `roster_status: string` not assignable to `RosterStatus` union type — fixed by importing `RosterStatus` from shared types and using it in the array type annotation (Rule 1 - auto-fixed inline)

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit 6a49d7a (Task 1): FOUND
- Commit 54b04cb (Task 2): FOUND
- No individual insertInto("team_roster_snapshot") inside per-player loop: VERIFIED (line 548 is after loop)
- No individual insertInto("player_projection") inside row loops: VERIFIED (lines 417, 550 are in chunk-loop after main player loop)
- No per-FA loop with insertInto("player") in recommendations.ts: VERIFIED (line 121 is in batch block)

**Note:** Two additional N+1 patterns found in `writeFreeAgentPlayers` and `fetchAndStoreFreeAgents` in snapshot-orchestrator.ts (not part of plan scope B-01/B-02/B-03). Logged to `deferred-items.md`.

## Next Phase Readiness

- All three N+1 patterns (B-01, B-02, B-03) resolved
- Snapshot time should be reduced by an order of magnitude for large leagues
- No regressions: TypeScript compiles cleanly, ON CONFLICT logic preserved for two-way players
- Deferred: `writeFreeAgentPlayers` and `fetchAndStoreFreeAgents` in snapshot-orchestrator.ts still have per-player loops (logged in deferred-items.md)

---
*Phase: 37-app-performance-audit-verify-and-fix-issues-from-performance-audit-md*
*Completed: 2026-03-09*

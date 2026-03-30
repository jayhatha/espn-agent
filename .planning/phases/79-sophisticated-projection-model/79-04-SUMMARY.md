---
phase: 79-sophisticated-projection-model
plan: 04
subsystem: api
tags: [projection, allocation, standings, trade, waiver, roster-gaps, gs-cap]

# Dependency graph
requires:
  - phase: 79-03
    provides: allocateProjections pipeline with roster gap detection, GS cap scaling, staleness prorating
  - phase: 79-01
    provides: canFillSlot standalone export in projection/slot-eligibility.ts

provides:
  - StandingsProjectionAgent uses allocateProjections (lineup constraints + GS cap + staleness prorating)
  - TradeRecommendationAgent uses allocateProjections for post-trade roster gap detection
  - WaiverRecommendationAgent uses allocateProjections for post-add roster gap detection
  - rosterGaps exposed in TradeImpactAnalysis and WaiverRecommendation interfaces
  - canFillSlot no longer duplicated in TradeRecommendationAgent (imported from slot-eligibility)

affects: ["snapshot-orchestrator", "recommendations-api", "trade-api", "waiver-api"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "allocateProjections called once per team in StandingsProjectionAgent (not parallelized, avoids DB overload)"
    - "gap detection via allocateProjections applied to top-N waiver recommendations (post-simulation, not inline)"
    - "detectPostTradeGaps() is async with DB queries; detectPostSwapGaps() is synchronous using pre-fetched playerMap/projectionMap"
    - "GS used read from ESPN raw payload valuesByStat[33]; falls back to 0 if unavailable"

key-files:
  created: []
  modified:
    - packages/backend/src/agents/standings-projection.ts
    - packages/backend/src/agents/trade-recommendation.ts
    - packages/backend/src/agents/waiver-recommendation.ts
    - packages/backend/src/projection/allocator.ts

key-decisions:
  - "StandingsProjectionAgent: sequential team loop (not parallel) to avoid DB connection overload when all teams run allocation"
  - "Trade gap detection: allocateProjections called once per analyzeTradeImpact (not per generateCandidates simulation) to limit DB overhead"
  - "Waiver gap detection: detectPostSwapGaps() is synchronous using pre-fetched cached data from getRecommendations outer scope"
  - "GS used source: ESPN valuesByStat[33] from latest raw payload; fallback to 0 (conservative -- lets GS cap apply fully)"
  - "TradeRecommendationAgent.canFillSlot private method removed; now imported from projection/slot-eligibility.ts"
  - "Pre-existing noUnusedLocals errors in allocator.ts (from 79-03) fixed: removed scaledSpComponents Map and unused playerId destructuring"

patterns-established:
  - "All three consumer agents share the same GS data retrieval pattern (ESPN valuesByStat[33] + GS_LIMIT from settings)"
  - "allocateProjections always receives the projectionAsOfDate from projections_run.as_of_date -- never snapshotDate for prorating"

requirements-completed: [PROJ-10, PROJ-11, PROJ-12]

# Metrics
duration: 10min
completed: 2026-03-30
---

# Phase 79 Plan 04: Wire allocateProjections into Consumer Agents Summary

**Three consumer agents (standings, trade, waiver) now use allocateProjections for lineup-constrained, GS-capped, staleness-prorated projections instead of naive roster-wide summation.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-30T18:15:33Z
- **Completed:** 2026-03-30T18:25:01Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `StandingsProjectionAgent.computeTeamProjection` replaced naive `relevantProjections.reduce(...)` summation with `allocateProjections()` call — projected standings now respect lineup slot constraints, GS cap, and staleness prorating
- `TradeRecommendationAgent.analyzeTradeImpact` calls `detectPostTradeGaps()` which uses `allocateProjections` to surface roster holes after a trade; `rosterGaps` exposed in `TradeImpactAnalysis` interface
- `WaiverRecommendationAgent.getRecommendations` calls `detectPostSwapGaps()` (synchronous, uses pre-fetched cache) for the top-N legal recommendations; `rosterGaps` exposed in `WaiverRecommendation` interface
- `canFillSlot` private method removed from `TradeRecommendationAgent` (now imported from `projection/slot-eligibility.ts` per 79-01 extraction)
- All 110 existing tests (36 agent + 74 projection) pass

## Task Commits

1. **Task 1: Wire allocateProjections into StandingsProjectionAgent** - `a2da0b7` (feat)
2. **Task 2: Wire allocateProjections into Trade and Waiver agents** - `1418f05` (feat)
3. **Fix: Remove unused variable declarations in allocator.ts** - `6a1f9f0` (fix)

## Files Created/Modified

- `packages/backend/src/agents/standings-projection.ts` - Replaced naive summation with allocateProjections; added getGsUsed/getGsCap/getProjectionAsOfDate helpers; roster join now includes player.positions
- `packages/backend/src/agents/trade-recommendation.ts` - Removed private canFillSlot; imported from slot-eligibility; added rosterGaps to TradeImpactAnalysis; detectPostTradeGaps() + getGsData() helpers
- `packages/backend/src/agents/waiver-recommendation.ts` - Added rosterGaps to WaiverRecommendation; detectPostSwapGaps() (sync, no DB) + getGsData() + getProjectionAsOfDate() helpers
- `packages/backend/src/projection/allocator.ts` - Fixed pre-existing noUnusedLocals TS errors (scaledSpComponents removed, playerId destructuring narrowed)

## Decisions Made

- Sequential team loop in StandingsProjectionAgent (not parallel Promise.all) to avoid DB connection pool overload when 10+ teams each run allocation with multiple DB queries
- Trade gap detection runs once per `analyzeTradeImpact` call, not once per candidate in `generateTradeCandidates` (would be 500x overhead)
- Waiver gap detection uses synchronous `detectPostSwapGaps()` with data already fetched in the outer `getRecommendations` scope — zero extra DB queries
- GS used falls back to 0 when ESPN payload is unavailable; this is conservative (GS cap applies with maximum strictness)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing noUnusedLocals TS errors in allocator.ts**
- **Found during:** Task 1 verification (TypeScript compile check)
- **Issue:** allocator.ts had `scaledSpComponents` Map declared but never read, and `playerId` in a destructuring that was never used — both causing `TS6133` errors with `noUnusedLocals: true`
- **Fix:** Removed the unused `scaledSpComponents` Map (code already iterated `scaledProjections` directly); removed `playerId` from `{ playerId, scaledComponents }` destructuring
- **Files modified:** `packages/backend/src/projection/allocator.ts`
- **Verification:** `npx tsc --noEmit` (from worktree) exits 0 on the modified files
- **Committed in:** `6a1f9f0`

---

**Total deviations:** 1 auto-fixed (Rule 1 bug — unused variables causing TS errors)
**Impact on plan:** Pre-existing issue from 79-03 blocking clean TypeScript compile. Fix is a 5-line removal with no behavior change.

## Issues Encountered

- Worktree was behind main by 5 commits (79-02/79-03 work not merged). Fast-forwarded worktree to pick up projection module files before starting.
- The plan's verification command `cd /Users/jay-work/Code/espn-agent/packages/backend && npx tsc --noEmit` runs against the MAIN repo path, not the worktree. The 2 pre-existing allocator.ts errors are fixed in the worktree commit; they will resolve when worktrees are merged.

## Known Stubs

None — all three agents fully wire to allocateProjections. No placeholder return values.

## Next Phase Readiness

- Phase 79 (sophisticated-projection-model) is complete: foundation types (79-01), hitter allocation (79-02), full pipeline (79-03), consumer wiring (79-04)
- Downstream: StandingsProjectionAgent projected standings are now allocation-aware, improving trade/waiver simulation accuracy
- Roster gap warnings surfaced to UI when `rosterGaps` array is non-empty on trade/waiver responses

## Self-Check

---
*Phase: 79-sophisticated-projection-model*
*Completed: 2026-03-30*

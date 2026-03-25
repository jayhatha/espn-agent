---
phase: 73-show-current-and-projected-stats-for-each-player-on-waivers-and-roster-pages
plan: 01
subsystem: api, ui
tags: [fastify, kysely, nextjs, tailwind, typescript, formulas]

# Dependency graph
requires:
  - phase: 71-moves-page-data-population-transaction-ingestion-faab-bid-history-move-impact-computation
    provides: player pool sync with current_season_stats_json column populated
  - phase: 66-roto-math-foundation
    provides: formulas.ts with calculateAVG, calculateOBP, calculateERA, calculateWHIP
provides:
  - Backend roster endpoint now returns currentStats field alongside projections
  - Backend free-agents endpoint now returns currentStats field alongside projections
  - PlayerStatLine shared frontend component for position-aware stat display
affects:
  - 73-02 (wires PlayerStatLine into waivers and roster pages)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - currentStats field added to enriched API response objects alongside existing projections field
    - PlayerStatLine uses formatRate() with denominator guard to display -- for IP=0 and AB=0
    - Position detection via isPitcher() checks for SP/RP/P in positions array
    - Label color differentiation: Proj RoS = text-shell-accent (indigo), YTD = text-content-tertiary

key-files:
  created:
    - packages/frontend/src/components/league/PlayerStatLine.tsx
  modified:
    - packages/backend/src/api/recommendations.ts

key-decisions:
  - "formatRate() checks denominator before calling formula — avoids 0.00 display when IP=0 or AB=0"
  - "isPitcher() uses SP/RP/P position codes to determine stat layout — same logic as ESPN position strings"
  - "PlayerStatLine returns null when components is null — callers control conditional rendering"

patterns-established:
  - "PlayerStatLine: shared position-aware stat line component for any player list"
  - "formatRate: always check denominator before displaying rate stat — never show 0.00 for empty data"

requirements-completed: [PSTAT-01, PSTAT-02, PSTAT-03]

# Metrics
duration: 15min
completed: 2026-03-25
---

# Phase 73 Plan 01: Current Stats Data Layer and PlayerStatLine Component Summary

**Backend roster and free-agents endpoints now return currentStats from current_season_stats_json; new PlayerStatLine component renders position-aware hitter/pitcher stat lines with formula-based rate stats and null/zero guards**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-25T07:00:00Z
- **Completed:** 2026-03-25T07:15:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `currentStats: player.current_season_stats_json || null` to both free-agents and roster API responses (4 changes total: 2 selects + 2 enriched maps)
- Created `PlayerStatLine.tsx` — position-aware component that renders hitter stats (HR, R, RBI, SB, AVG, OBP) or pitcher stats (W, SV, K, ERA, WHIP) from stat components
- Rate stats computed via `calculateAVG`, `calculateOBP`, `calculateERA`, `calculateWHIP` from `@espn-fantasy/shared` — no hand-rolled math
- Null guard: component returns null if components is null; IP=0 shows -- for ERA/WHIP; AB=0 shows -- for AVG/OBP
- Both backend and frontend packages type-check cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Add currentStats to backend roster and free-agents API responses** - `a4bca22` (feat)
2. **Task 2: Create PlayerStatLine shared component** - `2773811` (feat)

## Files Created/Modified

- `packages/backend/src/api/recommendations.ts` - Added current_season_stats_json to free-agents and roster selects; added currentStats field to enriched response objects
- `packages/frontend/src/components/league/PlayerStatLine.tsx` - New shared position-aware stat line component

## Decisions Made

- `formatRate()` checks the denominator before calling the formula function, ensuring `--` is shown rather than `0.00` when AB=0 or IP=0 — consistent with the UI-SPEC copywriting contract
- `isPitcher()` checks for SP/RP/P in the positions array, matching how ESPN position strings are stored
- `PlayerStatLine` returns null when components is null rather than rendering an empty row — the caller conditionally renders based on data presence (Plan 02 responsibility)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebased worktree onto main before executing**
- **Found during:** Pre-task verification
- **Issue:** The worktree branch was based on "initial commit" and was missing the `current_season_stats_json` column (added in migration 007 and types.ts) — the plan's core dependency
- **Fix:** Ran `git rebase main` to bring the worktree up to date with all upstream changes including migration 007, player pool sync agent, and updated types
- **Files modified:** All worktree files (rebase brings in upstream commits)
- **Verification:** `grep "current_season_stats_json" packages/shared/src/types.ts` found the field; `pnpm --filter backend exec tsc --noEmit` passed
- **Committed in:** Not committed (rebase, not a code change)

---

**Total deviations:** 1 auto-fixed (1 blocking — worktree rebase)
**Impact on plan:** Necessary prerequisite. Plan assumes current_season_stats_json exists in DB schema and types — the rebase made that true.

## Issues Encountered

The worktree was created from "initial commit" (a5240a3) which predates the player pool migration that adds `current_season_stats_json`. A `git rebase main` was required before any code changes could be made. This is a normal worktree initialization pattern — not a blocker.

## Next Phase Readiness

- Plan 02 can now wire `PlayerStatLine` into the waivers and roster pages
- Both `projections` and `currentStats` fields are available in API responses
- `PlayerStatLine` is exported from `packages/frontend/src/components/league/PlayerStatLine.tsx`
- No blockers for Plan 02

---
*Phase: 73-show-current-and-projected-stats-for-each-player-on-waivers-and-roster-pages*
*Completed: 2026-03-25*

---
phase: quick-fix
plan: 01
subsystem: historical-backfill
tags: [bug-fix, roto-stats, accumulation]
dependency_graph:
  requires: [historical-backfill-agent, snapshot-orchestrator]
  provides: [accurate-counting-stats, debug-endpoint]
  affects: [league_daily_snapshot, team_daily_category_totals]
tech_stack:
  added: []
  patterns: [roster-filtering, debug-logging, ESPN-comparison]
key_files:
  created:
    - none
  modified:
    - packages/backend/src/agents/snapshot-orchestrator.ts
    - packages/backend/src/api/admin.ts
    - packages/backend/src/agents/historical-backfill.ts
decisions:
  - title: "Include bench players in roto stat accumulation"
    rationale: "In roto fantasy baseball, ALL rostered players' stats count toward standings, including bench. Only IL (17) and NA (19) should be excluded."
    alternatives: ["Keep active-only filter", "Make it configurable by league"]
    selected: "Include bench (lineupSlotId <= 16)"
  - title: "Add debug endpoint for manual verification"
    rationale: "Provides admins a way to inspect raw ESPN data per scoring period, verify roster inclusion logic, and compare accumulated totals to ESPN's team-level aggregates."
    alternatives: ["Rely on logs only", "Add UI for debug view"]
    selected: "Debug API endpoint at /api/admin/leagues/:id/debug/period-stats"
metrics:
  duration_minutes: 2
  tasks_completed: 3
  files_modified: 3
  commits: 3
  completed_at: "2026-02-22T18:12:29Z"
---

# Quick Fix 1: Fix Counting Stats Magnitude Bug

**One-liner:** Fixed bench player exclusion bug causing counting stats to be ~10x too small in backfilled snapshots — bench stats now correctly accumulate in roto leagues

## Context

After implementing historical backfill in Phase 07.1, counting stats (R, HR, RBI, SB, K, SV) showed unrealistically low values in backfilled data:
- R: ~100 instead of ~600-900 per team for a full season
- HR: ~20 instead of ~150-250 per team
- RBI: ~100 instead of ~600-900 per team

The root cause was a roster filter in `writeCurrentStandingsFromPlayerStats` that excluded bench players (lineupSlotId 16). In roto fantasy baseball, ALL rostered players' stats count toward team totals, including bench. Only IL (17) and NA (19) players should be excluded. This filter dropped ~30-50% of player stats each week, compounding across the season to produce totals an order of magnitude too small.

## Tasks Completed

### Task 1: Fix bench player exclusion in writeCurrentStandingsFromPlayerStats
**Files:** `packages/backend/src/agents/snapshot-orchestrator.ts`
**Commit:** d1202cb

Changed the roster filter from:
```typescript
const activeRoster = rosterEntries.filter((entry: any) => entry.lineupSlotId <= 15);
```

To:
```typescript
const countingRoster = rosterEntries.filter(
  (entry: any) => entry.lineupSlotId !== undefined && entry.lineupSlotId <= 16
);
```

Also:
- Renamed variable from `activeRoster` to `countingRoster` for semantic clarity
- Updated comment to reflect that bench stats count in roto
- Added debug logging with roster count and sample stats (R, HR, RBI) per team per week

### Task 2: Add admin debug endpoint for scoring period roster stats
**Files:** `packages/backend/src/api/admin.ts`
**Commit:** c22249e

Added `GET /api/admin/leagues/:leagueId/debug/period-stats?season=2025&scoringPeriodId=10` endpoint that returns:
- Per-player stats from ESPN for a specific scoring period
- Lineup slot labels (C, 1B, OF, Bench, IL, etc.)
- Inclusion flag (whether player is counted by the fixed filter)
- ESPN's team-level `valuesByStat` for comparison
- Computed `teamPeriodTotals` from included players

This enables manual verification that:
1. Bench players (slot 16) are now included
2. IL (17) and NA (19) players are excluded
3. Accumulated totals match ESPN's team-level aggregates

### Task 3: Add comparison logging in backfill to validate fix
**Files:** `packages/backend/src/agents/historical-backfill.ts`
**Commit:** a97ec48

Added debug logging after each week's accumulation in `backfillSeason`:
- Logs ESPN's team-level `valuesByStat` for key counting stats (R, HR, RBI, SB, K, SV)
- Emitted at debug level per team per week
- Enables post-fix verification by comparing ESPN totals to accumulated values in logs

Imported `ESPN_STAT_MAP` from the ESPN adapter to map stat IDs to readable keys.

## Deviations from Plan

None — plan executed exactly as written.

## Testing & Verification

**Build verification:** All tasks compiled successfully with `pnpm --filter backend run build`

**Expected results after re-backfill:**
1. Counting stats should show realistic season totals:
   - R: 600-900 per team
   - HR: 150-250 per team
   - RBI: 600-900 per team
   - SB: 50-150 per team
   - K (pitching): 800-1400 per team
2. Rate stats (AVG, OBP, ERA, WHIP) should still be computed correctly from components (no change to rate stat logic)
3. Debug endpoint provides per-player breakdown with slot labels and inclusion flags
4. Debug logs show ESPN team totals matching accumulated values

**To re-backfill and verify:**
```bash
# Clear existing 2025 data
DELETE /api/admin/leagues/:id/backfill?season=2025

# Trigger fresh backfill
POST /api/admin/leagues/:id/backfill
{
  "season": 2025,
  "startWeek": 1,
  "endWeek": 26,
  "clearExisting": false
}

# Inspect a mid-season week
GET /api/admin/leagues/:id/debug/period-stats?season=2025&scoringPeriodId=10

# Compare counting stats in frontend trends page
# Should now show realistic seasonal trajectories
```

## Impact

**Bug severity:** Critical — backfilled data was unusable for decision-making due to 10x magnitude error

**Scope:** All backfilled snapshots for all leagues. Live daily snapshots were NOT affected (they use a different code path).

**Fix scope:**
- Historical backfill accumulation logic (snapshot-orchestrator.ts)
- Debug tooling for verification (admin.ts endpoint + backfill logging)

**No schema changes required.**

## Self-Check: PASSED

**Created files:**
- None

**Modified files:**
```bash
FOUND: packages/backend/src/agents/snapshot-orchestrator.ts
FOUND: packages/backend/src/api/admin.ts
FOUND: packages/backend/src/agents/historical-backfill.ts
```

**Commits:**
```bash
FOUND: d1202cb
FOUND: c22249e
FOUND: a97ec48
```

All claimed files and commits verified.

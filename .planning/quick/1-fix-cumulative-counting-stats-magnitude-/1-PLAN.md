---
phase: quick-fix
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/agents/snapshot-orchestrator.ts
  - packages/backend/src/agents/historical-backfill.ts
  - packages/backend/src/api/admin.ts
autonomous: true
requirements: [FIX-COUNTING-STATS]

must_haves:
  truths:
    - "After backfill, counting stats (R, HR, RBI, SB, etc.) show realistic season totals (600+ R, 150+ HR per team for a full season)"
    - "Rate stats (AVG, OBP, ERA, WHIP) are still correctly computed from components, not accumulated"
    - "Admin can view raw ESPN roster stats for any scoring period to verify data"
  artifacts:
    - path: "packages/backend/src/agents/snapshot-orchestrator.ts"
      provides: "Fixed writeCurrentStandingsFromPlayerStats with correct roster filter"
    - path: "packages/backend/src/api/admin.ts"
      provides: "Debug endpoint for scoring period roster stats"
  key_links:
    - from: "packages/backend/src/agents/historical-backfill.ts"
      to: "packages/backend/src/agents/snapshot-orchestrator.ts"
      via: "writeCurrentStandingsFromPlayerStats call"
      pattern: "writeCurrentStandingsFromPlayerStats"
---

<objective>
Fix counting stats being ~10x too small in backfilled data, and add a debug endpoint for verifying ESPN per-period stats.

Purpose: Backfilled season data shows counting stats (R, HR, RBI, SB, W, SV, K, etc.) at ~100 instead of ~1000+ for a full season. The root cause is that `writeCurrentStandingsFromPlayerStats` filters to `lineupSlotId <= 15`, which excludes bench players (slot 16). In roto fantasy baseball, ALL rostered players' stats count toward standings, including bench. This filter drops ~30-50% of player stats each week, compounding across the season.

Output: Fixed accumulation logic, debug endpoint, re-backfill instructions.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/backend/src/agents/snapshot-orchestrator.ts
@packages/backend/src/agents/historical-backfill.ts
@packages/backend/src/adapters/espn.ts
@packages/backend/src/api/admin.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix bench player exclusion in writeCurrentStandingsFromPlayerStats</name>
  <files>packages/backend/src/agents/snapshot-orchestrator.ts</files>
  <action>
  In `writeCurrentStandingsFromPlayerStats` (around line 525), the active roster filter is:
  ```
  const activeRoster = rosterEntries.filter((entry: any) => entry.lineupSlotId <= 15);
  ```
  This excludes bench players (lineupSlotId 16). In roto fantasy baseball, bench players' stats DO count toward team totals. Only IL (17) and NA (19) players should be excluded.

  Change the filter to include bench:
  ```typescript
  // Include all rostered players except IL (17) and NA (19) — in roto, bench stats count
  const countingRoster = rosterEntries.filter(
    (entry: any) => entry.lineupSlotId !== undefined && entry.lineupSlotId <= 16
  );
  ```
  Rename the variable from `activeRoster` to `countingRoster` to be more semantically accurate.

  Also update the loop that iterates over roster entries (around line 530) to use the renamed variable:
  ```typescript
  for (const entry of countingRoster) {
  ```

  Update the comment block above the method (lines 451-456) to remove the misleading "filters active roster" text:
  ```
  * Extracts statSplitTypeId=5 (per-period) player stats from all rostered players
  * (excluding IL/NA), aggregates to team-level, and computes rate stats via component math
  ```

  Additionally, add a log line after computing weekComponents for each team to help debug future issues:
  ```typescript
  this.logger?.debug(
    { teamId: team.id, scoringPeriodId, rosterCount: countingRoster.length, weekComponentKeys: Object.keys(weekComponents), sampleStats: { R: weekComponents.R, HR: weekComponents.HR, RBI: weekComponents.RBI } },
    "Week components computed for team",
  );
  ```
  Place this after the `for (const entry of countingRoster)` loop ends but before the cumulative components computation.
  </action>
  <verify>
  Run `cd /Users/jay-work/Code/espn-agent && npx turbo build --filter=backend` to verify TypeScript compiles without errors.
  </verify>
  <done>
  The roster filter includes bench players (lineupSlotId 16) while still excluding IL (17) and NA (19). Variable renamed from `activeRoster` to `countingRoster`. Debug logging added.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add admin debug endpoint for scoring period roster stats</name>
  <files>packages/backend/src/api/admin.ts</files>
  <action>
  Add a new GET endpoint: `GET /api/admin/leagues/:leagueId/debug/period-stats`

  Query params:
  - `season` (required, number) — the season year
  - `scoringPeriodId` (required, number) — the ESPN scoring period to inspect

  This endpoint should:
  1. Look up the league from DB (get espn_league_id, decrypt auth cookies using same pattern as backfill endpoint)
  2. Call `espnAdapter.fetchHistoricalWeek({ leagueId, season, scoringPeriodId, auth })` to get raw ESPN data
  3. For each team in the response, iterate over `team.roster.entries` and extract:
     - Player name, lineupSlotId, and the slot label from ESPN_LINEUP_SLOT_MAP
     - Per-period stats (statSplitTypeId=5 matching the scoringPeriodId)
     - Map each stat using ESPN_STAT_MAP to get readable stat keys
  4. Also extract `team.valuesByStat` as the team-level aggregate for comparison
  5. Return a structured response:
  ```json
  {
    "scoringPeriodId": 10,
    "season": 2025,
    "teams": [
      {
        "teamId": 1,
        "teamName": "Team Name",
        "valuesByStat": { "R": 500, "HR": 120, ... },
        "rosterPlayerCount": 25,
        "playersWithPeriodStats": 18,
        "players": [
          {
            "playerId": 12345,
            "name": "Mike Trout",
            "lineupSlotId": 5,
            "slotLabel": "OF",
            "included": true,
            "periodStats": { "R": 2, "HR": 1, "RBI": 3, ... }
          }
        ],
        "teamPeriodTotals": { "R": 45, "HR": 12, ... }
      }
    ]
  }
  ```

  The `included` field should reflect whether the player would be included by the fixed filter (lineupSlotId <= 16, i.e., NOT IL/NA).

  The `teamPeriodTotals` should sum the periodStats of all `included` players, giving a quick way to verify what the accumulation would compute for this week.

  Import ESPNAdapter, ESPN_STAT_MAP, and ESPN_LINEUP_SLOT_MAP from the espn adapter at the top of admin.ts. Also import ESPNAuthCookies type.

  Use `requireAdmin` middleware and rate limit of 10/minute (same as backfill).

  IMPORTANT: Create the ESPNAdapter instance inside the route handler (not at module level) since it needs the logger from the request. Use `new ESPNAdapter(request.log)`.
  </action>
  <verify>
  Run `cd /Users/jay-work/Code/espn-agent && npx turbo build --filter=backend` to verify TypeScript compiles.
  </verify>
  <done>
  Admin debug endpoint exists at `GET /api/admin/leagues/:leagueId/debug/period-stats?season=2025&scoringPeriodId=10`. Returns per-player stats broken down by roster slot, with team totals, enabling verification that bench players are now included and stats match ESPN's team-level aggregates.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add comparison logging in backfill to validate fix</name>
  <files>packages/backend/src/agents/historical-backfill.ts</files>
  <action>
  In `backfillSeason`, after the `writeCurrentStandingsFromPlayerStats` call completes (around line 155), add a comparison check that logs whether the accumulated values match ESPN's team-level `valuesByStat`.

  After the `await this.db.transaction().execute(...)` block (line 150-155), add:
  ```typescript
  // Log comparison of accumulated vs ESPN team-level totals for key counting stats
  const keyCountingStats = [20, 5, 21, 23, 48, 57]; // R, HR, RBI, SB, K, SV
  for (const team of rawTeams) {
    const vbs = team.valuesByStat || {};
    const sampleStats: Record<string, { espn: number }> = {};
    for (const statId of keyCountingStats) {
      const statInfo = ESPN_STAT_MAP[statId];
      if (statInfo && vbs[statId] !== undefined) {
        sampleStats[statInfo.key] = { espn: Math.round(vbs[statId] * 100) / 100 };
      }
    }
    this.logger?.debug(
      { teamId: team.id, scoringPeriodId, espnTeamTotals: sampleStats },
      "ESPN team-level valuesByStat for comparison",
    );
  }
  ```

  Import `ESPN_STAT_MAP` from the espn adapter at the top of the file:
  ```typescript
  import { ESPNAdapter, type ESPNAuthCookies, ESPN_STAT_MAP } from "../adapters/espn.js";
  ```

  This gives the user a way to compare (in logs at debug level) what ESPN says the team totals should be vs. what the accumulation computed, confirming the fix is working.
  </action>
  <verify>
  Run `cd /Users/jay-work/Code/espn-agent && npx turbo build --filter=backend` to verify TypeScript compiles.
  </verify>
  <done>
  Backfill logs ESPN's team-level counting stat totals alongside accumulated values, enabling post-fix verification by comparing the two during a re-backfill.
  </done>
</task>

</tasks>

<verification>
1. `npx turbo build --filter=backend` compiles without errors
2. After re-running backfill (clear existing data first via `DELETE /api/admin/leagues/:id/backfill?season=2025`, then `POST /api/admin/leagues/:id/backfill`), counting stats should show realistic season totals:
   - R: 600-900 per team
   - HR: 150-250 per team
   - RBI: 600-900 per team
   - SB: 50-150 per team
   - K (pitching): 800-1400 per team
3. Rate stats (AVG, OBP, ERA, WHIP) should still be computed correctly from components
4. Debug endpoint `GET /api/admin/leagues/:id/debug/period-stats?season=2025&scoringPeriodId=10` returns per-player stats with slot labels and inclusion flags
</verification>

<success_criteria>
- Bench players (lineupSlotId 16) are included in stat accumulation
- Only IL (17) and NA (19) players are excluded
- Backend compiles cleanly
- Debug endpoint available for manual verification of ESPN data
- Comparison logging helps confirm accumulated totals match ESPN team-level totals
</success_criteria>

<output>
After completion, create `.planning/quick/1-fix-cumulative-counting-stats-magnitude-/1-SUMMARY.md`
</output>

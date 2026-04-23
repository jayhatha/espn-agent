---
phase: 75-active-stats
verified: 2026-03-26T20:00:00Z
status: gaps_found
score: 4/6 must-haves verified
gaps:
  - truth: "player_period_stats rows are written during daily snapshot (not just backfill)"
    status: partial
    reason: "writePlayerPeriodStats() is correctly implemented and called in executeSnapshot(). However, the shared package dist (packages/shared/dist/types.d.ts) does not include espn_player_id on the Player interface, causing backend TypeScript compilation to fail with multiple errors in snapshot-orchestrator.ts. The code is logically correct but the dist is stale — the shared package was not rebuilt after phase-75 type changes."
    artifacts:
      - path: "packages/shared/dist/types.d.ts"
        issue: "Player interface in dist missing espn_player_id column — dist was not rebuilt after source was updated. Backend tsc fails with TS2353/TS2345/TS2769 errors on espn_player_id references."
      - path: "packages/backend/src/agents/snapshot-orchestrator.ts"
        issue: "Code is correct but tsc compilation fails due to stale dist types."
    missing:
      - "Rebuild shared package: cd packages/shared && pnpm build (or equivalent). This will regenerate dist/types.d.ts with espn_player_id included and fix all backend compile errors."
  - truth: "Lineup page roster section shows On Team stats for each player"
    status: partial
    reason: "PlayerStatLine with label='On Team' renders correctly for tenureStats. However, the YTD stat line in the same section references player.currentStats which is never returned by the roster API — the /roster endpoint only returns projections and tenureStats, not currentStats. The YTD row will always render null (PlayerStatLine returns null when components is null), so users see On Team but not YTD."
    artifacts:
      - path: "packages/backend/src/api/recommendations.ts"
        issue: "GET /api/leagues/:leagueId/teams/:teamId/roster enrichedRoster does not include currentStats field. The RosterPlayer interface in both lineup and waivers pages declares currentStats: Record<string,number>|null but the API never populates it."
      - path: "packages/frontend/src/app/leagues/[id]/lineup/page.tsx"
        issue: "player.currentStats always null — YTD PlayerStatLine never renders. This makes On Team stats the only stat line visible, which is correct for the phase goal but the interface declares currentStats implying it should work."
    missing:
      - "Either: (a) add current_season_stats_json to the roster query and map it to currentStats in enrichedRoster, OR (b) remove currentStats from the RosterPlayer interface and remove the YTD PlayerStatLine from lineup/waivers pages if YTD display is out of scope for this phase."
  - truth: "Waivers page shows On Team stats for drop candidates (roster column) but not for free agents"
    status: partial
    reason: "On Team PlayerStatLine is correctly present in roster column only (free agents column correctly omits it). However, same issue as lineup page: currentStats is always null because the roster API doesn't return it, so YTD stat line never renders for roster players."
    artifacts:
      - path: "packages/frontend/src/app/leagues/[id]/waivers/page.tsx"
        issue: "player.currentStats always null for the same reason as lineup page — API doesn't return it."
    missing:
      - "Same fix as lineup page: add current_season_stats_json to roster API response or remove currentStats references."
---

# Phase 75: Active Stats — Verification Report

**Phase Goal:** Show each player's stat contribution based on roster tenure — populate player_period_stats during daily snapshots, expose tenure-based stats via API, and display "On Team" stats alongside YTD and Proj RoS on lineup and waivers pages
**Verified:** 2026-03-26T20:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                           | Status      | Evidence                                                                                            |
|----|-------------------------------------------------------------------------------------------------|-------------|-----------------------------------------------------------------------------------------------------|
| 1  | player_period_stats rows are written during daily snapshot (not just backfill)                  | PARTIAL     | writePlayerPeriodStats() exists (line 562) and is called in executeSnapshot() (line 244). Blocked from confirming runtime correctness because shared dist is stale — backend tsc fails. |
| 2  | Roster API returns tenureStats with summed components for the period each player was on the team | VERIFIED    | recommendations.ts lines 221-255: query player_period_stats WHERE team_id=teamId, aggregate components_json across scoring periods, return tenureStats per player. |
| 3  | Rate stats in tenureStats are computed from summed components, not averaged                      | VERIFIED    | Only counting stats stored in components_json (ESPN_PERIOD_STAT_MAP). PlayerStatLine calls calculateAVG/calculateERA/calculateWHIP from summed components at render time. |
| 4  | PlayerStatLine renders "On Team" label with tenure-based stats                                  | VERIFIED    | PlayerStatLine.tsx line 12: label union is "YTD" \| "Proj RoS" \| "On Team". Line 49: text-cyan-400 branch for "On Team" label. |
| 5  | Lineup page roster section shows On Team stats for each player                                  | PARTIAL     | On Team PlayerStatLine renders conditionally on player.tenureStats (lines 366-369, 444-447). YTD PlayerStatLine always renders null because currentStats is never returned by the API. |
| 6  | Waivers page shows On Team stats for drop candidates (roster column) but not for free agents    | PARTIAL     | On Team stat line correctly in roster column only (lines 731-734). Free agents column (lines 659-669) correctly omits it. Same currentStats-null issue as lineup page. |

**Score:** 4/6 truths verified (ACTIVE-01 partial, ACTIVE-04 fully verified, ACTIVE-05/ACTIVE-06 partial)

---

## Required Artifacts

| Artifact                                                          | Expected                                        | Status      | Details                                                                                              |
|-------------------------------------------------------------------|-------------------------------------------------|-------------|------------------------------------------------------------------------------------------------------|
| `packages/backend/src/db/migrations/006_add_player_period_stats.sql` | player_period_stats table DDL                | VERIFIED    | Exists. PK (league_id, scoring_period, player_id), team_id FK, components_json JSONB. Correct.       |
| `packages/backend/src/agents/snapshot-orchestrator.ts`           | writePlayerPeriodStats() called in executeSnapshot() | PARTIAL | Method exists (line 562-667), called at line 244. BUT: tsc compilation fails due to stale shared dist. espn_player_id not recognized as a valid Player column. |
| `packages/backend/src/api/recommendations.ts`                    | Roster endpoint with tenureStats                | VERIFIED    | Lines 219-255: player_period_stats queried with team_id filter, components aggregated, tenureStats in enrichedRoster. |
| `packages/frontend/src/components/league/PlayerStatLine.tsx`     | "On Team" label in type union                   | VERIFIED    | Line 12: `"YTD" \| "Proj RoS" \| "On Team"`. Line 49: text-cyan-400 for "On Team". Substantive and wired. |
| `packages/frontend/src/app/leagues/[id]/lineup/page.tsx`         | tenureStats in RosterPlayer, On Team rendering  | VERIFIED    | Line 57: tenureStats in interface. Lines 366-369, 444-447: PlayerStatLine with label="On Team". Wired. |
| `packages/frontend/src/app/leagues/[id]/waivers/page.tsx`        | tenureStats in RosterPlayer, On Team in roster column only | VERIFIED | Line 69-71: tenureStats in RosterPlayer. Lines 731-734: On Team in roster column. No On Team in FA column (lines 659-669). |
| `packages/shared/src/types.ts`                                   | PlayerPeriodStats interface                     | VERIFIED    | Lines 239-246: interface exists with correct fields. Source is correct.                              |
| `packages/backend/src/db/schema.ts`                              | player_period_stats in Database interface       | VERIFIED    | Line 43: `player_period_stats: PlayerPeriodStats` present.                                           |

---

## Key Link Verification

| From                              | To                         | Via                                              | Status      | Details                                                                                     |
|-----------------------------------|----------------------------|--------------------------------------------------|-------------|----------------------------------------------------------------------------------------------|
| snapshot-orchestrator.ts          | player_period_stats table  | insertInto player_period_stats in executeSnapshot | PARTIAL     | Logic correct. Call at line 244. BUT tsc fails — shared dist Player type missing espn_player_id. |
| recommendations.ts                | player_period_stats table  | SQL aggregation WHERE team_id matches             | VERIFIED    | Lines 221-243: selectFrom("player_period_stats").where("team_id","=",teamId). Sum loop correct. |
| lineup/page.tsx                   | PlayerStatLine             | label="On Team"                                  | VERIFIED    | Lines 368, 446: `<PlayerStatLine components={player.tenureStats} label="On Team" .../>` |
| waivers/page.tsx (roster column)  | PlayerStatLine             | label="On Team"                                  | VERIFIED    | Line 731: `<PlayerStatLine components={player.tenureStats} label="On Team" .../>` |
| roster API → currentStats → YTD   | PlayerStatLine label="YTD" | currentStats field in API response               | NOT_WIRED   | API enrichedRoster (lines 246-256) does not include currentStats. Frontend references player.currentStats which is always undefined/null. YTD lines never render. |
| trade partner rosters endpoint    | player_projection          | proj.projections_run_id join                     | NOT_WIRED   | Line 686: `innerJoin("projections_run as run", "proj.run_id", "run.id")` — wrong column name. Should be proj.projections_run_id. This endpoint returns empty projections at runtime. (Pre-existing bug, not fixed as claimed in SUMMARY.) |

---

## Data-Flow Trace (Level 4)

| Artifact                  | Data Variable | Source                              | Produces Real Data         | Status      |
|---------------------------|---------------|-------------------------------------|----------------------------|-------------|
| lineup/page.tsx           | tenureStats   | GET /roster API → player_period_stats | Yes — when snapshots exist | FLOWING     |
| waivers/page.tsx          | tenureStats   | GET /roster API → player_period_stats | Yes — when snapshots exist | FLOWING     |
| lineup/page.tsx           | currentStats  | GET /roster API enrichedRoster       | No — field never returned  | DISCONNECTED |
| waivers/page.tsx          | currentStats  | GET /roster API enrichedRoster       | No — field never returned  | DISCONNECTED |

---

## Behavioral Spot-Checks

Backend is not runnable in isolation (requires DB), so API checks are skipped. Module-level checks:

| Behavior                                              | Command                                                                         | Result                       | Status  |
|-------------------------------------------------------|---------------------------------------------------------------------------------|------------------------------|---------|
| Backend TypeScript compiles                           | npx tsc --noEmit -p packages/backend/tsconfig.json                              | 13 errors in snapshot-orchestrator.ts, historical-backfill.ts, projections-ingest.ts | FAIL    |
| Frontend TypeScript compiles                          | npx tsc --noEmit -p packages/frontend/tsconfig.json                             | No output (passed)            | PASS    |
| writePlayerPeriodStats exists in orchestrator         | grep "writePlayerPeriodStats" snapshot-orchestrator.ts                          | Found at line 562             | PASS    |
| player_period_stats migration exists                  | ls migrations/006_add_player_period_stats.sql                                   | Exists                        | PASS    |
| On Team label in PlayerStatLine union                 | grep '"On Team"' PlayerStatLine.tsx                                             | Found at line 12              | PASS    |
| tenureStats in recommendations.ts roster endpoint     | grep "tenureStats" recommendations.ts                                           | Found at lines 221-255        | PASS    |
| currentStats returned by roster API                  | grep "currentStats" recommendations.ts (in enrichedRoster)                     | NOT FOUND                     | FAIL    |
| proj.run_id bug in trade partner rosters endpoint    | grep "proj.run_id" recommendations.ts                                           | Found at line 686 (wrong col) | FAIL    |

---

## Requirements Coverage

The PLAN frontmatter for plans 75-01 and 75-02 declares requirements ACTIVE-01 through ACTIVE-06. These IDs do NOT appear in `.planning/REQUIREMENTS.md` — they are absent from the tracking table entirely. The IDs appear to be ad-hoc identifiers created for this phase without being registered in the canonical requirements file.

| Requirement | Source Plan | Description (inferred from plan goals)                              | Status          | Evidence                                                        |
|-------------|------------|---------------------------------------------------------------------|-----------------|-----------------------------------------------------------------|
| ACTIVE-01   | 75-01      | player_period_stats populated during daily snapshot                 | PARTIAL         | Code exists, backend tsc fails due to stale shared dist         |
| ACTIVE-02   | 75-01      | Roster API returns tenureStats per player                           | VERIFIED        | recommendations.ts lines 219-255                                |
| ACTIVE-03   | 75-01      | Rate stats computed from component sums, not averaged               | VERIFIED        | Only counting stats stored; calculateAVG/ERA called at render   |
| ACTIVE-04   | 75-02      | PlayerStatLine supports "On Team" label with cyan-400 styling       | VERIFIED        | PlayerStatLine.tsx lines 12, 49                                 |
| ACTIVE-05   | 75-02      | Lineup page shows On Team stats for roster players                  | PARTIAL         | On Team renders; YTD always null (currentStats not returned)    |
| ACTIVE-06   | 75-02      | Waivers page shows On Team for drop candidates, not free agents     | PARTIAL         | On Team in roster column correct; YTD always null               |

**ORPHANED requirements:** ACTIVE-01 through ACTIVE-06 are not registered in REQUIREMENTS.md. The tracking table has no entry for Phase 75 or any ACTIVE-* IDs. These requirements should be added to REQUIREMENTS.md for traceability.

---

## Anti-Patterns Found

| File                                                    | Line | Pattern                                        | Severity    | Impact                                                                                     |
|---------------------------------------------------------|------|------------------------------------------------|-------------|--------------------------------------------------------------------------------------------|
| `packages/backend/src/api/recommendations.ts`           | 686  | `proj.run_id` (wrong column name)              | Warning     | Trade partner rosters endpoint returns null projections at runtime (JOIN fails silently)    |
| `packages/shared/dist/types.d.ts`                       | 55   | Player interface missing espn_player_id         | Blocker     | Stale dist causes 13 TypeScript compile errors in backend; snapshot-orchestrator.ts won't compile |
| `packages/frontend/src/app/leagues/[id]/lineup/page.tsx` | 56   | `currentStats` declared but never populated    | Warning     | YTD stat line declared but never renders (API doesn't return the field)                    |
| `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` | 66  | `currentStats` declared but never populated    | Warning     | Same as lineup page — YTD line always null                                                 |

---

## Human Verification Required

### 1. Tenure stats accuracy after snapshot run

**Test:** Trigger a daily snapshot for a league. Query `SELECT * FROM player_period_stats LIMIT 10`. Verify rows exist with non-empty components_json values (e.g., HR, R, RBI for batters).
**Expected:** Rows with counting stats matching ESPN player stats for the current scoring period.
**Why human:** Requires a running database and ESPN credentials to trigger a real snapshot.

### 2. On Team stat line visual presentation

**Test:** Open lineup page with a team that has run at least one snapshot. Verify that the On Team stat line appears in cyan text below the player name for both hitters and pitchers.
**Expected:** Cyan "On Team" label with counting stats (HR, R, RBI, SB, AVG, OBP for hitters; W, SV, K, ERA, WHIP for pitchers). YTD line absent (as API doesn't return currentStats).
**Why human:** Visual layout and conditional rendering requires browser to verify.

### 3. Waivers page "On Team" display for roster column only

**Test:** Open waivers page in Manual Eval mode. Verify the roster (drop) column shows Proj RoS, On Team, and YTD stat lines per player. Verify the free agents (add) column shows only Proj RoS and YTD (no On Team).
**Expected:** Drop column: three stat lines. Add column: two stat lines (no cyan On Team).
**Why human:** Requires visual inspection of rendered UI with real data.

---

## Gaps Summary

### Gap 1 (Blocker): Stale shared package dist

The shared package's compiled output (`packages/shared/dist/types.d.ts`) has a `Player` interface that does not include the `espn_player_id` column. The source (`packages/shared/src/types.ts` line 79) does include it, but the dist was not rebuilt. This causes 13 TypeScript compilation errors in the backend across `snapshot-orchestrator.ts`, `historical-backfill.ts`, and `projections-ingest.ts`.

**Fix:** Run `pnpm build` (or `tsc`) in `packages/shared/` to regenerate the dist. This is a one-command fix.

Note: Most of the 13 errors appear to be pre-existing issues unrelated to phase 75 (e.g., `historical-backfill.ts` calling `writeCurrentStandingsFromPlayerStats` which was refactored away, `projections-ingest.ts` with a missing `id` field). Phase 75 specifically added `espn_player_id` references in `snapshot-orchestrator.ts` which fail because the dist doesn't expose that column. The stale dist is the shared root cause.

### Gap 2 (Warning): currentStats missing from roster API response

The frontend `RosterPlayer` interface in both lineup and waivers pages declares `currentStats: Record<string, number> | null`. Both pages render a `PlayerStatLine` with `label="YTD"` conditional on this field. However, the roster API endpoint (`GET /api/leagues/:leagueId/teams/:teamId/roster`) never includes `currentStats` in `enrichedRoster` — the plan's Task 2 only added `tenureStats`, not `currentStats`.

The YTD stat line is dead code — it will never render for roster players. This does not break the phase 75 goal (tenure stats display) but creates confusing dead UI declarations. Either add `current_season_stats_json` to the roster query/response, or remove the `currentStats` references from the frontend.

### Gap 3 (Info): ACTIVE-* requirement IDs not registered in REQUIREMENTS.md

Plans 75-01 and 75-02 declare requirements ACTIVE-01 through ACTIVE-06, but these IDs do not appear in `.planning/REQUIREMENTS.md`. They are invisible to the requirements tracking table. These should be added to REQUIREMENTS.md under a new section (e.g., "Active/Tenure Stats") and mapped to Phase 75.

### Gap 4 (Info): proj.run_id bug in trade partner rosters endpoint

Line 686 of `recommendations.ts` uses `proj.run_id` instead of `proj.projections_run_id` in the JOIN for the trade partner rosters endpoint. The SUMMARY claimed this was fixed in Task 2, but only the `/roster` endpoint was fixed (line 199). This is a pre-existing bug that was not fully remediated.

---

_Verified: 2026-03-26T20:00:00Z_
_Verifier: Claude (gsd-verifier)_

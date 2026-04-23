---
phase: 73-show-current-and-projected-stats-for-each-player-on-waivers-and-roster-pages
verified: 2026-03-25T08:00:00Z
status: human_needed
score: 9/9 must-haves verified
human_verification:
  - test: "Waivers page manual eval — free agent stat lines render"
    expected: "Each free agent shows a 'Proj RoS' line (indigo label, monospace numbers) below their name. Hitters show HR/R/RBI/SB/AVG/OBP; pitchers show W/SV/K/ERA/WHIP. YTD line appears only when currentStats is non-null (most free agents will not show it)."
    why_human: "Visual layout and label color (text-shell-accent indigo vs text-content-tertiary gray) require browser rendering to verify."
  - test: "Waivers page manual eval — roster drop list stat lines render"
    expected: "Each roster player in the drop list shows the same Proj RoS and YTD stat line pattern as free agents."
    why_human: "Visual rendering cannot be confirmed by static analysis."
  - test: "Lineup page 'Your Roster' section renders hitter and pitcher tables"
    expected: "Below the lineup optimizer section a 'Your Roster' heading appears, followed by a 'Hitters — Proj RoS' table (HR, R, RBI, SB, AVG, OBP columns) and a 'Pitchers — Proj RoS' table (W, SV, K, ERA, WHIP columns). Stat columns are in monospace font. Rate stats show '--' when IP=0 or AB=0."
    why_human: "Table layout, column alignment, and monospace font require visual inspection."
  - test: "Rate stat null guards — '--' not '0.00'"
    expected: "A pitcher with 0 projected IP shows '--' for ERA and WHIP, not '0.00'. A hitter with 0 AB shows '--' for AVG and OBP."
    why_human: "Requires real data where IP=0 or AB=0 to be present in the snapshot to observe the guard in action."
---

# Phase 73: Show Current and Projected Stats for Each Player on Waivers and Roster Pages — Verification Report

**Phase Goal:** Managers see position-aware projected RoS stats and YTD stats inline below each player on the waivers page (manual eval) and in a roster stats section on the lineup page
**Verified:** 2026-03-25T08:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Backend roster endpoint returns `currentStats` field for each player | VERIFIED | `recommendations.ts` line 266 selects `"player.current_season_stats_json"`, line 312 maps to `currentStats: player.current_season_stats_json \|\| null` |
| 2 | Backend free-agents endpoint returns `currentStats` field for each player | VERIFIED | `recommendations.ts` line 145 selects `"p.current_season_stats_json"`, line 185 maps to `currentStats: fa.current_season_stats_json \|\| null` |
| 3 | `PlayerStatLine` component renders position-aware hitter or pitcher stats from components | VERIFIED | File exists at `packages/frontend/src/components/league/PlayerStatLine.tsx`; exports `PlayerStatLine`; `isPitcher()` branches on SP/RP/P positions |
| 4 | `PlayerStatLine` displays '--' for null stats, 0 IP ERA, and 0 AB AVG — never '0.00' or '.000' | VERIFIED | `formatRate()` at line 25–36 checks `denom === 0` and returns `"--"`; `ip > 0` guard before calling `calculateERA`/`calculateWHIP`; `ab > 0` guard before `calculateAVG`/`calculateOBP` |
| 5 | User sees projected RoS stats and YTD stats below each free agent on the waivers manual eval page | VERIFIED (code) | `waivers/page.tsx` line 657–666: two `<PlayerStatLine>` elements with `label="Proj RoS"` and `label="YTD"` inside `px-3 pb-2` wrapper; `PlayerStatLine` returns null when components is null, so YTD is omitted when not present |
| 6 | User sees projected RoS stats and YTD stats below each roster player in the waivers drop list | VERIFIED (code) | `waivers/page.tsx` line 722–731: same `PlayerStatLine` pattern for roster drop list |
| 7 | User sees a 'Your Roster' section on the lineup page with separate Hitters and Pitchers stat tables | VERIFIED (code) | `lineup/page.tsx` line 328–: `"Your Roster"` heading; IIFE pattern for `"Hitters — Proj RoS"` and `"Pitchers — Proj RoS"` tables; both use `isPitcher()` to filter |
| 8 | Stat lines omit entirely when projections or currentStats are null — no placeholder rows | VERIFIED | `PlayerStatLine` returns null at line 43 when `components` is null; in lineup tables, `proj ? formatStat(...) : "--"` per column — empty rows do not appear |
| 9 | Rate stats computed via formulas.ts — no hand-rolled math | VERIFIED | `PlayerStatLine.tsx` imports `calculateAVG`, `calculateOBP`, `calculateERA`, `calculateWHIP` from `@espn-fantasy/shared`; `lineup/page.tsx` imports same four functions; grep confirms no `H / AB` or `9 * ER / IP` patterns in any modified file |

**Score:** 9/9 truths verified (automated) — visual confirmation pending human review

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/api/recommendations.ts` | `currentStats` field in roster and free-agents API responses | VERIFIED | 4 occurrences of `current_season_stats_json` (2 selects + 2 enriched maps); TypeScript compiles cleanly |
| `packages/frontend/src/components/league/PlayerStatLine.tsx` | Shared position-aware stat line component | VERIFIED | 84 lines; exports `PlayerStatLine`; imports 4 formula functions; `isPitcher`, `formatStat`, `formatRate` all present |
| `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` | Waivers page with inline stat lines on free agents and roster players | VERIFIED | Imports `PlayerStatLine`; `FreeAgent` and `RosterPlayer` interfaces include `currentStats`; 4 `<PlayerStatLine` JSX elements present (2 free agent + 2 roster) |
| `packages/frontend/src/app/leagues/[id]/lineup/page.tsx` | Lineup page with roster stats section showing hitter and pitcher tables | VERIFIED | Imports `PlayerStatLine` + 4 formula functions; `RosterPlayer` interface with `currentStats`; `getTeamRoster` query; "Your Roster" section with IIFE hitters/pitchers blocks |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `recommendations.ts` | `player.current_season_stats_json` | Kysely select in roster + free-agents queries | WIRED | `"p.current_season_stats_json"` at line 145; `"player.current_season_stats_json"` at line 266; both mapped to `currentStats` in enriched objects |
| `PlayerStatLine.tsx` | `@espn-fantasy/shared` formulas | `calculateAVG`, `calculateOBP`, `calculateERA`, `calculateWHIP` imports | WIRED | Lines 3–8 import all four functions; functions called in hitter and pitcher branches |
| `waivers/page.tsx` | `PlayerStatLine.tsx` | import + render in free agent and roster lists | WIRED | `import { PlayerStatLine } from "@/components/league/PlayerStatLine"` at line 18; 4 render sites confirmed |
| `waivers/page.tsx` | `/api/leagues/:id/free-agents` | TanStack Query fetch, consumes `currentStats` field | WIRED | `api.getFreeAgents()` in `useQuery` at line 194; `freeAgentsData.freeAgents.map(player => ...)` uses `player.currentStats` at line 663 |
| `lineup/page.tsx` | `/api/leagues/:id/teams/:teamId/roster` | TanStack Query fetch via `api.getTeamRoster` | WIRED | `api.getTeamRoster(parseInt(leagueId, 10), selectedTeamId)` at line 133; `rosterData.roster` consumed in "Your Roster" section at line 328 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `PlayerStatLine.tsx` | `components` prop | Passed from parent (projections or currentStats) | Depends on parent | Component is a pure renderer — data flows from API response |
| `waivers/page.tsx` | `freeAgentsData.freeAgents[n].currentStats` | `recommendations.ts` → `p.current_season_stats_json` → DB column `player.current_season_stats_json` | Real (populated by `PlayerPoolSyncAgent`; null for unsynced players is expected) | FLOWING |
| `waivers/page.tsx` | `rosterData.roster[n].projections` | `recommendations.ts` → `projMap.get(player.player_id)` from `player_projection` | Real DB query | FLOWING |
| `lineup/page.tsx` | `rosterData.roster` | `api.getTeamRoster()` → `/api/leagues/:id/teams/:teamId/roster` → `enrichedRoster` | Real DB query joining `team_roster_snapshot` + `player` + projections | FLOWING |
| `lineup/page.tsx` | `player.currentStats` in table rows | Same `current_season_stats_json` column | Real; null values guarded with `player.currentStats && (...)` | FLOWING |

DB column `player.current_season_stats_json` is defined in migration `007_add_player_pool_columns.sql` (line 3) and declared as `current_season_stats_json?: Record<string, number> | null` in `packages/shared/src/types.ts` (line 92). The Kysely schema references the `player` table via the `Player` type.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `PlayerStatLine` export exists | `node -e "content.includes('export function PlayerStatLine')"` | `EXPORT_OK` | PASS |
| Backend type-check | `pnpm --filter backend exec tsc --noEmit` | exit 0 (no output) | PASS |
| Frontend type-check | `pnpm --filter frontend exec tsc --noEmit` | exit 0 (no output) | PASS |
| `current_season_stats_json` in recommendations.ts (4 occurrences) | `grep -c "current_season_stats_json" recommendations.ts` | `4` | PASS |
| No hand-rolled rate math | grep for `H / AB` and `9 \* ER` in modified files | No matches | PASS |
| Commits from SUMMARY exist | `git log --oneline a4bca22 2773811 2c29c11 8ec7dfc` | All 4 found | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description (Derived) | Status | Evidence |
|-------------|-------------|----------------------|--------|----------|
| PSTAT-01 | 73-01-PLAN.md | Backend roster endpoint returns `currentStats` | SATISFIED | `recommendations.ts` roster query selects and returns `current_season_stats_json` |
| PSTAT-02 | 73-01-PLAN.md | Backend free-agents endpoint returns `currentStats` | SATISFIED | `recommendations.ts` free-agents query selects and returns `current_season_stats_json` |
| PSTAT-03 | 73-01-PLAN.md | `PlayerStatLine` shared component renders position-aware stats with null guards | SATISFIED | File verified substantive at all 4 levels |
| PSTAT-04 | 73-02-PLAN.md | Waivers page free agent list shows Proj RoS stat lines | SATISFIED (code) | 2 `<PlayerStatLine>` elements in free agent list; visual confirmation pending |
| PSTAT-05 | 73-02-PLAN.md | Waivers page roster drop list shows Proj RoS and YTD stat lines | SATISFIED (code) | 2 `<PlayerStatLine>` elements in roster drop list; visual confirmation pending |
| PSTAT-06 | 73-02-PLAN.md | Lineup page shows "Your Roster" stats section with separate hitter/pitcher tables | SATISFIED (code) | "Your Roster" section with "Hitters — Proj RoS" and "Pitchers — Proj RoS" tables; visual confirmation pending |

**Orphaned requirement IDs:** PSTAT-01 through PSTAT-06 are referenced in ROADMAP.md (line 196) and both PLAN files, but are **not registered in `.planning/REQUIREMENTS.md`**. The traceability table in REQUIREMENTS.md ends at TREND-05 (Phase 70) and contains no PSTAT entries and no Phase 73 row. These are documentation-only orphans — the implementation is complete — but REQUIREMENTS.md should be updated to include the PSTAT requirements section and traceability rows for Phase 73.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lineup/page.tsx` | 335, 408 | `return null` in IIFE when hitters/pitchers list is empty | Info | Correct guard pattern — not a stub. Returns null only when the filtered list is genuinely empty |
| `PlayerStatLine.tsx` | 43 | `return null` when `components` is null | Info | Intentional design per plan — callers are responsible for conditional rendering. Not a stub |

No blockers. No FIXME/TODO/PLACEHOLDER comments found in any modified file. No hand-rolled rate math detected.

### Human Verification Required

#### 1. Waivers Page — Free Agent Stat Lines

**Test:** Navigate to `/leagues/[id]/waivers`, switch to "Manual Eval" mode, observe the free agent list.
**Expected:** Each free agent card shows a compact one-line "Proj RoS" stat row (indigo label, monospace numbers) immediately below the player name. Hitters display HR/R/RBI/SB/AVG/OBP; pitchers display W/SV/K/ERA/WHIP. A "YTD" line (gray label) appears only for players with current season stats — most free agents will not have it, which is expected. Rate stats show "--" when IP=0 (not "0.00").
**Why human:** Visual label colors (`text-shell-accent` = indigo, `text-content-tertiary` = gray), monospace font rendering, and correct stat ordering require browser inspection.

#### 2. Waivers Page — Roster Drop List Stat Lines

**Test:** In the same "Manual Eval" mode, observe the right-column "Drop from Your Roster" list.
**Expected:** Same Proj RoS + YTD stat line pattern as the free agent list. Roster players are more likely to have YTD stats visible.
**Why human:** Visual rendering cannot be confirmed statically.

#### 3. Lineup Page — "Your Roster" Section

**Test:** Navigate to `/leagues/[id]/lineup` (Roster in nav), scroll below the lineup optimizer section.
**Expected:** A "Your Roster" heading appears, followed by a "Hitters — Proj RoS" card (columns: Player, Pos, Team, HR, R, RBI, SB, AVG, OBP) and a "Pitchers — Proj RoS" card (columns: Player, Pos, Team, W, SV, K, ERA, WHIP). Stat columns use JetBrains Mono font. Players without projections show "--" for all stat columns. YTD sub-row appears under player names that have `currentStats`.
**Why human:** Table layout, column alignment, and font-mono rendering require visual inspection.

#### 4. Rate Stat Null Guards in Practice

**Test:** In either page, find a pitcher with 0 projected IP or a player newly added mid-season with no projection data.
**Expected:** ERA and WHIP show "--" rather than "0.00". AVG and OBP show "--" for 0 AB.
**Why human:** Requires the right data condition (IP=0 or AB=0) to be present in the current snapshot to observe the guard in action.

### Gaps Summary

No automated gaps. All 9 observable truths pass code-level verification. The 4 items above require visual/human confirmation but are not blockers — the implementation is complete and all guards are in place.

One documentation-only issue: PSTAT-01 through PSTAT-06 are not registered in `.planning/REQUIREMENTS.md`. Phase 73 has no entry in the traceability table. This is a documentation debt, not an implementation gap.

---

_Verified: 2026-03-25T08:00:00Z_
_Verifier: Claude (gsd-verifier)_

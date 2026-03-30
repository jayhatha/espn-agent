---
status: awaiting_human_verify
trigger: "on-team-stats-zeros: The 'on team' stats on the roster page are all 0s. They have never shown real values since Phase 75 (active stats) shipped."
created: 2026-03-29T00:00:00Z
updated: 2026-03-29T00:02:00Z
---

## Current Focus

hypothesis: Two bugs: (1) empty {} objects stored in player_period_stats when ESPN stats are all-zero for a period, (2) the API returns tenureStats={} (truthy empty object) instead of null for players with only empty-component rows, causing PlayerStatLine to render with all 0s.
test: Fix both in snapshot-orchestrator.ts (skip empty components) and recommendations.ts (null-check aggregated object keys)
expecting: Players with no real stats will show no "On Team" line; players with real stats will show correct values
next_action: apply fix to both files

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Roster page shows each player's stat contributions while on the team (based on roster tenure, not full season totals)
actual: All "on team" stat values display as 0
errors: No error messages reported
reproduction: View any team's roster page - all "on team" columns show 0
started: Has never worked - always been 0s since Phase 75 shipped

## Eliminated

- hypothesis: player_period_stats table missing snapshot_date column (migration 006 conflict)
  evidence: DB confirmed table has snapshot_date column from migration 009. Table exists with 33,919 rows.
  timestamp: 2026-03-29

- hypothesis: Backend TypeScript compilation failure (Phase 75 verification gap)
  evidence: `tsc --noEmit` exits clean. espn_player_id references removed post-migration-016.
  timestamp: 2026-03-29

- hypothesis: player_period_stats has no data (snapshot never populates it)
  evidence: DB has 33,919 rows, 33,439 non-empty, with data from both 2025 season and current 2026 season (periods 3-5).
  timestamp: 2026-03-29

- hypothesis: Wrong query (snapshot_date column missing or wrong filter)
  evidence: Query executes correctly. The seasonStart filter (>= 2026-01-01) correctly excludes 2025 data.
  timestamp: 2026-03-29

## Evidence

- timestamp: 2026-03-29
  checked: packages/frontend/src/app/leagues/[id]/lineup/page.tsx
  found: "On Team" PlayerStatLine renders conditional on `player.tenureStats`. Source of truth for this feature is the lineup page (and waivers page), NOT the roster overview section.
  implication: tenureStats must be non-null to show the "On Team" line. If it's null, nothing renders. User sees 0s, so tenureStats IS non-null.

- timestamp: 2026-03-29
  checked: player_period_stats table in DB
  found: 33,919 rows. 480 rows have components_json = '{}'. Many non-empty rows have real stats like {"H": 1, "R": 1, "AB": 2, "HR": 1, "TB": 4, "RBI": 1} for James Wood.
  implication: Real data exists. The issue is that {} rows are included in tenure aggregation.

- timestamp: 2026-03-29
  checked: recommendations.ts lines 235-258 (tenure aggregation + enrichedRoster)
  found: `tenureStats: tenureMap.get(player.player_id) || null`. An empty object {} is TRUTHY in JavaScript, so `{} || null = {}`. Players with only empty-component rows get tenureStats={} not null.
  implication: PlayerStatLine renders with tenureStats={} and shows all 0s for counting stats, "--" for rate stats.

- timestamp: 2026-03-29
  checked: snapshot-orchestrator.ts writePlayerPeriodStats (~line 643)
  found: No guard before upsert. If `components = {}` (all ESPN stats were 0 or unmapped), the empty object is still upserted into player_period_stats.
  implication: These empty rows pollute the tenure aggregation, making tenureStats={} for players who had games but all-zero stat lines (e.g., 0-AB day, or missing period data).

- timestamp: 2026-03-29
  checked: DB data for team 201, season 2026
  found: Rafael Devers has only {"AB": 4, "SO": 3} for period 3. No H, R, HR, RBI recorded. Freddie Freeman has {} only. Most players have partial data because (a) early season = few games, (b) some periods produce {} rows when ESPN period stats don't have non-zero values.
  implication: The feature CAN work (Albies has HR:1, R:1 showing) but most players show near-zero stats because it's day 3-4 of the 2026 season, plus {} rows create false tenureStats entries.

## Resolution

root_cause: Two connected bugs: (1) snapshot-orchestrator.ts does not skip storing empty {} components_json (when ESPN period stats are all-zero for a period - e.g., no game or all stats are zero), creating spurious rows that make tenureStats truthy when it should be null. (2) recommendations.ts uses `tenureMap.get(id) || null` but {} is truthy in JS, so players with only-empty-component rows get tenureStats={} causing PlayerStatLine to render with all 0s instead of being hidden.
fix: (1) Added `if (Object.keys(components).length === 0) continue;` guard in writePlayerPeriodStats before the upsert. (2) Changed tenureStats assignment in recommendations.ts from `tenureMap.get(id) || null` to an IIFE that checks `Object.keys(agg).length > 0`. (3) Deleted the 480 existing empty {} rows from player_period_stats.
verification: TypeScript compiles clean. DB query for team 201 now returns 22 rows with real stats only (no empty {} rows). Players like Freeman/Jansen/Yamamoto with no accumulated stats will correctly return tenureStats=null so PlayerStatLine is hidden. Players like Albies/Montgomery with real stats show correct values.
files_changed:
  - packages/backend/src/agents/snapshot-orchestrator.ts
  - packages/backend/src/api/recommendations.ts

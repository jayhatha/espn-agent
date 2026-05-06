# Phase 85: Waiver Page Advanced Stats Columns — Research

**Phase:** 85
**Researched:** 2026-05-04

## Problem Statement

The waiver page manual-evaluation tables currently show ownership, PitcherList rank, and projection-derived basic stats. They do not expose quality-of-contact or deeper run-prevention metrics, and the backend data model only carries basic ESPN component stats.

## Existing Architecture

### Free-agent endpoint

- `packages/backend/src/api/recommendations.ts` fetches live free agents from ESPN, enriches them with projections, and returns them to the waiver page
- The endpoint did **not** return `currentStats` even though the frontend `FreeAgent` type already expected it

### Roster endpoint

- The roster endpoint already returns `currentStats` from `player.current_season_stats_json`
- The same file already performs other external enrichments (PitcherList SP ranks), so adding another adapter here fits the existing pattern

### Stored stats coverage

- `player_pool_sync.ts` writes only ESPN counting/rate components into `current_season_stats_json`
- Available batter components include `AB`, `H`, `HR`, `TB`, `BB`, `HBP`, `SF`, `SO`
- Available pitcher components include `IP`, `OUTS`, `HA`, `BBA`, `ER`, `HRA`, `K`, `W`, `SV`

These are sufficient for:

- `BABIP`
- `ISO`
- `K/9`
- approximate `K-BB%`
- approximate `FIP`

They are **not** sufficient for exact:

- `xBA`
- `xSLG`
- `xwOBA`
- `xERA`
- `xFIP`
- `SIERA`

## External Source Findings

### Baseball Savant

Public CSV exports are accessible from the backend environment:

- Batter expected stats:
  - `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=YYYY&position=&team=&min=0&csv=true`
  - Columns include `"last_name, first_name"`, `est_ba`, `est_slg`, `est_woba`
- Pitcher expected stats:
  - `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=YYYY&position=&team=&min=0&csv=true`
  - Columns include `"last_name, first_name"` and `xera`

### FanGraphs / pybaseball Fangraphs datasource

- `pybaseball` exposes `pitching_stats()` and `batting_stats()` via its Fangraphs datasource
- The datasource relies on Fangraphs HTML table scraping
- Direct probes to Fangraphs in this environment hit Cloudflare challenge pages, making `xFIP` and `SIERA` unreliable for server-side runtime use right now

## Recommended Approach

Use a two-part enrichment model on the existing waiver endpoints:

1. **Exact Statcast expected stats from Baseball Savant**
   - Hitters: `xBA`, `xSLG`, `xwOBA`
   - Pitchers: `xERA`

2. **Derived metrics from stored ESPN components**
   - Hitters: `BABIP`, `ISO`
   - Pitchers: `K/9`, `K-BB%`, `FIP`

3. **Graceful degradation for blocked metrics**
   - Return `null` for `xFIP` and `SIERA`
   - Render `--` in the UI instead of invented values

## Implementation Notes

- Add a dedicated backend adapter for advanced stats with a 6-hour in-memory cache
- Match Savant rows by normalized player name only; if a name is duplicated in the export, do not guess
- Enrich both free-agent and roster responses with a shared `advancedStats` object
- Keep the frontend change local to the waiver page manual-eval tables

## RESEARCH COMPLETE

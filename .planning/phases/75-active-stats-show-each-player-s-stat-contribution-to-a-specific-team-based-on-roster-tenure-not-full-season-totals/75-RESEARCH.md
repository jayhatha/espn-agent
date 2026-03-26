# Phase 75: Active Stats — Research

**Phase:** 75
**Researched:** 2026-03-26

## Problem Statement

Currently, player stats shown on roster/waivers pages use `player.current_season_stats_json` — full-season totals regardless of which team the player was on. When a player is traded mid-season, their stats include production from their previous team. Phase 75 shows only stats accumulated while on the current team's roster ("active stats" / "roster tenure stats").

## Existing Architecture

### Data Already Available

1. **`team_roster_snapshot`** — Tracks which players are on which teams on each snapshot date
   - PK: `(league_id, snapshot_date, team_id, player_id)`
   - Fields: `roster_status`, `roster_slot`, `acquisition_type`
   - Populated daily by `SnapshotOrchestratorAgent.writePlayersAndRosters()`

2. **`player_period_stats`** — Per-player, per-period stats with team association
   - PK: `(league_id, scoring_period, player_id)`
   - Fields: `team_id`, `lineup_slot_id`, `components_json` (JSONB with raw stat components)
   - Currently only populated by historical backfill, NOT by daily snapshot

3. **`team_daily_category_totals`** — Team aggregates per category per day
   - Has `components_json` column but it's always set to `null` (line 642 in snapshot-orchestrator.ts)

### Current Stat Display Flow

1. API endpoint `GET /api/leagues/:id/teams/:teamId/roster` (recommendations.ts:254-323)
2. Returns `player.current_season_stats_json` — full-season stats
3. Frontend `PlayerStatLine` component renders these as "YTD" stats

### Key Gap

No mechanism exists to compute "stats while on this team" from the daily snapshots. The `player_period_stats` table has the right schema but isn't populated during normal snapshot flow.

## Recommended Approach

### Option A: Compute from `player_period_stats` (Recommended)

**How it works:**
1. Ensure `player_period_stats` is populated during daily snapshots (not just backfill)
2. To get "stats while on team X": query `player_period_stats` WHERE `team_id = X` and sum `components_json` across all scoring periods
3. Expose via new API endpoint or extend existing roster endpoint

**Pros:**
- Leverages existing table schema
- Per-period granularity enables date-range queries
- `team_id` association already exists in the table

**Cons:**
- Need to populate `player_period_stats` during daily snapshot (currently only backfill does this)
- ESPN may not provide per-player period stats in every API call

### Option B: Derive from roster snapshot + full-season deltas

**How it works:**
1. Find the date a player joined the team (first appearance in `team_roster_snapshot` for that team)
2. Get team category totals on join date and current date
3. Diff = contribution while on team

**Pros:**
- Uses data already being captured daily
- No new table population needed

**Cons:**
- Only works for team totals, not per-player breakdown
- Can't isolate one player's contribution from the team total

### Option C: Compute at API response time from roster snapshots

**How it works:**
1. Query `team_roster_snapshot` to find all dates player was on team
2. For each scoring period where player was on roster, look up their stats
3. Sum across periods

**This is really a variant of Option A** — needs `player_period_stats` populated.

## Recommended Implementation

**Use Option A** — populate `player_period_stats` during snapshot and query it for tenure-based stats.

### Backend Changes

1. **Snapshot orchestrator enhancement**: After writing roster snapshot, also write per-player period stats from ESPN data (ESPN provides individual player stats in the `kona_player_info` view)

2. **New API endpoint or extension**: `GET /api/leagues/:id/teams/:teamId/roster` already returns roster — extend response to include `tenureStats` computed by summing `player_period_stats.components_json` WHERE `team_id` matches

3. **Roster tenure computation**: Query to find first/last date a player was on a specific team from `team_roster_snapshot`, then sum their `player_period_stats` for those periods

### Frontend Changes

1. **PlayerStatLine enhancement**: Add "On Team" label option alongside "YTD" and "Proj RoS"
2. **Roster page**: Show tenure stats instead of (or alongside) full-season stats
3. **Waivers page**: Keep full-season stats for free agents, show tenure stats for "drop" candidates

## Key Files

| File | Change |
|------|--------|
| `packages/backend/src/agents/snapshot-orchestrator.ts` | Populate `player_period_stats` during daily snapshot |
| `packages/backend/src/adapters/espn.ts` | Ensure per-player stats are extracted from ESPN response |
| `packages/backend/src/api/recommendations.ts` | Extend roster endpoint with tenure stats |
| `packages/frontend/src/components/league/PlayerStatLine.tsx` | Add "On Team" label |
| `packages/frontend/src/app/leagues/[id]/lineup/page.tsx` | Wire tenure stats |
| `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` | Wire tenure stats for drop candidates |
| `packages/shared/src/types.ts` | PlayerPeriodStats interface (already exists) |

## Validation Architecture

### Testable Outcomes
1. `player_period_stats` rows created during daily snapshot (not just backfill)
2. API returns `tenureStats` with correct component sums for roster tenure period
3. Frontend shows "On Team" stats that differ from full-season when player was traded
4. Rate stats (AVG, ERA, WHIP) computed from summed components, not averaged

## RESEARCH COMPLETE

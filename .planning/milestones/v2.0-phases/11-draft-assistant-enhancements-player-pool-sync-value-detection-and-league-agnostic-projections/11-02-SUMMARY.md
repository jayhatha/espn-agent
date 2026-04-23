---
phase: 11-draft-assistant-enhancements-player-pool-sync-value-detection-and-league-agnostic-projections
plan: 02
subsystem: backend
tags: [player-pool, espn-sync, cron, infrastructure]
dependency_graph:
  requires: []
  provides: [daily-player-pool-sync, player-ownership-data, current-season-stats]
  affects: [draft-assistant, waiver-recommendations, value-detection]
tech_stack:
  added: [node-cron]
  patterns: [cron-worker, idempotent-sync, upsert-pattern]
key_files:
  created:
    - packages/backend/src/db/migrations/007_add_player_pool_columns.sql
    - packages/backend/src/agents/player-pool-sync.ts
    - packages/backend/src/workers/player-pool-worker.ts
  modified:
    - packages/backend/package.json
decisions:
  - title: "node-cron over BullMQ for daily sync"
    rationale: "Simple daily job with no queue coordination needed, avoids Redis dependency for this worker"
  - title: "Generic ESPN league for player pool data"
    rationale: "Top players by ownership don't require league-specific auth, reduces coupling"
  - title: "4 AM ET schedule"
    rationale: "ESPN updates overnight after West Coast games (11 PM PT = 2 AM ET), 4 AM gives 2-hour buffer"
  - title: "Keep stale data on failure"
    rationale: "Preserve existing player data when ESPN API fails, mark success=false but don't delete"
  - title: "Filter players with <1% ownership"
    rationale: "Focus on relevant players, avoid deep benches and noise"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_created: 3
  files_modified: 1
  commits: 2
  completed_at: "2026-02-25T20:42:21Z"
---

# Phase 11 Plan 02: Player Pool Sync Infrastructure Summary

**One-liner:** Daily ESPN player pool sync at 4 AM ET storing ownership and current season stats for top 500 players

## What Was Built

Created backend infrastructure for daily automated synchronization of ESPN player universe to local database:

1. **Database Migration (007):** Extended player table with `pct_owned`, `current_season_stats_json`, and `last_synced_at` columns
2. **PlayerPoolSyncAgent:** Fetches top 500 players by ownership from ESPN, extracts current season counting stats, upserts to player table
3. **Cron Worker:** Schedules daily sync at 4 AM Eastern Time using node-cron, handles graceful shutdown

## Implementation Details

### Database Schema Extension

```sql
ALTER TABLE player
  ADD COLUMN pct_owned NUMERIC(5,2),
  ADD COLUMN current_season_stats_json JSONB,
  ADD COLUMN last_synced_at TIMESTAMP;
```

Stores ownership percentage (0-100), counting stats as JSONB (AB, H, R, HR, RBI, SB, BB, IP, K, W, SV, HLD, QS), and sync timestamp.

### PlayerPoolSyncAgent Logic

- Fetches from ESPN generic league (ID 1) with `kona_player_info` view
- Filters by status: FREEAGENT, WAIVERS, ONTEAM
- Sorts by `percentOwned` descending, limits to 500 players
- Skips players with <1% ownership
- Extracts season stats from `statSplitTypeId=0` (full season cumulative)
- Upserts using conflict detection on `espn_player_id`
- Returns `SyncResult` with success flag and counts

### Error Handling

- Wraps ESPN fetch in try/catch
- Logs detailed errors with ESPN response context
- On failure: returns `success=false` but preserves existing player data
- Continues processing remaining players if individual upsert fails

### Cron Schedule

- **Timing:** 4:00 AM Eastern Time (`0 4 * * *`)
- **Timezone:** America/New_York
- **Rationale:** ESPN updates stats overnight after West Coast games end (11 PM PT = 2 AM ET), 4 AM provides 2-hour buffer

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**Migration:**
- [x] Migration file contains ALTER TABLE statements
- [x] pct_owned, current_season_stats_json, last_synced_at columns added
- [x] Index created on last_synced_at
- [x] Comments added for documentation

**Agent:**
- [x] PlayerPoolSyncAgent class exported
- [x] SyncResult interface defined
- [x] Fetches players from ESPN generic league
- [x] Upsert logic handles conflicts
- [x] Error handling keeps stale data

**Worker:**
- [x] node-cron dependency installed
- [x] worker:player-pool script added to package.json
- [x] Cron schedule set to 4 AM ET
- [x] Worker starts without errors
- [x] Graceful shutdown handlers present

## Integration Points

### Upstream Dependencies
- ESPNAdapter (existing) - fetchLeague method with kona_player_info view
- Database connection (existing) - getDb() from connection.ts

### Downstream Consumers (Future)
- Draft Assistant - will use pct_owned for ownership trends
- Waiver Recommendations - will compare current stats to projections
- Value Detection - will use current_season_stats_json for real-time value

## Task Breakdown

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create player pool database migration and sync agent | 82296da | 007_add_player_pool_columns.sql, player-pool-sync.ts |
| 2 | Create cron worker for daily player pool sync | 1a5764e | player-pool-worker.ts, package.json |

## Commits

- `82296da`: feat(11-02): create player pool database migration and sync agent
- `1a5764e`: feat(11-02): create cron worker for daily player pool sync

## Self-Check: PASSED

**Files created:**
- [x] packages/backend/src/db/migrations/007_add_player_pool_columns.sql
- [x] packages/backend/src/agents/player-pool-sync.ts
- [x] packages/backend/src/workers/player-pool-worker.ts

**Files modified:**
- [x] packages/backend/package.json (added worker script + dependencies)

**Commits exist:**
- [x] 82296da: feat(11-02): create player pool database migration and sync agent
- [x] 1a5764e: feat(11-02): create cron worker for daily player pool sync

All files verified present. All commits verified in git log.

## Next Steps

**Immediate (within plan 11-02):**
- None - plan complete

**Follow-up (subsequent plans):**
1. Plan 11-03: Detect league configuration from snapshot data (scoring, roster slots)
2. Plan 11-04: Add value indicators to draft UI (color-coded tiers, scarcity badges)
3. Plan 11-05: Create draft-generic projected standings API using league config

**Manual Testing (post-deployment):**
1. Start worker: `pnpm --filter @espn-fantasy/backend worker:player-pool`
2. For immediate test: modify cron to `*/1 * * * *` (every minute)
3. Check logs for sync execution
4. Query database: `SELECT COUNT(*), MAX(last_synced_at) FROM player WHERE last_synced_at IS NOT NULL;`
5. Verify player data: `SELECT espn_player_id, name, pct_owned, current_season_stats_json FROM player LIMIT 10;`
6. Restore cron to `0 4 * * *`

**Production Deployment Notes:**
- Worker must run as separate process alongside main API server
- Add to Railway Procfile or docker-compose: `player_pool_worker: pnpm --filter @espn-fantasy/backend worker:player-pool`
- Monitor logs for daily execution at 4 AM ET
- Set DATABASE_URL environment variable
- Optional: Set LOG_LEVEL=debug for detailed sync logs

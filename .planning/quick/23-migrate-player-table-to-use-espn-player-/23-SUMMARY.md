---
phase: quick-23
plan: 01
subsystem: database
tags: [schema-migration, player-id, simplification]
dependency_graph:
  requires: [initial-schema, player-table]
  provides: [espn-player-id-as-primary-key]
  affects: [player-queries, foreign-key-relationships]
tech_stack:
  added: []
  patterns: [null-safe-updates, temporary-mapping-table, onConflict-with-id]
key_files:
  created:
    - packages/backend/src/db/migrations/016_migrate_player_id_to_espn.sql
  modified:
    - packages/backend/src/db/schema.ts
    - packages/shared/src/types.ts
    - packages/backend/src/agents/snapshot-orchestrator.ts
    - packages/backend/src/agents/player-pool-sync.ts
    - packages/backend/src/agents/player-identity.ts
    - packages/backend/src/api/recommendations.ts
    - packages/backend/src/agents/trade-recommendation.ts
    - packages/backend/src/agents/waiver-recommendation.ts
decisions:
  - decision: "Use temporary mapping table to preserve old_id -> espn_player_id relationships"
    rationale: "Enables safe foreign key updates without data loss"
    alternatives: ["Direct UPDATE without mapping (risky)", "Multi-step migration with downtime"]
  - decision: "COALESCE in UPDATE statements for NULL-safe foreign key updates"
    rationale: "transaction_impact has nullable player_gained_id/player_lost_id columns"
    alternatives: ["WHERE player_id IS NOT NULL guards (more verbose)"]
  - decision: "Select id AS espn_player_id in queries for backward compatibility"
    rationale: "API response contracts expect espnPlayerId field - aliasing preserves compatibility"
    alternatives: ["Rename all response fields to playerId (breaking change)"]
metrics:
  duration_minutes: 4
  completed_date: "2026-02-28"
  tasks_completed: 3
  files_modified: 9
  commits: 3
---

# Quick Task 23: Migrate Player Table to Use ESPN Player ID

**One-liner:** Eliminate redundant espn_player_id column by making player.id the ESPN player ID directly, simplifying foreign key relationships across 8 tables.

## Overview

Migrated player table from auto-increment primary key to ESPN player ID as primary key. This fixes auction validation issues where ESPN player IDs didn't match internal IDs and simplifies the data model by removing the redundant espn_player_id column.

## Tasks Completed

### Task 1: Create Database Migration (713d502)

Created migration 016_migrate_player_id_to_espn.sql with 10 steps:

1. **Temporary mapping table** - Preserved old_id -> espn_player_id relationships for foreign key updates
2. **Drop 8 foreign key constraints** - Removed constraints on player_identity_map, player_projection, team_roster_snapshot, player_period_stats, roster_move, transaction_impact (2 columns), injury_event, league_free_agent_snapshot
3. **Drop primary key constraint** - Removed player_pkey and player_id_seq auto-increment sequence
4. **Drop unique constraint** - Removed player_espn_player_id_key and idx_player_espn index
5. **Update player.id values** - Core transformation: `UPDATE player SET id = espn_player_id`
6. **Add PRIMARY KEY** - Made player.id the new primary key
7. **Update 8 foreign key tables** - Used mapping table with COALESCE for NULL-safe updates:
   - player_identity_map, player_projection, team_roster_snapshot, player_period_stats, roster_move
   - transaction_impact (both player_gained_id and player_lost_id with NULL handling)
   - injury_event, league_free_agent_snapshot
8. **Drop espn_player_id column** - Removed redundant column after data migration
9. **Recreate foreign key constraints** - All 8 constraints recreated with ON DELETE CASCADE
10. **Drop temporary mapping table** - Cleanup

**Migration features:**
- Idempotent (works on empty player table)
- NULL-safe updates for nullable foreign keys (transaction_impact)
- Preserves all data integrity through temporary mapping

### Task 2: Update TypeScript Schema Definitions (92abff1)

**packages/backend/src/db/schema.ts:**
- Changed `player: WithGeneratedId<Player>` to `player: Player`
- Removed Generated wrapper since id is no longer auto-incremented

**packages/shared/src/types.ts:**
- Updated Player interface comment: `id: number; // ESPN player ID (primary key)`
- Removed `espn_player_id` field (now redundant)
- Kept all other fields unchanged

**Verification:** `pnpm --filter backend build && pnpm --filter shared build` succeeded after all code updates.

### Task 3: Update All Code References (5abc22b)

Updated 6 files to use `id` instead of `espn_player_id`:

**snapshot-orchestrator.ts:**
- Changed `.where("espn_player_id", "=", entry.espnPlayerId)` → `.where("id", "=", entry.espnPlayerId)`
- Changed `.values({ espn_player_id: entry.espnPlayerId, ... })` → `.values({ id: entry.espnPlayerId, ... })`
- Changed `.onConflict((oc) => oc.column("espn_player_id")...)` → `.onConflict((oc) => oc.column("id")...)`
- Simplified espnPlayerIdToDbId mapping (now identity mapping: `map.set(row.id, row.id)`)
- Updated 3 separate upsert locations (roster players, free agents from raw payload, free agents from ESPN API)

**player-pool-sync.ts:**
- Changed `.select(["id", "espn_player_id"])` → `.select(["id"])`
- Changed `.where("espn_player_id", "in", espnPlayerIds)` → `.where("id", "in", espnPlayerIds)`
- Changed `existingPlayers.map((p) => p.espn_player_id)` → `existingPlayers.map((p) => p.id)`
- Changed batch insert `.values({ espn_player_id: p.espnPlayerId, ... })` → `.values({ id: p.espnPlayerId, ... })`
- Changed batch update `.where("espn_player_id", "=", playerData.espnPlayerId)` → `.where("id", "=", playerData.espnPlayerId)`

**player-identity.ts:**
- Changed `.where("espn_player_id", "=", espnPlayerId)` → `.where("id", "=", espnPlayerId)`

**recommendations.ts (4 locations):**
- Changed `.values({ espn_player_id: fa.playerId, ... })` → `.values({ id: fa.playerId, ... })`
- Changed `.onConflict((oc) => oc.column("espn_player_id")...)` → `.onConflict((oc) => oc.column("id")...)`
- Changed `.select(["p.id as player_id", "p.espn_player_id", ...])` → `.select(["p.id as player_id", "p.id as espn_player_id", ...])`
  - **Aliasing pattern:** Selected `id AS espn_player_id` to maintain backward compatibility with API response contracts
- Changed `.where("p.espn_player_id", "in", espnPlayerIds)` → `.where("p.id", "in", espnPlayerIds)`
- Updated 3 roster query locations (free agents, user roster, both trade partner rosters)

**trade-recommendation.ts:**
- Changed `.select(["roster.player_id", "player.espn_player_id", ...])` → `.select(["roster.player_id", "player.id as espn_player_id", ...])`

**waiver-recommendation.ts:**
- Changed `.where("espn_player_id", "in", espnPlayerIds)` → `.where("id", "in", espnPlayerIds)`

**Backward compatibility:** API endpoints continue to return `espnPlayerId` field by aliasing `player.id as espn_player_id` in SELECT statements.

## Verification

1. **Schema consistency:** TypeScript compilation succeeded in both backend and shared packages
2. **Migration SQL validity:** 42 critical SQL statements (UPDATE/ALTER TABLE/DROP) verified
3. **Foreign key coverage:** All 8 tables with player_id foreign keys updated (60 occurrences in migration)
4. **Code references:** All 6 files with espn_player_id references updated
5. **Compilation:** `pnpm --filter backend build` succeeded with zero errors

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria

- [x] Migration file 016_migrate_player_id_to_espn.sql exists with all 10 steps
- [x] Player type in types.ts has `id: number` (ESPN player ID) and no `espn_player_id` field
- [x] Database schema.ts has `player: Player` (not WithGeneratedId)
- [x] Snapshot orchestrator uses `onConflict("id")` and `id: entry.espnPlayerId` in insert
- [x] TypeScript compilation succeeds (pnpm build in backend + shared packages)
- [x] Migration includes UPDATE statements for all 8 foreign key relationships
- [x] Migration is idempotent (can run on empty player table)

## Self-Check: PASSED

**Created files:**
- [x] FOUND: packages/backend/src/db/migrations/016_migrate_player_id_to_espn.sql

**Modified files:**
- [x] FOUND: packages/backend/src/db/schema.ts (player: Player instead of WithGeneratedId<Player>)
- [x] FOUND: packages/shared/src/types.ts (id comment updated, espn_player_id removed)
- [x] FOUND: packages/backend/src/agents/snapshot-orchestrator.ts (onConflict uses "id")
- [x] FOUND: packages/backend/src/agents/player-pool-sync.ts (batch operations use id)
- [x] FOUND: packages/backend/src/agents/player-identity.ts (where clause uses id)
- [x] FOUND: packages/backend/src/api/recommendations.ts (selects id as espn_player_id)
- [x] FOUND: packages/backend/src/agents/trade-recommendation.ts (select id as espn_player_id)
- [x] FOUND: packages/backend/src/agents/waiver-recommendation.ts (where clause uses id)

**Commits:**
- [x] FOUND: 713d502 (migration file)
- [x] FOUND: 92abff1 (TypeScript schema updates)
- [x] FOUND: 5abc22b (code reference updates)

## Impact

**Immediate:**
- Fixes auction validation issue where ESPN player IDs didn't match internal player IDs
- Simplifies player table schema (one less column, one less index)
- Removes mapping overhead in queries (no need to translate ESPN ID to internal ID)

**Future:**
- Migration must be run on development/staging before deployment (destructive schema change)
- Existing player data preserved through temporary mapping table
- Foreign key relationships maintained with ON DELETE CASCADE

## Notes

**Migration not executed:** This migration requires careful testing on a development database before running in production. It performs destructive schema changes (drops constraints, drops columns) but preserves all data through the temporary mapping table.

**Aliasing for compatibility:** API responses continue to include `espnPlayerId` field by selecting `player.id AS espn_player_id`. This maintains backward compatibility with existing frontend code and extension.

**Identity mapping simplification:** The `espnPlayerIdToDbId` mapping in snapshot-orchestrator is now an identity mapping (`map.set(row.id, row.id)`) since player.id IS the ESPN player ID. This code could be further simplified in a future refactor, but keeping it preserves the existing control flow.

---
phase: quick-23
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/db/migrations/016_migrate_player_id_to_espn.sql
  - packages/backend/src/db/schema.ts
  - packages/shared/src/types.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Player table uses ESPN player IDs as primary key"
    - "Foreign keys reference player.id (now ESPN player IDs)"
    - "Existing player data preserved if any exists"
    - "Projection ingest continues using name matching (no change)"
  artifacts:
    - path: "packages/backend/src/db/migrations/016_migrate_player_id_to_espn.sql"
      provides: "Database migration to switch player.id from auto-increment to espn_player_id"
      min_lines: 50
    - path: "packages/backend/src/db/schema.ts"
      provides: "Updated Player interface removing Generated wrapper from id"
      contains: "player: Player"
    - path: "packages/shared/src/types.ts"
      provides: "Updated Player type with id as ESPN player ID"
      contains: "id: number"
  key_links:
    - from: "016_migrate_player_id_to_espn.sql"
      to: "player table definition"
      via: "ALTER TABLE statements"
      pattern: "DROP CONSTRAINT.*PRIMARY KEY|ADD PRIMARY KEY"
    - from: "schema.ts Database interface"
      to: "Player type"
      via: "type reference (no longer WithGeneratedId)"
      pattern: "player: Player"
---

<objective>
Migrate player table to use ESPN player IDs as primary keys instead of auto-increment IDs, updating all foreign key relationships.

Purpose: Fix auction validation issue where ESPN player IDs don't match our internal IDs, simplify data model by eliminating redundant ID column.
Output: Migration file, updated TypeScript schema definitions.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/jay-work/Code/espn-agent/CLAUDE.md
@/Users/jay-work/Code/espn-agent/packages/backend/src/db/migrations/001_initial_schema.sql
@/Users/jay-work/Code/espn-agent/packages/backend/src/db/schema.ts
@/Users/jay-work/Code/espn-agent/packages/shared/src/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create database migration to switch player.id from auto-increment to ESPN player ID</name>
  <files>packages/backend/src/db/migrations/016_migrate_player_id_to_espn.sql</files>
  <action>
Create migration 016_migrate_player_id_to_espn.sql with the following steps:

1. **Create temporary mapping table** to preserve old_id -> espn_player_id relationships for updating foreign keys
2. **Drop all foreign key constraints** that reference player(id):
   - player_identity_map.player_id
   - player_projection.player_id
   - team_roster_snapshot.player_id
   - player_period_stats.player_id
   - roster_move.player_id (added/dropped)
   - injury_event.player_id
   - league_free_agent_snapshot.player_id
3. **Drop player.id primary key constraint** and the auto-increment sequence
4. **Drop the unique constraint** on espn_player_id (will become primary key)
5. **Update player.id values** to match espn_player_id: `UPDATE player SET id = espn_player_id`
6. **Add PRIMARY KEY constraint** on player.id
7. **Update all foreign key columns** using the mapping table:
   - player_identity_map: `UPDATE player_identity_map pim SET player_id = (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = pim.player_id)`
   - player_projection: `UPDATE player_projection pp SET player_id = (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = pp.player_id)`
   - team_roster_snapshot: `UPDATE team_roster_snapshot trs SET player_id = (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = trs.player_id)`
   - player_period_stats: `UPDATE player_period_stats pps SET player_id = (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = pps.player_id)`
   - roster_move (added_player_id and dropped_player_id): Update both columns
   - injury_event: `UPDATE injury_event ie SET player_id = (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = ie.player_id)`
   - league_free_agent_snapshot: `UPDATE league_free_agent_snapshot lfa SET player_id = (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = lfa.player_id)`
8. **Drop espn_player_id column** (now redundant)
9. **Recreate all foreign key constraints** with ON DELETE CASCADE
10. **Drop temporary mapping table**

Include comments explaining each step. Handle the case where player table might be empty (migration should be idempotent).

PostgreSQL-specific note: Use `ALTER TABLE player DROP CONSTRAINT player_pkey` to drop primary key, `DROP SEQUENCE IF EXISTS player_id_seq CASCADE` to remove auto-increment.
  </action>
  <verify>
- Read migration file to confirm all 10 steps present
- Check migration includes UPDATE statements for all 7+ foreign key tables
- Verify espn_player_id column is dropped after data migration
- Confirm all foreign key constraints are recreated
  </verify>
  <done>Migration file exists with complete player.id swap logic, all foreign key updates, and constraint recreation</done>
</task>

<task type="auto">
  <name>Task 2: Update TypeScript schema definitions to reflect player.id as ESPN player ID</name>
  <files>
    packages/backend/src/db/schema.ts
    packages/shared/src/types.ts
  </files>
  <action>
**packages/backend/src/db/schema.ts:**
1. Change `player: WithGeneratedId<Player>` to `player: Player` (line 38) — player.id is no longer auto-generated
2. Keep all other table definitions unchanged

**packages/shared/src/types.ts:**
1. Update Player interface (around line 83-96):
   - Change comment for `id` field to indicate it's the ESPN player ID: `id: number; // ESPN player ID (primary key)`
   - Remove `espn_player_id` field (now redundant with id)
2. Keep all other fields unchanged (name, mlb_team, positions, bats_throws, created_at, pct_owned, current_season_stats_json, last_synced_at, injury_status, injury_updated_at)

DO NOT modify any code that references `player.id` — after migration runs, player.id will contain ESPN player IDs, so existing queries work as-is. The snapshot orchestrator already uses `onConflict("espn_player_id")` which will need to change to `onConflict("id")`, but that's a separate task (not in this migration).

Note: Snapshot orchestrator currently does `.returning("id").executeTakeFirstOrThrow()` and uses that ID in foreign key inserts — this will continue to work because player.id will BE the ESPN player ID after migration.
  </action>
  <verify>
- `git diff packages/backend/src/db/schema.ts` shows `player: Player` (not WithGeneratedId)
- `git diff packages/shared/src/types.ts` shows Player interface has comment indicating id is ESPN player ID
- `git diff packages/shared/src/types.ts` shows espn_player_id field removed
- Run `pnpm --filter backend build && pnpm --filter shared build` to confirm TypeScript compiles
  </verify>
  <done>Schema files updated, espn_player_id field removed, TypeScript compiles without errors</done>
</task>

<task type="auto">
  <name>Task 3: Update snapshot orchestrator to use id instead of espn_player_id in onConflict</name>
  <files>packages/backend/src/agents/snapshot-orchestrator.ts</files>
  <action>
Update writePlayersAndRosters method (around line 450-470):

1. Change `.onConflict((oc) => oc.column("espn_player_id").doUpdateSet({` to `.onConflict((oc) => oc.column("id").doUpdateSet({`
2. In the `.insertInto("player").values({` call, change `espn_player_id: entry.espnPlayerId` to `id: entry.espnPlayerId`
3. Remove `espn_player_id` from the values object
4. Keep `name`, `mlb_team`, `positions`, `injury_status`, `injury_updated_at`, `created_at` unchanged
5. In the `.onConflict().doUpdateSet()`, remove the `espn_player_id` field update (only update `name`, `mlb_team`, `positions`, `injury_status`, `injury_updated_at`)

DO NOT change the `.returning("id")` call — this now returns the ESPN player ID directly, which is exactly what we want for foreign key inserts.

DO NOT change the `existingPlayer` query — it already queries by `espn_player_id`, which will need to change to `id`. Update line ~445: `.where("espn_player_id", "=", entry.espnPlayerId)` to `.where("id", "=", entry.espnPlayerId)`.
  </action>
  <verify>
- `git diff packages/backend/src/agents/snapshot-orchestrator.ts` shows onConflict uses `"id"` instead of `"espn_player_id"`
- Verify insertInto values has `id: entry.espnPlayerId` (not espn_player_id)
- Verify existingPlayer query uses `where("id", "=", entry.espnPlayerId)`
- Run `pnpm --filter backend build` to confirm TypeScript compiles
  </verify>
  <done>Snapshot orchestrator updated to use player.id directly, compilation successful</done>
</task>

</tasks>

<verification>
Overall migration verification:

1. **Schema consistency:** `pnpm --filter backend build && pnpm --filter shared build` compiles without TypeScript errors
2. **Migration SQL validity:** Run `cat packages/backend/src/db/migrations/016_migrate_player_id_to_espn.sql | grep -E "UPDATE|ALTER TABLE|DROP"` to verify all critical statements present
3. **Foreign key coverage:** Grep migration for each foreign key table: `grep -c "player_projection\|team_roster_snapshot\|player_period_stats\|roster_move\|injury_event\|league_free_agent_snapshot\|player_identity_map" packages/backend/src/db/migrations/016_migrate_player_id_to_espn.sql` (should return 7+)

DO NOT run the migration yet — this is a destructive schema change that requires careful testing on a development database first.
</verification>

<success_criteria>
Migration complete when:

1. Migration file 016_migrate_player_id_to_espn.sql exists with all 10 steps (mapping table, drop constraints, swap IDs, recreate constraints)
2. Player type in types.ts has `id: number` (ESPN player ID) and no `espn_player_id` field
3. Database schema.ts has `player: Player` (not WithGeneratedId)
4. Snapshot orchestrator uses `onConflict("id")` and `id: entry.espnPlayerId` in insert
5. TypeScript compilation succeeds (pnpm build in backend + shared packages)
6. Migration includes UPDATE statements for all 7+ foreign key relationships
7. Migration is idempotent (can run on empty player table)
</success_criteria>

<output>
After completion, create `.planning/quick/23-migrate-player-table-to-use-espn-player-/23-SUMMARY.md`
</output>

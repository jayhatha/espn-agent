-- Migration 016: Migrate player.id from auto-increment to ESPN player ID
-- This eliminates the redundant espn_player_id column and simplifies player references
-- across all foreign key relationships.

-- Step 1: Create temporary mapping table to preserve old_id -> espn_player_id relationships
CREATE TEMPORARY TABLE temp_player_id_map AS
SELECT id AS old_id, espn_player_id
FROM player;

-- Step 2: Drop all foreign key constraints that reference player(id)
-- These will be recreated in Step 9 after the ID swap

-- player_identity_map.player_id
ALTER TABLE player_identity_map
  DROP CONSTRAINT IF EXISTS player_identity_map_player_id_fkey;

-- player_projection.player_id
ALTER TABLE player_projection
  DROP CONSTRAINT IF EXISTS player_projection_player_id_fkey;

-- team_roster_snapshot.player_id
ALTER TABLE team_roster_snapshot
  DROP CONSTRAINT IF EXISTS team_roster_snapshot_player_id_fkey;

-- player_period_stats.player_id
ALTER TABLE player_period_stats
  DROP CONSTRAINT IF EXISTS player_period_stats_player_id_fkey;

-- roster_move.player_id
ALTER TABLE roster_move
  DROP CONSTRAINT IF EXISTS roster_move_player_id_fkey;

-- transaction_impact.player_gained_id and player_lost_id
ALTER TABLE transaction_impact
  DROP CONSTRAINT IF EXISTS transaction_impact_player_gained_id_fkey,
  DROP CONSTRAINT IF EXISTS transaction_impact_player_lost_id_fkey;

-- injury_event.player_id
ALTER TABLE injury_event
  DROP CONSTRAINT IF EXISTS injury_event_player_id_fkey;

-- league_free_agent_snapshot.player_id
ALTER TABLE league_free_agent_snapshot
  DROP CONSTRAINT IF EXISTS league_free_agent_snapshot_player_id_fkey;

-- Step 3: Drop player.id primary key constraint and the auto-increment sequence
ALTER TABLE player DROP CONSTRAINT IF EXISTS player_pkey;
DROP SEQUENCE IF EXISTS player_id_seq CASCADE;

-- Step 4: Drop the unique constraint on espn_player_id (will become primary key)
ALTER TABLE player DROP CONSTRAINT IF EXISTS player_espn_player_id_key;

-- Also drop the index on espn_player_id since it's no longer needed
DROP INDEX IF EXISTS idx_player_espn;

-- Step 5: Update player.id values to match espn_player_id
-- This is the core transformation: id now contains ESPN player IDs
UPDATE player SET id = espn_player_id;

-- Step 6: Add PRIMARY KEY constraint on player.id
ALTER TABLE player ADD PRIMARY KEY (id);

-- Step 7: Update all foreign key columns using the mapping table
-- Handle NULL-safe updates with COALESCE to preserve existing NULLs

-- player_identity_map: Update player_id
UPDATE player_identity_map pim
SET player_id = COALESCE(
  (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = pim.player_id),
  pim.player_id
);

-- player_projection: Update player_id
UPDATE player_projection pp
SET player_id = COALESCE(
  (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = pp.player_id),
  pp.player_id
);

-- team_roster_snapshot: Update player_id
UPDATE team_roster_snapshot trs
SET player_id = COALESCE(
  (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = trs.player_id),
  trs.player_id
);

-- player_period_stats: Update player_id
UPDATE player_period_stats pps
SET player_id = COALESCE(
  (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = pps.player_id),
  pps.player_id
);

-- roster_move: Update player_id
UPDATE roster_move rm
SET player_id = COALESCE(
  (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = rm.player_id),
  rm.player_id
);

-- transaction_impact: Update player_gained_id (nullable)
UPDATE transaction_impact ti
SET player_gained_id = (
  SELECT espn_player_id FROM temp_player_id_map WHERE old_id = ti.player_gained_id
)
WHERE player_gained_id IS NOT NULL;

-- transaction_impact: Update player_lost_id (nullable)
UPDATE transaction_impact ti
SET player_lost_id = (
  SELECT espn_player_id FROM temp_player_id_map WHERE old_id = ti.player_lost_id
)
WHERE player_lost_id IS NOT NULL;

-- injury_event: Update player_id
UPDATE injury_event ie
SET player_id = COALESCE(
  (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = ie.player_id),
  ie.player_id
);

-- league_free_agent_snapshot: Update player_id
UPDATE league_free_agent_snapshot lfa
SET player_id = COALESCE(
  (SELECT espn_player_id FROM temp_player_id_map WHERE old_id = lfa.player_id),
  lfa.player_id
);

-- Step 8: Drop espn_player_id column (now redundant)
ALTER TABLE player DROP COLUMN IF EXISTS espn_player_id;

-- Step 9: Recreate all foreign key constraints with ON DELETE CASCADE
-- This ensures referential integrity is maintained with the new ID scheme

ALTER TABLE player_identity_map
  ADD CONSTRAINT player_identity_map_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE;

ALTER TABLE player_projection
  ADD CONSTRAINT player_projection_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE;

ALTER TABLE team_roster_snapshot
  ADD CONSTRAINT team_roster_snapshot_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE;

ALTER TABLE player_period_stats
  ADD CONSTRAINT player_period_stats_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE;

ALTER TABLE roster_move
  ADD CONSTRAINT roster_move_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE;

ALTER TABLE transaction_impact
  ADD CONSTRAINT transaction_impact_player_gained_id_fkey
  FOREIGN KEY (player_gained_id) REFERENCES player(id) ON DELETE CASCADE,
  ADD CONSTRAINT transaction_impact_player_lost_id_fkey
  FOREIGN KEY (player_lost_id) REFERENCES player(id) ON DELETE CASCADE;

ALTER TABLE injury_event
  ADD CONSTRAINT injury_event_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE;

ALTER TABLE league_free_agent_snapshot
  ADD CONSTRAINT league_free_agent_snapshot_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE;

-- Step 10: Drop temporary mapping table
DROP TABLE IF EXISTS temp_player_id_map;

-- Migration complete: player.id now contains ESPN player IDs
-- All foreign key relationships preserved and constraints recreated

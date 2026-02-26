-- Migration 012: Add league_free_agent_snapshot table
-- Stores free agent players available at each snapshot date with ownership data

CREATE TABLE IF NOT EXISTS league_free_agent_snapshot (
  league_id INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  player_id INTEGER NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  ownership_pct DECIMAL(5, 2) DEFAULT 0,
  started_pct DECIMAL(5, 2) DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, snapshot_date, player_id)
);

-- Index for querying free agents by league and date
CREATE INDEX idx_free_agent_snapshot_league_date
  ON league_free_agent_snapshot(league_id, snapshot_date);

-- Index for querying free agents by player across leagues
CREATE INDEX idx_free_agent_snapshot_player
  ON league_free_agent_snapshot(player_id);

-- Phase 74: Season finalization flag to skip projection recomputation for completed seasons

CREATE TABLE IF NOT EXISTS season_metadata (
  league_id      INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  season         INTEGER NOT NULL,
  is_finalized   BOOLEAN NOT NULL DEFAULT FALSE,
  finalized_at   TIMESTAMP,
  snapshot_count INTEGER,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (league_id, season)
);

CREATE INDEX IF NOT EXISTS idx_season_metadata_league
  ON season_metadata (league_id, season);

COMMENT ON TABLE season_metadata IS
  'Tracks finalized seasons where projection recomputation is skipped';
